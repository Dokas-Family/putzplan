// Zustand der App: einmal laden, danach nur noch einzelne Änderungen über den Live-Kanal einspielen.
import * as L from '../../../shared/logic.js';

class Store {
  phase = $state('boot'); // boot | join | who | app
  joinError = $state('');
  picker = $state.raw([]); // Personen für den Anmeldeschirm
  meId = $state(null);
  members = $state.raw([]);
  tasks = $state.raw([]);
  entries = $state.raw([]);
  reactions = $state.raw([]);
  log = $state.raw([]);
  older = $state.raw([]); // nachgeladene Einträge, die älter sind als der geladene Zeitraum (nur für die Foto-Ansicht)
  olderMore = $state(false);
  settings = $state.raw({ ...L.DEFAULT_SETTINGS });
  tage = $state.raw({}); // festgeschriebene Regeln je Person und Tag (Tagesziel, Dienstplan an/aus)
  pushKey = null;
  tab = $state('heute');
  now = $state(Date.now());
  online = $state(true);
  say = $state.raw(null); // letzte Durchsage
  version = $state(''); // Stand des Servers beim Laden dieser Seite
  update = $state(false); // der Server läuft inzwischen mit einem neueren Stand
  backup = $state.raw(null); // Zeitpunkt der letzten Sicherung (nur für Admins)
  claude = $state(false); // ist auf dem Server ein Claude-Schlüssel eingetragen? (nur für Admins)
  claudeInfos = $state(''); // was Claude über die Familie wissen soll (nur für Admins)
  chat = $state.raw([]); // Chat mit Claude: eigene Nachrichten, bei Admins auch die angesehenen der anderen
  chatBusy = $state.raw({}); // Person → Claude schreibt gerade
  chatReady = $state(false); // ist Claude für den Chat eingerichtet?
  chatLast = $state(''); // wann Claude mir zuletzt geschrieben hat (aus dem Zustand)
  chatSeen = $state(''); // bis wann ich den Chat gelesen habe (pro Gerät)
  antraege = $state.raw([]); // Anträge an die Admins (Admins: alle offenen, sonst die eigenen)
  preselect = null; // Person, mit der das Gerät in der alten App angemeldet war
}
export const S = new Store();

const byId = $derived(new Map(S.members.map(m => [m.id, m])));
const me = $derived(byId.get(S.meId) || null);
const reactionsBy = $derived.by(() => { const m = new Map(); for (const r of S.reactions) (m.get(r.entry_id) || m.set(r.entry_id, []).get(r.entry_id)).push(r); return m; });
const calc = $derived.by(() => {
  const st = { members: S.members, tasks: S.tasks, entries: S.entries, settings: S.settings, tage: S.tage };
  const d = new Date(S.now), ix = L.buildIndex(st), plan = L.planOn(st.settings, d);
  const dy = L.dayTotals(st, d), wk = L.weekPoints(st, d), mo = L.monthPoints(st, d), per = {};
  for (const m of S.members) {
    const duties = plan ? L.dutiesOn(ix, m.id, d, d) : [];
    per[m.id] = {
      // Punkte: heute, Woche, Monat zählen alle gleich (Aufgaben, Belohnungen, Abmahnungen)
      today: dy.pts[m.id] || 0, week: wk.pts[m.id] || 0, month: mo.pts[m.id] || 0,
      cnt: wk.cnt[m.id] || 0, warn: wk.warn[m.id] || 0, bonus: wk.bonus[m.id] || 0, streak: L.streak(ix, m, st, d),
      // Dienstplan: was jemand heute hat und wie viel davon erledigt ist
      duties, dutiesDone: duties.filter(e => e.status === 'done').length, dutyWeek: plan ? L.dutyWeek(ix, m.id, d) : null,
      // ohne Dienstplan: altes Tagesziel in Punkten und Konto
      goal: plan ? 0 : L.goalOf(st, m, d), goalPts: L.dayPoints(ix, m.id, d), bank: plan ? 0 : L.bank(ix, m, st, d),
      frei: L.hasFrei(ix, m.id, d), // heute frei bekommen (auch krank)
      krank: L.isKrank(ix, m.id, d), // heute krank gemeldet
    };
  }
  return { st, d, ix, per, plan, today: L.dKey(d) };
});
/** Abgeleitete Werte. Als Getter, damit Komponenten immer den aktuellen Stand lesen. */
export const G = {
  get me() { return me; },
  get admin() { return me?.role === 'admin'; },
  get kid() { return me?.role === 'kind'; },
  get calc() { return calc; },
  /** Gilt heute der Dienstplan? */
  get plan() { return calc.plan; },
  /** Offene Dienste von mir. Solange es welche gibt, sind Extras gesperrt (wenn die Regel an ist). */
  get myOpen() { return me ? L.openDuties(calc.ix, me.id) : []; },
  get extrasLocked() { return calc.plan && !!S.settings.extras_sperre && G.myOpen.length > 0; },
  /** Neue Kommentare unter meinen Beiträgen oder als Antwort auf mich (für die Zahl am Fotos-Reiter). */
  get freshMine() {
    if (!me || !seen.base) return 0;
    const mineIds = new Set(S.reactions.filter(r => r.member_id === me.id && r.text).map(r => r.id));
    const entries = new Map(S.entries.map(e => [e.id, e]));
    let n = 0;
    for (const r of S.reactions) {
      if (!r.text || r.member_id === me.id || r.created_at <= seenAt(r.entry_id)) continue;
      const e = entries.get(r.entry_id);
      if ((e && L.involved(e, me.id)) || mineIds.has(r.reply_to)) n++;
    }
    return n;
  },
  /** Der Dienstplan startet bald (eingeschaltet, aber erst ab morgen). */
  get planSoon() { return !!S.settings.dienste && !!S.settings.plan_start && S.settings.plan_start > calc.today; },
  get active() { return S.members.filter(m => m.active); },
  /** Erledigte Aufgaben, die noch niemand geprüft hat (älteste zuerst). */
  get queue() { return S.entries.filter(e => e.status === 'done' && !e.review && !L.ADMIN_KINDS.has(e.task_id)).sort((a, b) => (a.after_at || '').localeCompare(b.after_at || '')); },
  get proposals() { return S.tasks.filter(t => t.proposed_by); },
  /** Offene Anträge, die Claude für die Admins gestellt hat. */
  get openAntraege() { return S.antraege.filter(a => a.status === 'offen'); },
  /** Hat Claude mir geschrieben, seit ich zuletzt im Chat war? */
  get chatNew() {
    const mine = S.chat.findLast(m => m.member_id === S.meId && m.role === 'claude')?.created_at || '';
    const last = mine > S.chatLast ? mine : S.chatLast;
    return !!last && last > (S.chatSeen || '');
  },
  /** Personen, die auf dem Anmeldeschirm „PIN vergessen“ gedrückt haben. */
  get pinHelp() { return S.members.filter(m => m.pin_help && m.active); },
  /** Die nächtliche Sicherung ist seit über 36 Stunden nicht gelaufen. Ohne Angabe (z. B. lokal) keine Warnung. */
  get backupLate() { return !!S.backup && S.now - new Date(S.backup) > 36 * 3600e3; },
  /** Gemeinsame Aufgaben, die heute dran oder liegengeblieben sind. */
  get shared() { const d = calc.d; return S.tasks.filter(t => t.active && !t.per_person && L.activeOn(t, d) && (L.dueOn(t, d) || L.overdueInPeriod(t, d))); },
  get late() { const { d, ix } = calc; return G.shared.filter(t => L.overdueInPeriod(t, d) && !L.entryFor(ix, t, d, null)); },
};
// ---------- Neue Kommentare ----------
// Pro Gerät und Person: wann die Kommentare eines Eintrags zuletzt angesehen wurden. Was vorher da war, gilt nicht als neu.
class Seen { map = $state.raw({}); base = $state(''); }
export const seen = new Seen();
const seenKey = () => 'pp_seen_' + S.meId;
function loadSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey()) || 'null');
    seen.map = raw?.map || {}; seen.base = raw?.base || new Date().toISOString();
    if (!raw) saveSeen();
  } catch { seen.map = {}; seen.base = new Date().toISOString(); }
}
function saveSeen() { try { localStorage.setItem(seenKey(), JSON.stringify({ base: seen.base, map: seen.map })); } catch {} }
/** Kommentare eines Eintrags als gelesen markieren. */
export function markSeen(entryId) {
  const keep = Object.entries(seen.map).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 300);
  seen.map = { ...Object.fromEntries(keep), [entryId]: new Date().toISOString() };
  saveSeen();
}
export const seenAt = id => seen.map[id] || seen.base;
/** Neue Kommentare anderer unter einem Eintrag. */
export const freshCount = id => (seen.base ? reactionsOf(id).filter(r => r.text && r.member_id !== S.meId && r.created_at > seenAt(id)).length : 0);

// ---------- Chat ----------
/** Schreibt Claude gerade? Ältere Meldungen (kleinere Nummer) zählen nicht mehr. */
export function setChatBusy(r) {
  const cur = S.chatBusy[r.member_id];
  if (cur && cur.at > r.at) return;
  S.chatBusy = { ...S.chatBusy, [r.member_id]: r };
}
const chatKey = () => 'pp_chat_' + S.meId;
export function markChatSeen() {
  S.chatSeen = new Date().toISOString();
  try { localStorage.setItem(chatKey(), S.chatSeen); } catch {}
}
const loadChatSeen = () => { try { S.chatSeen = localStorage.getItem(chatKey()) || ''; } catch { S.chatSeen = ''; } };

export const mem = id => byId.get(id) || (id === L.SYSTEM.id ? L.SYSTEM : undefined);
export const mName = id => mem(id)?.name || 'Jemand';
export const mEmoji = id => mem(id)?.emoji || '🙂';
export const isSystem = id => id === L.SYSTEM.id;
export const reactionsOf = id => reactionsBy.get(id) || [];
export const taskOf = id => (id === 'wasch' ? L.WASCH : S.tasks.find(t => t.id === id));

// ---------- Anfragen ----------
export async function api(method, path, body) {
  let r;
  try { r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }); }
  catch { throw new Error('Keine Verbindung. Versuch es gleich nochmal.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && S.phase === 'app') boot();
    throw Object.assign(new Error(data.error || 'Hat nicht geklappt'), { status: r.status });
  }
  for (const c of data.changes || []) apply(c);
  return data;
}
export const post = (path, body) => api('POST', path, body);
export const put = (path, body) => api('PUT', path, body);
export const del = path => api('DELETE', path);

/** Eine einzelne Änderung einspielen (aus der eigenen Antwort oder vom Live-Kanal). Doppelt schadet nicht. */
export function apply(c) {
  if (c.t === 'settings') return void (S.settings = { ...L.DEFAULT_SETTINGS, ...c.row });
  if (c.t === 'say') return void (S.say = { ...c.row, at: Date.now() });
  if (c.t === 'chatbusy') return void setChatBusy(c.row);
  if (c.t === 'tage') { const next = { ...S.tage }; if (c.del != null) delete next[c.del]; else next[c.row.id] = c.row; return void (S.tage = next); }
  const list = S[c.t];
  if (!Array.isArray(list)) return;
  if (c.del != null) return void (S[c.t] = list.filter(x => x.id !== c.del));
  if (c.t === 'entries' && S.older.some(x => x.id === c.row.id)) return void (S.older = S.older.map(x => (x.id === c.row.id ? c.row : x)));
  const i = list.findIndex(x => x.id === c.row.id);
  let next = i < 0 ? (c.t === 'log' || c.t === 'entries' || c.t === 'antraege' ? [c.row, ...list] : [...list, c.row]) : list.map((x, j) => (j === i ? c.row : x));
  if (c.t === 'members') next = next.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  S[c.t] = next;
}

// ---------- Start, Anmeldung, Live-Kanal ----------
let es = null, hiddenAt = 0;
async function loadState() {
  const st = await api('GET', '/state');
  const old = new Set(S.older.map(e => e.id)); // Reaktionen zu nachgeladenen alten Fotos behalten
  S.meId = st.me; S.members = st.members; S.tasks = st.tasks; S.entries = st.entries; S.log = st.log;
  S.reactions = [...st.reactions, ...S.reactions.filter(r => old.has(r.entry_id))];
  S.settings = { ...L.DEFAULT_SETTINGS, ...st.settings }; S.pushKey = st.push_key; S.tage = st.tage || {};
  if (!S.older.length) S.olderMore = !!st.older;
  S.backup = st.backup ?? null;
  S.claude = !!st.claude;
  S.claudeInfos = st.claude_infos || '';
  S.antraege = st.antraege || [];
  S.chatReady = !!st.chat?.ready;
  S.chatLast = st.chat?.last || '';
  // Nach einem Update läuft im Handy noch der alte Stand der App: Hinweis zum Neuladen zeigen
  if (!S.version) S.version = st.version || '';
  else if (st.version && st.version !== S.version) S.update = true;
}
/** Die nächste Seite älterer Fotos holen. */
export async function loadOlder() {
  const before = S.older.at(-1)?.created_at;
  const r = await api('GET', '/history' + (before ? '?before=' + encodeURIComponent(before) : ''));
  const have = new Set(S.older.map(e => e.id)), haveR = new Set(S.reactions.map(x => x.id));
  S.older = [...S.older, ...r.entries.filter(e => !have.has(e.id))];
  S.reactions = [...S.reactions, ...r.reactions.filter(x => !haveR.has(x.id))];
  S.olderMore = r.more;
}
function connect() {
  es?.close();
  let first = true;
  es = new EventSource('/api/events');
  es.onopen = () => { S.online = true; if (!first) loadState().catch(() => {}); first = false; };
  es.onmessage = e => apply(JSON.parse(e.data));
  es.onerror = () => { S.online = false; if (es.readyState === 2) setTimeout(() => S.phase === 'app' && boot(), 4000); };
}
/** Kommt das Gerät gerade von der alten App? Die alte Adresse hängt dann Familie und Person an (#umzug=…). */
function readMove() {
  const raw = /umzug=([\w-]+)/.exec(location.hash)?.[1];
  if (!raw) return null;
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))));
    return typeof j?.f === 'string' ? j : null;
  } catch { return null; }
}
export async function boot() {
  es?.close(); es = null;
  const code = /join=([\w-]+)/.exec(location.hash)?.[1], move = readMove();
  let s;
  try {
    s = await api('GET', '/session');
    if (!s.joined && code) s = await api('POST', '/join', { code }).catch(e => { S.joinError = e.message; return s; });
    if (move) {
      S.preselect = move.me || null; // der Anmeldeschirm springt gleich zum richtigen Namen
      let next = '/';
      if (!s.joined) {
        try { s = await api('POST', '/join', { v1: move.f }); next = '/#join=' + s.code; } catch (e) { S.joinError = e.message; }
      }
      history.replaceState(null, '', next); // den alten Geheimcode nicht in der Adresse stehen lassen
    }
  } catch (e) { S.joinError = e.message; return void (S.phase = 'join'); }
  if (!s.joined) return void (S.phase = 'join');
  S.picker = s.members;
  if (!s.me) return void (S.phase = 'who');
  await enter();
}
export async function join(link) {
  const code = /join=([\w-]+)/.exec(link)?.[1] || link.trim();
  const s = await api('POST', '/join', { code });
  history.replaceState(null, '', '/#join=' + code); // bleibt in der Adresse, damit "Zum Home-Bildschirm" ihn mitnimmt
  S.picker = s.members; S.joinError = ''; S.phase = 'who';
}
export async function login(member_id, pin) { await api('POST', '/login', { member_id, pin }); await enter(); }
/** Zuletzt offener Reiter (übersteht Neuladen). */
const savedTab = () => { try { return JSON.parse(localStorage.getItem('pp_view') || 'null')?.tab || null; } catch { return null; } };
// Übersicht und Rangliste sind seit dem großen Update der Reiter „Familie“
const OLD_TABS = { uebersicht: 'familie', rang: 'familie' };
async function enter() { S.chat = []; S.chatBusy = {}; await loadState(); loadSeen(); loadChatSeen(); const t = savedTab(); S.tab = OLD_TABS[t] || t || (me?.role === 'admin' ? 'familie' : 'heute'); S.phase = 'app'; connect(); }
export async function switchPerson() { await post('/logout'); await boot(); }
export async function leave() { await post('/leave'); history.replaceState(null, '', '/'); await boot(); }

setInterval(() => { S.now = Date.now(); }, 30e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return void (hiddenAt = Date.now());
  S.now = Date.now();
  if (S.phase !== 'app') return;
  // Handys kappen die Verbindung im Hintergrund gern stillschweigend: nach einer Pause einmal frisch laden
  if (!es || es.readyState === 2) connect();
  if (Date.now() - hiddenAt > 20e3) loadState().catch(() => {});
});
