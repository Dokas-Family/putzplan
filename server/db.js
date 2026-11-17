// SQLite-Datenbank (eine Datei) und Foto-Ablage.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../shared/logic.js';

export const DATA = process.env.DATA_DIR || join(process.cwd(), 'data');
export const PHOTOS = join(DATA, 'photos');
mkdirSync(PHOTOS, { recursive: true });

export const db = new DatabaseSync(join(DATA, 'putzplan.db'));
db.exec(`
  pragma journal_mode = wal;
  pragma busy_timeout = 5000;
  create table if not exists meta (key text primary key, value text);
  create table if not exists members (
    id text primary key, name text not null, emoji text, role text not null default 'mitglied',
    w_weekday real default 1, w_weekend real default 1, waschtag integer, active integer default 1,
    pin_hash text, sort integer default 0, rain text, titel text, away_from text, away_to text);
  create table if not exists tasks (
    id text primary key, title text not null, room text, freq text default 'daily', day integer default 0,
    minutes integer default 5, points integer, leicht integer default 0, per_person integer default 0,
    active integer default 1, proposed_by text);
  create table if not exists entries (
    id text primary key, task_id text, title text, member_id text, period text, slot text default '',
    status text, before_photo text, before_at text, after_photo text, after_at text, points integer default 0,
    note text, helpers text default '[]', created_by text, created_at text, review text, review_note text);
  create unique index if not exists entries_once on entries (task_id, period, slot) where status <> 'rejected' and task_id <> 'adhoc';
  create index if not exists entries_created on entries (created_at);
  create table if not exists reactions (id text primary key, entry_id text, member_id text, emoji text, text text, created_at text);
  create index if not exists reactions_entry on reactions (entry_id);
  create table if not exists push_subs (id text primary key, member_id text, sub text, created_at text);
  create table if not exists sessions (id text primary key, member_id text, created_at text, last_seen text);
  create table if not exists log (id integer primary key autoincrement, at text, member_id text, text text, undo text, undone integer default 0);
`);
// Spalten, die später dazugekommen sind
const hasCol = (table, col) => db.prepare(`pragma table_info(${table})`).all().some(r => r.name === col);
if (!hasCol('members', 'pin_help')) db.exec('alter table members add column pin_help text'); // Zeitpunkt von „PIN vergessen“
/** Dienst (wird reihum verteilt) oder Extra (freiwillig). Beim Einführen: alles ab 3 Punkten ist ein Dienst. */
export const PFLICHT_AB = 3;
const markDuties = () => db.exec(`update tasks set pflicht = 1 where per_person = 0 and coalesce(points, max(1, round(minutes / 5.0))) >= ${PFLICHT_AB}`);
if (!hasCol('tasks', 'pflicht')) { db.exec('alter table tasks add column pflicht integer default 0'); markDuties(); }
if (!hasCol('entries', 'before_video')) db.exec('alter table entries add column before_video text; alter table entries add column after_video text;');
if (!hasCol('entries', 'ai')) db.exec('alter table entries add column ai text'); // was Claude zu den Fotos meint (JSON)
if (!hasCol('reactions', 'reply_to')) db.exec('alter table reactions add column reply_to text'); // Antwort auf einen Kommentar
if (!hasCol('entries', 'pending')) db.exec("alter table entries add column pending text default '[]'"); // wer mithelfen möchte, aber noch nicht bestätigt ist
if (!hasCol('entries', 'fuer')) db.exec('alter table entries add column fuer text'); // Dienst für jemand anderen übernommen: für wen
if (!hasCol('members', 'ziel_min')) db.exec('alter table members add column ziel_min integer'); // eigenes Mindestziel pro Tag (sonst Standard)
// Chat mit Claude (je Person ein Verlauf) und Anträge, die Claude für die Admins stellt
db.exec(`
  create table if not exists chat (id text primary key, member_id text, role text, text text, photo text, actions text default '[]', cost real default 0, created_at text);
  create index if not exists chat_member on chat (member_id, created_at);
  create table if not exists antraege (id text primary key, member_id text, kind text, points integer, day text, reason text, proof text, status text default 'offen',
    by text, decided_by text, decided_at text, note text, created_at text);
`);
// Festgeschriebene Regeln je Person und Tag (Tagesziel, galt der Dienstplan?). Kennung "Person|JJJJ-MM-TT".
// Neue Regeln gelten so erst ab dem nächsten Tag und rechnen nie die Vergangenheit (und damit keine Serie) um.
db.exec('create table if not exists tage (id text primary key, member_id text, day text, goal integer, plan integer default 0, created_at text)');
export { markDuties };

const COLS = {
  members: ['id', 'name', 'emoji', 'role', 'w_weekday', 'w_weekend', 'waschtag', 'active', 'pin_hash', 'sort', 'rain', 'titel', 'away_from', 'away_to', 'pin_help', 'ziel_min'],
  tasks: ['id', 'title', 'room', 'freq', 'day', 'minutes', 'points', 'leicht', 'per_person', 'active', 'proposed_by', 'pflicht'],
  entries: ['id', 'task_id', 'title', 'member_id', 'period', 'slot', 'status', 'before_photo', 'before_at', 'after_photo', 'after_at', 'points', 'note', 'helpers', 'created_by', 'created_at', 'review', 'review_note', 'before_video', 'after_video', 'ai', 'pending', 'fuer'],
  reactions: ['id', 'entry_id', 'member_id', 'emoji', 'text', 'created_at', 'reply_to'],
  chat: ['id', 'member_id', 'role', 'text', 'photo', 'actions', 'cost', 'created_at'],
  antraege: ['id', 'member_id', 'kind', 'points', 'day', 'reason', 'proof', 'status', 'by', 'decided_by', 'decided_at', 'note', 'created_at'],
  tage: ['id', 'member_id', 'day', 'goal', 'plan', 'created_at'],
};
const BOOLS = { members: ['active'], tasks: ['leicht', 'per_person', 'active', 'pflicht'] };
const val = v => (v === undefined ? null : v === true ? 1 : v === false ? 0 : v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p.map(val)),
  all: (sql, ...p) => db.prepare(sql).all(...p.map(val)),
  run: (sql, ...p) => db.prepare(sql).run(...p.map(val)),
};
export const row = (table, id) => q.get(`select * from ${table} where id = ?`, id);
export function insert(table, r) {
  const cols = COLS[table].filter(c => r[c] !== undefined);
  q.run(`insert into ${table} (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`, ...cols.map(c => r[c]));
}
export function patch(table, id, p) {
  const cols = COLS[table].filter(c => c !== 'id' && p[c] !== undefined);
  if (cols.length) q.run(`update ${table} set ${cols.map(c => c + ' = ?').join(', ')} where id = ?`, ...cols.map(c => p[c]), id);
}
export const save = (table, r) => (row(table, r.id) ? patch(table, r.id, r) : insert(table, r));
export const remove = (table, id) => q.run(`delete from ${table} where id = ?`, id);

/** Zeile so, wie die App sie bekommt: echte Wahrheitswerte, Helfer als Liste, nie der PIN-Hash. */
export function out(table, r) {
  if (!r) return r;
  const o = { ...r };
  for (const b of BOOLS[table] || []) o[b] = !!o[b];
  if (table === 'entries') {
    try { o.helpers = JSON.parse(o.helpers || '[]'); } catch { o.helpers = []; }
    if (!Array.isArray(o.helpers)) o.helpers = [];
    try { o.ai = o.ai ? JSON.parse(o.ai) : null; } catch { o.ai = null; }
    try { o.pending = JSON.parse(o.pending || '[]'); } catch { o.pending = []; }
    if (!Array.isArray(o.pending)) o.pending = [];
  }
  if (table === 'chat') { try { o.actions = JSON.parse(o.actions || '[]'); } catch { o.actions = []; } delete o.cost; } // was es kostet, sieht nur der Admin-Überblick
  if (table === 'members') { o.has_pin = !!o.pin_hash; delete o.pin_hash; }
  if (table === 'log') { o.can_undo = !!o.undo && !o.undone; delete o.undo; o.undone = !!o.undone; }
  if (table === 'tage') return { id: o.id, goal: o.goal, plan: !!o.plan };
  return o;
}

// ---------- Einstellungen und andere Einzelwerte ----------
export const getMeta = (key, fallback = null) => { const r = q.get('select value from meta where key = ?', key); return r ? JSON.parse(r.value) : fallback; };
export const setMeta = (key, value) => q.run('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', key, JSON.stringify(value));
/** Regeln, dazu der erste Tag des Dienstplans (steht getrennt, damit Speichern der Regeln ihn nicht verliert). */
export const settings = () => ({ ...DEFAULT_SETTINGS, ...getMeta('settings', {}), plan_start: getMeta('plan_start') });
/** Wann scripts/backup.sh zuletzt erfolgreich gelaufen ist (oder null, wenn noch nie). */
export const lastBackup = () => { try { return readFileSync(join(DATA, '.letzte-sicherung'), 'utf8').trim() || null; } catch { return null; } };
export const newCode = () => randomBytes(12).toString('base64url');
export function inviteCode() {
  let c = getMeta('code');
  if (!c) { c = newCode(); setMeta('code', c); }
  return c;
}

/** Zustand der letzten 40 Tage, so wie ihn die gemeinsamen Regeln (shared/logic.js) erwarten. */
export const since40 = () => new Date(Date.now() - 40 * 864e5).toISOString();
/** Festgeschriebene Tagesregeln der letzten 70 Tage als { "Person|Tag": { goal, plan } }. */
export function tageMap() {
  const from = new Date(Date.now() - 70 * 864e5).toISOString().slice(0, 10);
  return Object.fromEntries(q.all('select * from tage where day >= ?', from).map(r => [r.id, out('tage', r)]));
}
export function logicState() {
  return {
    members: q.all('select * from members order by sort, name').map(r => out('members', r)),
    tasks: q.all('select * from tasks').map(r => out('tasks', r)),
    entries: q.all("select * from entries where created_at >= ? or status in ('todo', 'started') order by created_at desc", since40()).map(r => out('entries', r)),
    settings: settings(),
    tage: tageMap(),
  };
}

// ---------- Fotos ----------
const SAFE = /^[a-z0-9-]{8,80}$/;
function decode(dataUrl, maxBytes, what) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error(`${what} fehlt oder hat das falsche Format`), { status: 400 });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > maxBytes || buf[0] !== 0xff || buf[1] !== 0xd8) throw Object.assign(new Error(`${what} ist zu groß oder kein JPEG`), { status: 400 });
  return buf;
}
export const photoFile = (name, thumb) => join(PHOTOS, `${name}${thumb ? '.t' : ''}.jpg`);
/** Speichert Foto und Vorschaubild. "name" ist der Dateiname ohne Endung und steht so im Eintrag. */
export function savePhoto(name, photo, thumb) {
  if (!SAFE.test(name)) throw Object.assign(new Error('Ungültiger Fotoname'), { status: 400 });
  const full = decode(photo, 900_000, 'Foto'), small = decode(thumb, 150_000, 'Vorschaubild');
  // Erst daneben schreiben, dann umbenennen: eine vorhandene Datei wird so nie überschrieben, sondern ersetzt.
  // Wichtig für die Sicherung, die Fotos als Hardlinks hält.
  for (const [file, buf] of [[photoFile(name), full], [photoFile(name, true), small]]) {
    writeFileSync(file + '.tmp', buf);
    renameSync(file + '.tmp', file);
  }
  return name;
}
export function delPhoto(name) {
  if (!name || !SAFE.test(name)) return;
  for (const f of [photoFile(name), photoFile(name, true)]) if (existsSync(f)) rmSync(f, { force: true });
}

// ---------- Videos (freiwillig zum Foto dazu) ----------
export const VIDEO = /^([a-z0-9-]{8,80})\.(mp4|webm)$/;
export const VIDEO_MAX = 30_000_000;
export const videoFile = name => (VIDEO.test(name || '') ? join(PHOTOS, name) : null);
/** Prüft die ersten Bytes: MP4 hat „ftyp“ an Stelle 4, WebM beginnt mit 1A 45 DF A3. Liefert die Endung oder null. */
export function videoKind(buf) {
  if (buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}
export function saveVideo(base, buf) {
  const ext = videoKind(buf);
  if (!ext) throw Object.assign(new Error('Das ist kein Video, das die App kennt'), { status: 400 });
  const name = `${base}.${ext}`, file = join(PHOTOS, name);
  if (!VIDEO.test(name)) throw Object.assign(new Error('Ungültiger Videoname'), { status: 400 });
  writeFileSync(file + '.tmp', buf);
  renameSync(file + '.tmp', file);
  return name;
}
export function delVideo(name) { const f = videoFile(name); if (f && existsSync(f)) rmSync(f, { force: true }); }
