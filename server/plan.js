// Dienstplan: verteilt jeden Morgen die Dienste (die großen Aufgaben) fair auf alle, die da sind.
// Fair heißt: nach Pensum (Gewicht der Person), und wer etwas zuletzt oft gemacht hat, ist seltener wieder dran.
// So landet zum Beispiel die Küche nicht immer bei derselben Person.
import { randomUUID, createHash } from 'node:crypto';
import { q, row, out, insert, patch, remove, getMeta, setMeta, settings, logicState } from './db.js';
import { emit, emitDel, emitSettings, emitAll, now } from './core.js';
import { notify } from './push.js';
import * as L from '../shared/logic.js';

const tie = s => createHash('sha256').update(s).digest().readUInt32BE(0) / 2 ** 32;
const AB_STUNDE = 4; // vorher wird für den neuen Tag noch nichts verteilt

/** Ab wann gilt der Dienstplan? Beim ersten Einschalten: heute, wenn noch Vormittag ist, sonst ab morgen. */
export function initPlan(d = new Date()) {
  const s = settings();
  if (!s.dienste || s.plan_start) return;
  const env = process.env.PLAN_START;
  setMeta('plan_start', env && /^\d{4}-\d{2}-\d{2}$/.test(env) ? env : L.dKey(L.noon(d, d.getHours() < 12 ? 0 : -1)));
  emitSettings(settings());
}

/** Wer kann an diesem Tag Dienste bekommen? Aktiv, da, Pensum über null und kein freier Tag. */
function people(st, d) {
  const k = L.dKey(d);
  return st.members.filter(m => m.active && L.weight(m, d) > 0 && !st.entries.some(e => e.task_id === 'frei' && e.member_id === m.id && e.status === 'done' && e.period === k));
}
/** Dienste, die heute dran oder liegengeblieben sind und die noch niemand hat oder erledigt hat. */
function dueTasks(st, d, ix) {
  return st.tasks.filter(t => t.active && t.pflicht && !t.per_person && !t.proposed_by && L.activeOn(t, d) && (L.dueOn(t, d) || L.overdueInPeriod(t, d)) && !L.entryFor(ix, t, d, null));
}

/**
 * Verteilt alle offenen Dienste des Tages. Was schon vergeben ist, bleibt, wie es ist.
 * Liefert die neuen Einträge. "d" ist der Tag (für Tests und die Probe auch ein anderer als heute).
 */
export function makePlan(d = new Date(), st = logicState()) {
  const k = L.dKey(d), ix = L.buildIndex(st);
  const ppl = people(st, d), tasks = dueTasks(st, d, ix).sort((a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id));
  if (!ppl.length || !tasks.length) return [];
  const w = Object.fromEntries(ppl.map(m => [m.id, L.weight(m, d)]));
  const load = Object.fromEntries(ppl.map(m => [m.id, 0])); // Minuten, die jemand heute schon hat
  const hist = Object.fromEntries(ppl.map(m => [m.id, { min: 0, task: {}, room: {} }])); // die letzten 7 Tage
  const tasksById = new Map(st.tasks.map(t => [t.id, t])), since = L.dKey(L.noon(d, 7));
  for (const e of st.entries) {
    if (e.status === 'rejected' || L.ADMIN_KINDS.has(e.task_id)) continue;
    const t = tasksById.get(e.task_id), mins = +t?.minutes || 5;
    if (L.isDuty(e) && L.isOpen(e) && L.dutyDay(e) === k && load[e.member_id] != null) load[e.member_id] += mins;
    if (e.status !== 'done') continue; // Verpasstes zählt nicht als „schon gemacht“, sonst käme man so drum herum
    const day = L.dKey(new Date(e.after_at));
    if (day < since || day >= k) continue;
    const team = [e.member_id, ...(e.helpers || []).filter(x => x !== e.member_id)];
    for (const id of team) {
      const h = hist[id];
      if (!h) continue;
      h.min += mins / team.length;
      const tk = L.taskKey(e.title);
      h.task[tk] = (h.task[tk] || 0) + 1;
      if (t?.room) h.room[t.room] = (h.room[t.room] || 0) + 1;
    }
  }
  const made = [], todayTask = Object.fromEntries(ppl.map(m => [m.id, {}]));
  for (const t of tasks) {
    const cands = ppl.filter(m => m.role !== 'kind' || t.leicht);
    if (!cands.length) continue; // bleibt offen, jeder darf
    const tk = L.taskKey(t.title);
    let best = null, bestScore = Infinity;
    for (const m of cands) {
      const h = hist[m.id];
      const score = (load[m.id] + (+t.minutes || 5)) / w[m.id] // heute nach Pensum gleich verteilt
        + (0.3 * h.min) / 7 / w[m.id] // wer zuletzt viel gemacht hat, bekommt etwas weniger
        + 5 * Math.min(3, h.task[tk] || 0) // dieselbe Aufgabe wandert weiter …
        + 25 * (todayTask[m.id][tk] || 0) // … und dreimal Spülmaschine am selben Tag geht nicht an eine Person
        + (h.room[t.room] || 0) // derselbe Bereich ein bisschen auch
        + tie(k + t.id + m.id); // Gleichstand: jeden Tag anders
      if (score < bestScore) { bestScore = score; best = m; }
    }
    todayTask[best.id][tk] = (todayTask[best.id][tk] || 0) + 1;
    const e = { id: randomUUID(), task_id: t.id, title: t.title, member_id: best.id, period: L.periodOf(t, d), slot: '', status: 'todo', points: 0, created_at: d.toISOString(), created_by: 'plan', helpers: [] };
    try { insert('entries', e); } catch (err) { if (/UNIQUE/i.test(err.message)) continue; throw err; }
    load[best.id] += +t.minutes || 5;
    st.entries.push(out('entries', row('entries', e.id)));
    made.push(row('entries', e.id));
  }
  for (const e of made) emit('entries', e);
  return made;
}

/** Dienste, deren Zeitraum vorbei ist und die keiner angefangen hat, gelten als verpasst. */
export function expire(d = new Date()) {
  const k = L.dKey(d);
  for (const r of q.all("select * from entries where status = 'todo'")) {
    const e = out('entries', r);
    if (!L.isDuty(e)) continue;
    const t = e.task_id === 'adhoc' ? null : row('tasks', e.task_id);
    const over = t ? e.period !== L.periodOf(out('tasks', t), d) : e.period < k;
    if (!over) continue;
    patch('entries', e.id, { status: 'missed' });
    emit('entries', row('entries', e.id));
  }
}

const list = es => es.map(e => e.title.replace(/\s*\(.*?\)\s*/g, ' ').trim()).join(', ');
/** Jedem sagen, welche Dienste er (neu) hat. */
export function tell(entries, title = 'Deine Dienste heute') {
  const by = {};
  for (const e of entries) (by[e.member_id] ||= []).push(e);
  for (const [id, es] of Object.entries(by)) notify(id, title, list(es));
}

/** Einmal pro Tag (ab 4 Uhr): Verpasstes markieren, dann verteilen. Mit force auch ein zweites Mal (Admins: „neu verteilen“). */
export function ensurePlan(d = new Date(), { force = false } = {}) {
  const s = settings(), k = L.dKey(d);
  if (!L.planOn(s, d) || (!force && (d.getHours() < AB_STUNDE || getMeta('plan_day') === k))) return [];
  setMeta('plan_day', k);
  expire(d);
  const made = makePlan(d);
  if (!force && d.getHours() >= 7) tell(made); // der Morgen-Wecker um 7 hat schon geläutet
  return made;
}

/** Unangefangene Plan-Dienste von heute wieder einsammeln (nur von "memberId" oder von allen). */
export function takeBack(d = new Date(), memberId = null) {
  const k = L.dKey(d), gone = [];
  for (const r of q.all("select * from entries where status = 'todo' and created_by = 'plan' and fuer is null")) { // Übernommenes bleibt, wo es ist
    if (L.dutyDay(r) !== k || (memberId && r.member_id !== memberId)) continue;
    remove('entries', r.id);
    emitDel('entries', r.id);
    gone.push(r);
  }
  return gone;
}
/**
 * Tagesregeln festschreiben (beim Start und jede Stunde, also kurz nach Mitternacht für den neuen Tag):
 * Tagesziel und Dienstplan an/aus je Person für heute und alle fehlenden Tage der letzten zwei Wochen.
 * Was schon festgeschrieben ist, bleibt. So gelten geänderte Regeln erst ab dem nächsten Tag.
 */
export function fixDays(d = new Date()) {
  const s = settings(), members = q.all('select * from members').map(r => out('members', r)), iso = now();
  for (let i = 14; i >= 0; i--) {
    const day = L.noon(d, i);
    for (const m of members) {
      const id = L.tagKey(m.id, day);
      if (row('tage', id)) continue;
      insert('tage', { id, member_id: m.id, day: L.dKey(day), goal: L.dayGoal({ ...m, away_from: null, away_to: null }, day, s), plan: L.planOn(s, day) ? 1 : 0, created_at: iso });
      emitAll({ t: 'tage', row: out('tage', row('tage', id)) });
    }
  }
}
/** Jemand hat heute doch frei (oder ist weg): seine Dienste gehen an die anderen. */
export function freeUp(memberId, d = new Date()) {
  if (!L.planOn(settings(), d)) return;
  if (!takeBack(d, memberId).length) return;
  const made = makePlan(d);
  tell(made, `Neuer Dienst, ${row('members', memberId)?.name || 'jemand'} hat frei`);
}
