// Der Dienst als Ganzes: startet einen echten Server mit leerer Datenbank in einem Wegwerf-Ordner
// und spielt die wichtigen Abläufe über die Schnittstelle durch. Die Tests bauen aufeinander auf.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import jpeg from 'jpeg-js';
import * as L from '../shared/logic.js';

const DATA = mkdtempSync(join(tmpdir(), 'putzplan-test-'));
const PORT = 4700 + Math.floor(Math.random() * 250);
const BASE = `http://127.0.0.1:${PORT}`;
let srv, code, db;

before(async () => {
  // Der Dienstplan startet hier erst „in ferner Zukunft“, damit die Tests nicht von der Uhrzeit abhängen.
  // Der Test zum Dienstplan schaltet ihn gezielt ein.
  srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, APP_URL: 'https://putzplan.test', NODE_ENV: 'test', PLAN_START: '2999-01-01', CLAUDE_FAKE: '1', CLAUDE_DELAY_MS: '600000', CLAUDE_REPLY_DELAY_MS: '50' }, stdio: ['ignore', 'pipe', 'inherit'] });
  code = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Server startet nicht: ' + out)), 15000);
    srv.stdout.on('data', d => { out += d; const m = /join=([\w-]+)/.exec(out); if (m) { clearTimeout(timer); resolve(m[1]); } });
    srv.on('exit', c => { clearTimeout(timer); reject(new Error('Server hat sich beendet: ' + c)); });
  });
  db = new DatabaseSync(join(DATA, 'putzplan.db')); // nur für Vorbereitungen, die es über die App nicht gibt
});
after(() => {
  db?.close();
  srv?.kill();
  try { rmSync(DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
});

/** Ein „Gerät“ mit eigenem Cookie. */
function device() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(BASE + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, head: r.headers, ...(await r.json().catch(() => ({}))) };
  };
  return {
    get: (p, h) => call('GET', p, null, h), post: (p, b, h) => call('POST', p, b, h), put: (p, b) => call('PUT', p, b), del: p => call('DELETE', p),
    raw: (p, headers = {}, signal) => fetch(BASE + p, { redirect: 'manual', signal, headers: { Cookie: cookie, ...headers } }),
    /** Rohe Daten schicken (Video), nicht als JSON. */
    send: async (p, body, headers = {}) => { const r = await fetch(BASE + p, { method: 'POST', body, headers: { Cookie: cookie, ...headers } }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; },
    async enter(member_id, pin) { await this.post('/api/join', { code }); return this.post('/api/login', { member_id, pin }); },
  };
}
const img = n => 'data:image/jpeg;base64,' + jpeg.encode({ data: Buffer.alloc(n * n * 4, 180), width: n, height: n }, 60).data.toString('base64');
const photo = { photo: img(64), thumb: img(16) };
const entryOf = r => r.changes?.find(c => c.t === 'entries')?.row;
const logOf = r => r.changes?.find(c => c.t === 'log')?.row;
const wait = ms => new Promise(r => setTimeout(r, ms));

const admin = device(), mia = device(), lily = device();
const MIA = 'test-mia', LILY = 'test-lily';
let ADMIN, entry; // Kennung der Admin-Person; der Eintrag, an dem mehrere Tests arbeiten

test('ohne Beitritt gibt es keine Daten und keine Fotos', async () => {
  const fremd = device();
  const s = await fremd.get('/api/session');
  assert.equal(s.joined, false);
  assert.deepEqual(s.members, []);
  assert.equal((await fremd.get('/api/state')).status, 401);
  assert.equal((await fremd.raw('/photos/00000000-v.jpg')).status, 401);
});

test('Beitritt nur mit dem richtigen Einladungscode', async () => {
  assert.equal((await admin.post('/api/join', { code: 'falsch' })).status, 403);
  const r = await admin.post('/api/join', { code });
  assert.equal(r.joined, true);
  assert.equal(r.members.length, 1);
  assert.ok(!JSON.stringify(r).includes('pin_hash'));
  ADMIN = r.members[0].id;
});

test('die erste Anmeldung legt die PIN fest, danach prüft sie der Server', async () => {
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '12' })).status, 400);
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '4711' })).me, ADMIN);
  await admin.post('/api/logout');
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '0000' })).status, 401);
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '4711' })).me, ADMIN);
});

test('nach fünf falschen PINs ist auf dem Gerät Pause', async () => {
  const dieb = device();
  await dieb.post('/api/join', { code });
  for (let i = 0; i < 5; i++) assert.equal((await dieb.post('/api/login', { member_id: ADMIN, pin: '111' + i })).status, 401);
  assert.equal((await dieb.post('/api/login', { member_id: ADMIN, pin: '4711' })).status, 429); // jetzt hilft auch die richtige nicht
});

test('Admin legt die Familie an, alle melden sich an', async () => {
  let r = await admin.put('/api/members/' + MIA, { name: 'Mia', emoji: '🌸', role: 'mitglied' });
  assert.equal(r.changes.find(c => c.t === 'members').row.role, 'mitglied');
  r = await admin.put('/api/members/' + LILY, { name: 'Lily', emoji: '🦊', role: 'kind', w_weekday: 0.6, w_weekend: 0.6 });
  assert.equal(r.changes.find(c => c.t === 'members').row.has_pin, false);
  assert.equal((await mia.enter(MIA, '1111')).me, MIA);
  assert.equal((await lily.enter(LILY, '2222')).me, LILY);
  assert.equal((await mia.put('/api/members/test-neu', { name: 'Eindringling', role: 'admin' })).status, 403);
});

test('Zustand: alles da, aber nie ein PIN-Hash', async () => {
  const st = await admin.get('/api/state');
  assert.equal(st.members.length, 3);
  assert.ok(st.tasks.length >= 20);
  assert.ok(st.members.every(m => m.has_pin === true));
  assert.ok(!JSON.stringify(st).includes('pin_hash'));
  assert.equal(typeof st.push_key, 'string');
  assert.equal(typeof st.version, 'string');
  assert.equal(st.backup, null); // Admins sehen den Stand der Sicherung (hier: noch keine gelaufen)
  assert.ok(!('backup' in (await mia.get('/api/state'))));
});

test('Aufgabe starten und abhaken: doppelt geht nicht, zu schnell geht nicht, Punkte vergibt der Server', async () => {
  let r = await mia.post('/api/entries/start', { task_id: 'k-sm-aus', helpers: [LILY], ...photo });
  entry = entryOf(r);
  assert.equal(entry.status, 'started');
  assert.deepEqual(entry.helpers, [LILY]);
  assert.equal((await lily.post('/api/entries/start', { task_id: 'k-sm-aus', ...photo })).status, 409);
  assert.equal((await lily.post(`/api/entries/${entry.id}/finish`, photo)).status, 403); // nur wer gestartet hat
  assert.equal((await mia.post(`/api/entries/${entry.id}/finish`, photo)).status, 400); // Mindestzeit von 2 Minuten
  await admin.put('/api/settings', { min_minutes: 0 });
  assert.equal((await mia.post(`/api/entries/${entry.id}/finish`, { photo: 'data:image/png;base64,AAAA', thumb: photo.thumb })).status, 400);
  r = await mia.post(`/api/entries/${entry.id}/finish`, { ...photo, points: 99 });
  assert.equal(r.points, 3); // steht an der Aufgabe, nicht im Wunsch des Handys
  entry = entryOf(r);
  assert.equal(entry.status, 'done');
  assert.equal(entry.review, null);
});

test('Fotos: nur mit Anmeldung, dauerhaft im Handy-Cache', async () => {
  const r = await mia.raw(`/photos/${entry.after_photo}.t.jpg`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.match(r.headers.get('cache-control'), /private.*immutable/);
  assert.equal((await device().raw(`/photos/${entry.after_photo}.jpg`)).status, 401);
  assert.equal((await mia.raw('/photos/..%2F..%2Fputzplan.db')).status, 404);
});

test('Reaktionen und Kommentare', async () => {
  const id = crypto.randomUUID();
  let r = await lily.post('/api/reactions', { id, entry_id: entry.id, emoji: '❤️', on: true });
  assert.equal(r.changes[0].row.id, id);
  assert.equal((await lily.post('/api/reactions', { entry_id: entry.id, emoji: '❤️', on: true })).changes.length, 0); // schon gesetzt
  r = await lily.post('/api/reactions', { entry_id: entry.id, emoji: '❤️', on: false });
  assert.equal(r.changes[0].del, id);
  assert.equal((await lily.post('/api/reactions', { entry_id: entry.id, emoji: '💩', on: true })).status, 400);
  r = await lily.post('/api/reactions', { entry_id: entry.id, text: 'Sauber!' });
  const comment = r.changes[0].row;
  assert.equal(comment.text, 'Sauber!');
  assert.equal((await mia.del('/api/reactions/' + comment.id)).status, 403); // fremder Kommentar
  assert.equal((await admin.del('/api/reactions/' + comment.id)).changes[0].del, comment.id);
});

test('Prüfen: nachbessern, ablehnen, zurücknehmen', async () => {
  let r = await admin.post(`/api/entries/${entry.id}/review`, { verdict: 'nach', note: 'Ecke vergessen' });
  assert.equal(entryOf(r).review, 'nach');
  assert.ok(logOf(r));
  r = await mia.post(`/api/entries/${entry.id}/redo`, photo);
  assert.equal(entryOf(r).review, null);
  assert.notEqual(entryOf(r).after_photo, entry.after_photo);
  r = await admin.post(`/api/entries/${entry.id}/review`, { verdict: 'reject' });
  assert.equal(entryOf(r).status, 'rejected');
  const log = logOf(r);
  r = await admin.post(`/api/log/${log.id}/undo`);
  assert.equal(entryOf(r).status, 'done');
  assert.equal(logOf(r).undone, true);
  assert.equal((await admin.post(`/api/log/${log.id}/undo`)).status, 409);
  assert.equal(entryOf(await admin.post(`/api/entries/${entry.id}/review`, { verdict: 'ok' })).review, 'ok');
});

test('Belohnen, frei geben, zuweisen', async () => {
  let r = await admin.post('/api/entries/reward', { kind: 'bonus', member_id: LILY, points: 4, reason: 'Ohne Meckern geholfen' });
  const bonus = entryOf(r);
  assert.equal(bonus.points, 4);
  assert.equal((await admin.post('/api/entries/reward', { kind: 'warn', member_id: LILY, points: 2 })).status, 400); // ohne Grund
  assert.equal(entryOf(await admin.post(`/api/entries/${bonus.id}/revoke`)).status, 'rejected');
  assert.equal(entryOf(await admin.post('/api/entries/reward', { kind: 'frei', member_id: MIA, when: 1 })).task_id, 'frei');

  r = await admin.post('/api/entries/adhoc', { kind: 'assign', member_id: LILY, title: 'Blumen gießen', points: 2 });
  assert.equal(entryOf(r).status, 'todo');
  assert.equal((await mia.del('/api/entries/' + entryOf(r).id)).status, 403);
  assert.equal((await admin.del('/api/entries/' + entryOf(r).id)).changes[0].del, entryOf(r).id);

  r = await admin.post('/api/tasks/k-muell-raus/assign', { member_id: LILY });
  const assigned = entryOf(r);
  assert.equal(assigned.status, 'todo');
  assert.equal((await admin.post('/api/tasks/k-muell-raus/assign', { member_id: MIA })).status, 409);
  assert.equal((await mia.post('/api/entries/start', { task_id: 'k-muell-raus', ...photo })).status, 409); // ist vergeben
  assert.equal((await mia.post('/api/entries/start', { entry_id: assigned.id, ...photo })).status, 403);
  assert.equal(entryOf(await lily.post('/api/entries/start', { entry_id: assigned.id, ...photo })).status, 'started');
  assert.equal((await lily.post(`/api/entries/${assigned.id}/finish`, photo)).points, 3);
});

test('Extra-Aufgaben und Mithelfen', async () => {
  let r = await mia.post('/api/entries/adhoc', { kind: 'extra', title: 'Fleck an der Tür' });
  assert.equal(entryOf(r).points, 2);
  assert.equal((await mia.post('/api/entries/adhoc', { kind: 'assign', member_id: LILY, title: 'x', points: 30 })).status, 403);
  r = await mia.post('/api/entries/start', { entry_id: entryOf(r).id, ...photo });
  const running = entryOf(r);
  // Mithelfen ist erst eine Anfrage, Mia bestätigt
  let j = entryOf(await lily.post(`/api/entries/${running.id}/join`));
  assert.deepEqual(j.helpers, []);
  assert.deepEqual(j.pending, [LILY]);
  assert.equal((await lily.post(`/api/entries/${running.id}/pending`, { member_id: LILY, accept: true })).status, 403); // nicht selbst bestätigen
  j = entryOf(await mia.post(`/api/entries/${running.id}/pending`, { member_id: LILY, accept: true }));
  assert.deepEqual(j.helpers, [LILY]);
  assert.deepEqual(j.pending, []);
  // wieder raus: man selbst (aus Versehen dabei) oder wer angefangen hat
  assert.deepEqual(entryOf(await lily.post(`/api/entries/${running.id}/remove-helper`, { member_id: LILY })).helpers, []);
  await lily.post(`/api/entries/${running.id}/join`);
  assert.deepEqual(entryOf(await mia.post(`/api/entries/${running.id}/pending`, { member_id: LILY, accept: false })).pending, []);
  assert.equal(entryOf(await mia.post(`/api/entries/${running.id}/cancel`)).status, 'todo'); // Eigenes bleibt auf der Liste
  assert.equal((await mia.post('/api/redeem')).status, 400); // kein Guthaben
});

test('Aufgaben verwalten: nur Admins, alle anderen schlagen vor', async () => {
  let r = await admin.put('/api/tasks/test-task', { title: 'Keller fegen', room: 'Keller', freq: 'weekly', day: 6, minutes: 20, points: 4 });
  assert.equal(r.changes.find(c => c.t === 'tasks').row.active, true);
  assert.equal((await mia.put('/api/tasks/test-task', { title: 'gehackt' })).status, 403);
  r = await mia.put('/api/tasks/test-idee', { title: 'Blumen gießen', room: 'Wohnzimmer' });
  const idee = r.changes.find(c => c.t === 'tasks').row;
  assert.equal(idee.active, false);
  assert.equal(idee.proposed_by, MIA);
  r = await admin.post('/api/tasks/test-idee/active', { active: true });
  assert.equal(r.changes.find(c => c.t === 'tasks').row.proposed_by, null);
  assert.equal((await mia.del('/api/tasks/test-task')).status, 403);
  assert.ok((await admin.del('/api/tasks/test-task')).changes.some(c => c.del === 'test-task'));
});

test('Anfragen von fremden Seiten werden abgelehnt', async () => {
  assert.equal((await admin.post('/api/entries/reward', {}, { Origin: 'https://boese.example' })).status, 403);
  assert.equal((await admin.post('/api/reactions', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const r = await fetch(BASE + '/api/logout', { method: 'POST', body: 'a=b', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415); // ein einfaches Formular kommt nicht durch
});

test('Fotos bleiben dauerhaft, ältere lassen sich nachladen', async () => {
  let r = await admin.put('/api/settings', { foto_tage: 5 });
  assert.ok(!('foto_tage' in r.changes.find(c => c.t === 'settings').row));
  const old = new Date(Date.now() - 60 * 864e5).toISOString();
  db.prepare("insert into entries (id, task_id, title, member_id, period, slot, status, before_photo, after_photo, before_at, after_at, points, helpers, created_at, review) values ('test-alt', 'adhoc', 'Alter Eintrag', ?, '2026-01-01', 'test-alt', 'done', ?, ?, ?, ?, 2, '[]', ?, 'ok')").run(MIA, entry.before_photo, entry.after_photo, old, old, old);
  const st = await mia.get('/api/state');
  assert.equal(st.older, true);
  assert.ok(!st.entries.some(e => e.id === 'test-alt'));
  r = await mia.get('/api/history');
  assert.ok(r.entries.some(e => e.id === 'test-alt' && e.after_photo));
  assert.equal(r.more, false);
});

test('PIN vergessen: Hilferuf, Zurücksetzen durch Admins, neue PIN', async () => {
  const handy = device();
  await handy.post('/api/join', { code });
  let r = await handy.post('/api/pin-help', { member_id: MIA });
  assert.ok(r.changes.find(c => c.t === 'members').row.pin_help);
  assert.equal((await handy.post('/api/pin-help', { member_id: MIA })).changes.length, 0); // nicht alle paar Sekunden
  assert.equal((await lily.post(`/api/members/${MIA}/reset-pin`)).status, 403);
  r = await admin.post(`/api/members/${MIA}/reset-pin`);
  const row = r.changes.find(c => c.t === 'members').row;
  assert.equal(row.has_pin, false);
  assert.equal(row.pin_help, null);
  assert.equal((await mia.get('/api/state')).status, 401); // alte Anmeldung gilt nicht mehr
  assert.equal((await handy.post('/api/login', { member_id: MIA, pin: '9090' })).me, MIA);
  assert.equal((await mia.post('/api/login', { member_id: MIA, pin: '1111' })).status, 401);
  assert.equal((await mia.post('/api/login', { member_id: MIA, pin: '9090' })).me, MIA);
});

test('Mitglieder und Kinder dürfen keine Admin-Dinge und sehen kein Protokoll', async () => {
  for (const d of [mia, lily]) {
    assert.equal((await d.post('/api/entries/reward', { kind: 'bonus', member_id: MIA, points: 50, reason: 'Schummeln' })).status, 403);
    assert.equal((await d.post(`/api/entries/${entry.id}/review`, { verdict: 'ok' })).status, 403);
    assert.equal((await d.put('/api/settings', { tagesziel: 1 })).status, 403);
    assert.equal((await d.post('/api/announce', { text: 'x' })).status, 403);
    assert.equal((await d.get('/api/invite')).status, 403);
    assert.equal((await d.get('/api/state')).log.length, 0);
  }
  assert.ok((await admin.get('/api/state')).log.length > 5);
  assert.equal((await admin.put('/api/members/' + ADMIN, { name: 'Admin', role: 'mitglied' })).status, 400); // letzte Admin-Person bleibt Admin
});

test('Änderungen kommen sofort über den Live-Kanal, das Protokoll nur zu Admins', async () => {
  const listen = d => {
    const events = [], ac = new AbortController();
    d.raw('/api/events', {}, ac.signal).then(async res => { const dec = new TextDecoder(); for await (const c of res.body) for (const l of dec.decode(c).split('\n')) if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6))); }).catch(() => {});
    return { events, stop: () => ac.abort() };
  };
  const a = listen(admin), m = listen(mia);
  await wait(300);
  const r = await lily.post('/api/reactions', { entry_id: entry.id, emoji: '🔥', on: true });
  await admin.post('/api/entries/reward', { kind: 'bonus', member_id: MIA, points: 1, reason: 'Live-Test' });
  await wait(400);
  a.stop(); m.stop();
  assert.ok(m.events.some(e => e.t === 'reactions' && e.row?.id === r.changes[0].row.id));
  assert.ok(a.events.some(e => e.t === 'log'));
  assert.ok(!m.events.some(e => e.t === 'log'));
  assert.ok(!JSON.stringify([a.events, m.events]).includes('pin_hash'));
});

test('Übergangstür: alte Geräte kommen mit dem V1-Geheimcode herein, aber nur solange sie offen ist', async () => {
  const hash = createHash('sha256').update('altes-geheimnis').digest('hex');
  const door = ms => db.prepare("insert into meta (key, value) values ('v1_door', ?) on conflict (key) do update set value = excluded.value").run(JSON.stringify({ hash, until: new Date(Date.now() + ms).toISOString() }));
  door(864e5);
  const alt = device();
  assert.equal((await alt.post('/api/join', { v1: 'falsch' })).status, 403);
  const r = await alt.post('/api/join', { v1: 'altes-geheimnis' });
  assert.equal(r.joined, true);
  assert.equal(r.code, code); // bekommt den neuen Einladungscode mit
  assert.ok(r.members.some(m => m.id === MIA));
  assert.equal((await alt.get('/api/state')).status, 401); // aufgenommen heißt nicht angemeldet: die PIN braucht es weiter
  assert.equal((await alt.post('/api/login', { member_id: MIA, pin: '0000' })).status, 401);
  assert.ok((await admin.get('/api/invite')).v1_until);

  door(-1000); // abgelaufen
  assert.equal((await device().post('/api/join', { v1: 'altes-geheimnis' })).status, 403);
  assert.equal((await admin.get('/api/invite')).v1_until, null);

  door(864e5);
  const neu = await admin.post('/api/invite/renew'); // ein neuer Einladungslink schließt jeden alten Weg
  assert.notEqual(neu.code, code);
  assert.equal((await device().post('/api/join', { v1: 'altes-geheimnis' })).status, 403);
  assert.equal((await device().post('/api/join', { code })).status, 403);
  code = neu.code;
  assert.equal((await device().post('/api/join', { code })).joined, true);
});

test('Dienstplan: verteilt fair, Kinder nur Leichtes, Extras erst nach den Diensten, frei gibt Dienste ab', async () => {
  const today = L.dKey(new Date());
  db.prepare("insert into meta (key, value) values ('plan_start', ?) on conflict (key) do update set value = excluded.value").run(JSON.stringify(today));
  let r = await admin.post('/api/plan/redo');
  assert.ok(r.count > 0, 'es wurden Dienste verteilt');
  let st = await admin.get('/api/state');
  assert.equal(st.settings.plan_start, today);
  const tasks = new Map(st.tasks.map(t => [t.id, t]));
  const duties = () => st.entries.filter(e => e.created_by === 'plan' && e.status === 'todo');
  assert.ok(duties().every(e => tasks.get(e.task_id).pflicht), 'nur Dienste werden verteilt, keine Extras');
  assert.ok(duties().filter(e => e.member_id === LILY).every(e => tasks.get(e.task_id).leicht), 'Kinder bekommen nur Leichtes');
  assert.ok(new Set(duties().map(e => e.member_id)).size >= 2, 'mehr als eine Person hat Dienste');

  // Wer noch Dienste hat, bekommt keine Extras. Die eigenen Dienste gehen natürlich.
  const dev = { [ADMIN]: admin, [MIA]: mia, [LILY]: lily };
  const busy = duties()[0], who = dev[busy.member_id];
  r = await who.post('/api/entries/start', { task_id: 'wz-decken', ...photo });
  assert.equal(r.status, 403);
  assert.match(r.error, /Erst deine Dienste/);
  assert.equal((await who.post('/api/entries/adhoc', { kind: 'extra', title: 'Schnell was Kleines' })).status, 403);
  assert.equal(entryOf(await who.post('/api/entries/start', { entry_id: busy.id, ...photo })).status, 'started');
  assert.equal(entryOf(await who.post(`/api/entries/${busy.id}/cancel`)).status, 'todo'); // ein Dienst bleibt bei der Person
  assert.equal((await who.post('/api/redeem')).status, 400); // kein Punktekonto mit Dienstplan

  // Admins geben einen Dienst weiter
  const give = duties().find(e => e.member_id !== MIA);
  assert.equal(entryOf(await admin.post(`/api/entries/${give.id}/reassign`, { member_id: MIA })).member_id, MIA);
  assert.equal((await mia.post(`/api/entries/${give.id}/reassign`, { member_id: LILY })).status, 403);

  // Wer heute frei bekommt, gibt seine Dienste ab, sie gehen an die anderen
  st = await admin.get('/api/state');
  const before = duties().length;
  await admin.post('/api/entries/reward', { kind: 'frei', member_id: MIA, when: 0 });
  st = await admin.get('/api/state');
  assert.equal(duties().filter(e => e.member_id === MIA).length, 0);
  assert.ok(duties().length >= before - 1, 'die Dienste sind nicht verschwunden, nur umverteilt');
});

test('Video zum Foto: nur Beteiligte, nur echte Videos, abspielbar in Stücken', async () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(88, 7)]);
  const path = `/api/entries/${entry.id}/video?step=after`, head = { 'Content-Type': 'video/mp4', 'X-Putzplan': '1' };
  assert.equal((await mia.send(path, mp4, { 'Content-Type': 'video/mp4' })).status, 403); // ohne eigenen Kopf
  assert.equal((await admin.send(path, mp4, head)).status, 403); // war nicht dabei
  assert.equal((await mia.send(path, Buffer.from('kein video'), head)).status, 400);
  const r = await mia.send(path, mp4, head);
  assert.equal(r.status, 200);
  assert.equal(entryOf(r).after_video, r.name);
  const part = await mia.raw('/photos/' + r.name, { Range: 'bytes=0-9' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-9/${mp4.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  assert.equal((await device().raw('/photos/' + r.name)).status, 401);
});

test('Claude als System-Konto: nur vom Server aus und nur mit Schlüssel', async () => {
  const say = (body, headers = {}) => fetch(BASE + '/api/system/say', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await say({ entry_id: entry.id, text: 'Hallo' })).status, 403);
  db.prepare("insert into meta (key, value) values ('system_token', ?) on conflict (key) do update set value = excluded.value").run(JSON.stringify('test-schluessel'));
  assert.equal((await say({ entry_id: entry.id, text: 'Hallo' }, { 'X-System-Token': 'falsch' })).status, 403);
  assert.equal((await say({ entry_id: entry.id, text: 'Hallo' }, { 'X-System-Token': 'test-schluessel', 'X-Forwarded-For': '1.2.3.4' })).status, 403); // über den Proxy nie
  const r = await (await say({ entry_id: entry.id, text: 'Wow, die Spülmaschine glänzt!' }, { 'X-System-Token': 'test-schluessel' })).json();
  const c = r.changes[0].row;
  assert.equal(c.member_id, 'claude');
  assert.equal((await say({ entry_id: entry.id, emoji: '👏' }, { 'X-System-Token': 'test-schluessel' })).status, 200);
  assert.ok((await mia.get('/api/state')).reactions.some(x => x.id === c.id));
  assert.equal((await mia.del('/api/reactions/' + c.id)).status, 403);
  assert.equal((await admin.del('/api/reactions/' + c.id)).changes[0].del, c.id);
});

test('Claude prüft: kommentiert, reagiert und hakt ab, was eindeutig passt (mit Probe-Antwort statt echter API)', async () => {
  let st = await admin.get('/api/state');
  assert.equal(st.claude, true);
  assert.ok(!('claude' in (await mia.get('/api/state'))));
  const dev = { [ADMIN]: admin, [MIA]: mia, [LILY]: lily };
  const duty = st.entries.find(e => e.created_by === 'plan' && e.status === 'todo' && dev[e.member_id]);
  const who = dev[duty.member_id];
  await who.post('/api/entries/start', { entry_id: duty.id, ...photo });
  assert.equal(entryOf(await who.post(`/api/entries/${duty.id}/finish`, photo)).review, null);
  assert.equal((await mia.post(`/api/entries/${duty.id}/claude`)).status, 403); // nur Admins
  assert.equal((await admin.post(`/api/entries/${duty.id}/claude`)).started, true);
  let e;
  for (let i = 0; i < 30 && !e?.ai; i++) { await wait(100); st = await admin.get('/api/state'); e = st.entries.find(x => x.id === duty.id); }
  assert.equal(e.ai.urteil, 'passt');
  assert.equal(e.review, 'ok'); // Claude darf abhaken
  const mine = st.reactions.filter(r => r.entry_id === duty.id && r.member_id === 'claude');
  assert.ok(mine.some(r => r.text) && mine.some(r => r.emoji === '👏'));
  assert.ok(st.log.some(l => l.member_id === 'claude' && l.can_undo)); // steht im Protokoll und lässt sich zurücknehmen
});

test('Antworten auf Kommentare, Claude antwortet wenn angesprochen, Familien-Infos nur für Admins', async () => {
  let st = await admin.get('/api/state');
  const fromClaude = st.reactions.find(r => r.member_id === 'claude' && r.text);
  // Mia antwortet Claude: Claude antwortet zurück
  let r = await mia.post('/api/reactions', { entry_id: fromClaude.entry_id, text: 'Danke dir!', reply_to: fromClaude.id });
  const mine = r.changes[0].row;
  assert.equal(mine.reply_to, fromClaude.id);
  let back;
  for (let i = 0; i < 30 && !back; i++) { await wait(100); back = (await mia.get('/api/state')).reactions.find(x => x.member_id === 'claude' && x.reply_to === mine.id); }
  assert.ok(back, 'Claude hat geantwortet');
  // Antwort unter Geschwistern: Claude hält sich raus
  r = await lily.post('/api/reactions', { entry_id: fromClaude.entry_id, text: 'Ich auch', reply_to: mine.id });
  await wait(400);
  assert.ok(!(await mia.get('/api/state')).reactions.some(x => x.member_id === 'claude' && x.reply_to === r.changes[0].row.id));
  assert.equal((await mia.post('/api/reactions', { entry_id: entry.id, text: 'x', reply_to: 'gibt-es-nicht' })).status, 400);
  // Was Claude über die Familie weiß: nur Admins
  assert.equal((await mia.put('/api/claude-infos', { text: 'geheim' })).status, 403);
  assert.equal((await admin.put('/api/claude-infos', { text: 'Mama bitte schonen' })).claude_infos, 'Mama bitte schonen');
  assert.equal((await admin.get('/api/state')).claude_infos, 'Mama bitte schonen');
  assert.ok(!('claude_infos' in (await mia.get('/api/state'))));
});

test('Dienst übernehmen: zählt für die Person, die ihn macht, mit einem Bonuspunkt', async () => {
  await admin.put('/api/settings', { min_minutes: 0 });
  let st = await admin.get('/api/state');
  const tasks = new Map(st.tasks.map(t => [t.id, t]));
  const dev = { [ADMIN]: admin, [MIA]: mia, [LILY]: lily };
  const duty = st.entries.find(e => e.created_by === 'plan' && e.status === 'todo' && e.member_id !== MIA && dev[e.member_id]);
  assert.ok(duty, 'es gibt einen offenen Dienst von jemand anderem');
  const owner = dev[duty.member_id];
  assert.equal((await owner.post(`/api/entries/${duty.id}/takeover`)).status, 409); // den eigenen nicht
  const e = entryOf(await mia.post(`/api/entries/${duty.id}/takeover`));
  assert.equal(e.member_id, MIA);
  assert.equal(e.fuer, duty.member_id);
  assert.ok(L.isDuty(e), 'bleibt ein Dienst');
  assert.equal((await owner.post('/api/entries/start', { entry_id: duty.id, ...photo })).status, 403); // gehört jetzt Mia
  assert.equal(entryOf(await mia.post('/api/entries/start', { entry_id: duty.id, ...photo })).status, 'started');
  assert.equal((await lily.post(`/api/entries/${duty.id}/takeover`)).status, 409); // läuft schon
  const done = await mia.post(`/api/entries/${duty.id}/finish`, photo);
  assert.equal(done.points, L.ptsOf(tasks.get(duty.task_id)) + L.FUER_BONUS);
  st = await admin.get('/api/state');
  assert.ok(st.log.some(l => l.text.includes('übernimmt') && l.can_undo));
});

test('Chat mit Claude: eigener Verlauf, Admins lesen mit, Bonus nur mit Beweis, Anträge, Grenze pro Monat', async () => {
  const chatOf = r => (r.changes || []).filter(c => c.t === 'chat').map(c => c.row);
  let r = await mia.post('/api/chat', { text: 'Hallo Claude' });
  assert.ok(r.id);
  assert.ok(chatOf(r).some(m => m.role === 'claude' && /Probe-Antwort an Mia/.test(m.text)), 'Claude antwortet');
  const mine = await mia.get('/api/chat');
  assert.equal(mine.messages.length, 2);
  assert.ok(mine.messages.every(m => !('cost' in m)), 'Kosten sieht niemand im Chat');
  // Fremde Chats: nur Admins
  assert.equal((await lily.get(`/api/chat?member=${MIA}`)).status, 403);
  assert.equal((await admin.get(`/api/chat?member=${MIA}`)).messages.length, 2);
  const people = (await admin.get('/api/chat/people')).people;
  assert.ok(people.find(p => p.member_id === MIA).month > 0);
  assert.equal((await mia.get('/api/chat/people')).status, 403);

  // Bonus von Claude: ohne Foto nicht, mit Foto schon
  r = await mia.post('/api/chat', { text: '!bonus' });
  assert.match(chatOf(r).find(m => m.role === 'claude').text, /kein Foto/);
  r = await mia.post('/api/chat', { text: '!bonus', ...photo });
  const answer = chatOf(r).find(m => m.role === 'claude');
  assert.equal(answer.actions[0].text, '+1 Bonus für Mia');
  const bonus = r.changes.find(c => c.t === 'entries' && c.row.task_id === 'bonus').row;
  assert.equal(bonus.created_by, 'claude');
  assert.equal(bonus.points, 1);
  assert.ok((await admin.get('/api/state')).log.some(l => l.member_id === 'claude' && /belohnt/.test(l.text) && l.can_undo));

  // Antrag an die Admins: Mia sieht ihn, Lily nicht, entscheiden nur Admins
  r = await mia.post('/api/chat', { text: '!antrag' });
  const a = r.changes.find(c => c.t === 'antraege').row;
  assert.equal(a.status, 'offen');
  assert.ok((await mia.get('/api/state')).antraege.some(x => x.id === a.id));
  assert.ok(!(await lily.get('/api/state')).antraege.some(x => x.id === a.id));
  assert.equal((await mia.post(`/api/antraege/${a.id}/decide`, { accept: true })).status, 403);
  r = await admin.post(`/api/antraege/${a.id}/decide`, { accept: true, note: 'Verdient' });
  assert.equal(r.antrag.status, 'angenommen');
  assert.ok(r.changes.some(c => c.t === 'entries' && c.row.task_id === 'bonus' && c.row.points === 4 && c.row.member_id === MIA));
  assert.ok((await mia.get('/api/chat')).messages.some(m => m.role === 'claude' && /angenommen/.test(m.text)));
  assert.equal((await admin.post(`/api/antraege/${a.id}/decide`, { accept: false })).status, 409); // nur einmal

  // Grenze pro Monat: Mitglieder ja, Admins nicht. Die App nennt keine Beträge.
  const iso = new Date().toISOString();
  db.prepare("insert into chat (id, member_id, role, text, cost, created_at) values ('teuer-lily', ?, 'claude', 'x', 11, ?), ('teuer-admin', ?, 'claude', 'x', 50, ?)").run(LILY, iso, ADMIN, iso);
  r = await lily.post('/api/chat', { text: 'Noch eine Frage' });
  assert.equal(r.status, 429);
  assert.ok(!/€|\d/.test(r.error));
  assert.equal((await lily.get('/api/chat')).limit, true);
  assert.ok((await admin.post('/api/chat', { text: 'Hallo' })).id);
});

test('www leitet auf die Hauptadresse um, die Version ist abfragbar', async () => {
  const r = await fetch(BASE + '/abc?x=1', { redirect: 'manual', headers: { 'X-Forwarded-Host': 'www.putzplan.test' } });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://putzplan.test/abc?x=1');
  const h = await (await fetch(BASE + '/healthz')).json();
  assert.equal(h.ok, true);
  assert.equal(typeof h.version, 'string');
});
