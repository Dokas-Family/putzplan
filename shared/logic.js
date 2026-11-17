// Gemeinsame Regeln für Server und App: Datumsschlüssel, Fälligkeit, Punkte, Serie, Konto.
// Alles reine Funktionen. "st" ist der Zustand { members, tasks, entries, settings }.

export const pad = n => String(n).padStart(2, '0');
export const dKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const mKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const isoDay = d => ((d.getDay() + 6) % 7) + 1; // Mo=1 … So=7
export function weekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${pad(w)}`;
}
/** Mittag des Tages, n Tage vor (oder mit negativem n nach) dem Bezugstag. */
export const noon = (base = new Date(), back = 0) => { const x = new Date(base); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - back); return x; };
export const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };

export const DAYS = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAYS_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const FREQ = { daily: 'täglich', weekdays: 'Mo–Fr', tage: 'an bestimmten Tagen', weekly: '1x pro Woche', monthly: '1x im Monat', weekend: 'am Wochenende' };
/** „An bestimmten Tagen“: die Tage stehen als Bits in "day" (Mo = 1, Di = 2, Mi = 4 … So = 64). */
export const onDay = (t, d) => !!((+t.day || 0) & (1 << (isoDay(d) - 1)));
export const daysOf = t => [1, 2, 3, 4, 5, 6, 7].filter(i => (+t.day || 0) & (1 << (i - 1)));
export const ROLES = { admin: 'Admin', mitglied: 'Mitglied', kind: 'Kind' };
export const REACTS = ['❤️', '👏', '😍', '🔥', '😂', '🤢', '🙈'];
export const DEFAULT_SETTINGS = { min_minutes: 2, koch_regel: true, tagesziel: 10, ziel_gross: 10, ziel_klein: 6, review_first: false, erinnerung: true, dienste: true, extras_sperre: true, claude_aktiv: true, claude_prueft: true, rooms: {} };
export const DEFAULT_RAIN = '🎉✨⭐🧽💪🌈';
/** Claude als System-Konto: schreibt Kommentare und reagiert, ist aber keine Person im Haushalt. */
export const SYSTEM = { id: 'claude', name: 'Claude', emoji: '✨', role: 'system', active: false, system: true };

// Einträge ohne echte Aufgabe dahinter
export const ADMIN_KINDS = new Set(['bonus', 'warn', 'frei', 'redeem']);
export const SPECIAL = new Set(['adhoc', 'bonus', 'warn', 'frei', 'redeem']);
export const NOT_WEEK = new Set(['redeem', 'frei']);
export const WASCH = { id: 'wasch', title: 'Waschtag: Wäschekorb runterbringen (und abends Saubere wieder mitnehmen!)', room: 'Wäsche', freq: 'daily', minutes: 5, points: 2, leicht: true, per_person: true, active: true, virtual: true };

export const ptsOf = t => (t?.points != null && t.points !== '' ? +t.points : Math.max(1, Math.round((t?.minutes || 5) / 5)));

// ---------- Fälligkeit ----------
export function periodOf(t, d) {
  if (t.id === 'adhoc') return dKey(d);
  switch (t.freq) { case 'weekly': case 'weekend': return weekKey(d); case 'monthly': return mKey(d); default: return dKey(d); }
}
export function activeOn(t, d) {
  const wd = isoDay(d);
  if (t.freq === 'weekdays') return wd <= 5;
  if (t.freq === 'weekend') return wd >= 6;
  if (t.freq === 'tage') return onDay(t, d);
  return true;
}
export function dueOn(t, d) {
  const wd = isoDay(d);
  switch (t.freq) {
    case 'daily': return true;
    case 'weekdays': return wd <= 5;
    case 'weekend': return wd >= 6;
    case 'tage': return onDay(t, d);
    case 'weekly': return wd === (+t.day || 1);
    case 'monthly': return d.getDate() === Math.min(+t.day || 1, 28);
  }
  return false;
}
export function overdueInPeriod(t, d) {
  if (t.freq === 'weekly') return isoDay(d) > (+t.day || 1);
  if (t.freq === 'monthly') return d.getDate() > Math.min(+t.day || 1, 28);
  return false;
}
export const lateLabel = t => (t.freq === 'weekly' ? `seit ${DAYS[+t.day || 1]}` : `seit dem ${Math.min(+t.day || 1, 28)}.`);
export const slotOf = (t, memberId) => (t.per_person ? memberId : '');
export const entryKey = (taskId, period, slot) => `${taskId}|${period}|${slot || ''}`;

// ---------- Personen ----------
export const isAway = (m, d) => !!(m.away_from && m.away_to && dKey(d) >= m.away_from && dKey(d) <= m.away_to);
export const weight = (m, d) => (isAway(m, d) ? 0 : +(isoDay(d) >= 6 ? m.w_weekend : m.w_weekday) || 0);
/** Tagesziel: Pensum mal Tagesziel, aber nie unter dem Minimum (Erwachsene/Kinder). Wer frei hat (Gewicht 0), hat kein Ziel. */
export function dayGoal(m, d, settings) {
  const w = weight(m, d);
  if (w <= 0) return 0;
  const min = m.role === 'kind' ? +(settings.ziel_klein ?? 6) : +(settings.ziel_gross ?? 10);
  return Math.max(Math.round(w * (+settings.tagesziel || 10)), min || 0);
}
export function personalTasksFor(st, m, d) {
  const out = [];
  for (const t of st.tasks) {
    if (!t.active || !t.per_person || !activeOn(t, d)) continue;
    if (m.role === 'kind' && !t.leicht) continue;
    out.push(t);
  }
  if (+m.waschtag === isoDay(d)) out.unshift(WASCH);
  return out;
}

// ---------- Punkte ----------
export const involved = (e, id) => e.member_id === id || (e.helpers || []).includes(id);
/** Punkte einer Aufgabe werden fair geteilt (aufgerundet). */
export function shares(e) {
  const ids = [e.member_id, ...(e.helpers || []).filter(x => x !== e.member_id)];
  const p = +e.points || 0;
  if (ids.length === 1 || p < 0) return { [e.member_id]: p };
  const each = Math.ceil(p / ids.length);
  return Object.fromEntries(ids.map(i => [i, each]));
}
/** Zählt der Eintrag für Punkte? Mit der Regel "erst nach dem Prüfen" nur geprüfte Aufgaben. */
export const counts = (e, settings) => e.status === 'done' && !!e.after_at && (!settings.review_first || ADMIN_KINDS.has(e.task_id) || e.review === 'ok');

// ---------- Dienste ----------
/**
 * Ein Dienst ist, was jemand bekommen hat: vom Dienstplan, von einem Admin zugewiesen oder „Wer kocht, räumt auf“.
 * Was man sich selbst aussucht, ist kein Dienst.
 */
export const isDuty = e => !!e && !ADMIN_KINDS.has(e.task_id) && (e.created_by === 'plan' || e.note === 'koch' || (!!e.created_by && e.created_by !== e.member_id));
export const isOpen = e => e.status === 'todo' || e.status === 'started';
/** Der Tag, für den ein Dienst gedacht war. */
export const dutyDay = e => dKey(new Date(e.created_at));
/** Gilt an diesem Tag schon der Dienstplan? Davor zählte das Tagesziel in Punkten. */
export const planOn = (settings, d) => !!settings?.dienste && !!settings.plan_start && dKey(d) >= settings.plan_start;
/** Ähnliche Aufgaben gelten als dieselbe („Spülmaschine einräumen“ gibt es mehrfach). */
export const taskKey = title => String(title || '').toLowerCase().replace(/[^a-zäöüß ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');

/** Einmal pro Zustand bauen, danach sind Tagespunkte, Dienste und "gibt es schon einen Eintrag?" billig. */
export function buildIndex(st) {
  const day = new Map(), byKey = new Map(), redeemed = {}, duty = new Map(), open = new Map();
  const push = (map, k, e) => (map.get(k) || map.set(k, []).get(k)).push(e);
  for (const e of st.entries) {
    if (e.status !== 'rejected' && isDuty(e)) {
      push(duty, `${e.member_id}|${dutyDay(e)}`, e);
      if (isOpen(e)) push(open, e.member_id, e);
    }
    if (e.status !== 'rejected' && e.task_id !== 'adhoc') byKey.set(entryKey(e.task_id, e.period, e.slot), e);
    if (!counts(e, st.settings)) continue;
    if (e.task_id === 'redeem') redeemed[e.member_id] = (redeemed[e.member_id] || 0) + (+e.points || 0);
    if (e.task_id === 'bonus' || e.task_id === 'warn') continue;
    const k = dKey(new Date(e.after_at));
    for (const [id, p] of Object.entries(shares(e))) day.set(`${id}|${k}`, (day.get(`${id}|${k}`) || 0) + p);
  }
  return { day, byKey, redeemed, duty, open };
}
export const entryFor = (ix, t, d, memberId) => ix.byKey.get(entryKey(t.id, periodOf(t, d), slotOf(t, memberId)));
export const dayPoints = (ix, id, d) => ix.day.get(`${id}|${dKey(d)}`) || 0;
/** Dienste einer Person für einen Tag. Für heute kommen ältere dazu, die noch offen sind (z. B. ein Wochendienst von gestern). */
export function dutiesOn(ix, id, d, today = d) {
  const k = dKey(d), list = ix.duty.get(`${id}|${k}`) || [];
  if (k !== dKey(today)) return list;
  return [...(ix.open.get(id) || []).filter(e => dutyDay(e) < k), ...list];
}
export const openDuties = (ix, id) => ix.open.get(id) || [];
/** Dienste der laufenden Woche bis heute: wie viele es waren und wie viele erledigt sind. */
export function dutyWeek(ix, id, today = new Date()) {
  let total = 0, done = 0;
  for (let i = 0; i < isoDay(today); i++) {
    for (const e of ix.duty.get(`${id}|${dKey(noon(today, i))}`) || []) { total++; if (e.status === 'done') done++; }
  }
  return { total, done };
}

/** Punktekonto: was an den letzten 35 Tagen über dem Tagesziel lag, minus Eingelöstes. */
export function bank(ix, m, st, today = new Date()) {
  let earned = 0;
  for (let i = 1; i <= 35; i++) { const d = noon(today, i); earned += Math.max(0, dayPoints(ix, m.id, d) - dayGoal(m, d, st.settings)); }
  return Math.max(0, earned - (ix.redeemed[m.id] || 0));
}
/**
 * Serie: Tage am Stück, die geschafft sind. Mit Dienstplan heißt das: alle Dienste erledigt (Tage ohne Dienste
 * zählen nicht mit und brechen nichts ab, die Serie beginnt frühestens mit dem Dienstplan). Ohne: Tagesziel erreicht.
 */
export function streak(ix, m, st, today = new Date()) {
  if (planOn(st.settings, today)) {
    let n = dayState(st, ix, m, noon(today), today) === 'ok' ? 1 : 0;
    for (let i = 1; i <= 60; i++) {
      const d = noon(today, i);
      if (!planOn(st.settings, d)) break;
      const s = dayState(st, ix, m, d, today);
      if (s === 'frei') continue;
      if (s === 'ok') n++; else break;
    }
    return n;
  }
  let n = 0;
  const t = noon(today), g0 = dayGoal(m, t, st.settings);
  if (g0 > 0 && dayPoints(ix, m.id, t) >= g0) n++;
  for (let i = 1; i <= 35; i++) { const d = noon(today, i), g = dayGoal(m, d, st.settings); if (g <= 0) continue; if (dayPoints(ix, m.id, d) >= g) n++; else break; }
  return n;
}
function sumBy(st, match) {
  const pts = {}, cnt = {}, warn = {}, bonus = {};
  for (const m of st.members) { pts[m.id] = 0; cnt[m.id] = 0; warn[m.id] = 0; bonus[m.id] = 0; }
  for (const e of st.entries) {
    if (!counts(e, st.settings) || NOT_WEEK.has(e.task_id) || !match(new Date(e.after_at))) continue;
    const bag = e.task_id === 'warn' ? warn : e.task_id === 'bonus' ? bonus : cnt;
    for (const [id, p] of Object.entries(shares(e))) { pts[id] = (pts[id] || 0) + p; bag[id] = (bag[id] || 0) + 1; }
  }
  return { pts, cnt, warn, bonus };
}
/** Punkte eines Tages, einer Woche, eines Monats: Aufgaben, Belohnungen und Abmahnungen. Überall dieselbe Rechnung. */
export const dayTotals = (st, d = new Date()) => { const k = dKey(d); return sumBy(st, x => dKey(x) === k); };
export const weekPoints = (st, d = new Date()) => { const wk = weekKey(d); return sumBy(st, x => weekKey(x) === wk); };
export const monthPoints = (st, d = new Date()) => { const mk = mKey(d); return sumBy(st, x => mKey(x) === mk); };

/** König/Königin der Woche: meiste Punkte in der Vorwoche. */
export function royals(st, d = new Date()) {
  const { pts } = weekPoints(st, noon(d, 7));
  const act = st.members.filter(m => m.active);
  const max = Math.max(0, ...act.map(m => pts[m.id] || 0));
  return max <= 0 ? [] : act.filter(m => (pts[m.id] || 0) === max).map(m => ({ m, pts: max }));
}
export const royalDayTaken = (st, m, d = new Date()) => st.entries.find(e => e.task_id === 'frei' && e.member_id === m.id && e.note === 'royal' && e.status === 'done' && weekKey(new Date(e.after_at)) === weekKey(d));
export const royalTitle = m => ({ k: 'König', q: 'Königin' })[m.titel] || 'Majestät';

/** Tagesstand für das Wochenraster: ok | teil | miss | frei | future | now */
export function dayState(st, ix, m, d, today = new Date(), since = '') {
  const k = dKey(d), tk = dKey(today);
  if (k > tk || k < since) return 'future'; // "since": Tage, bevor es überhaupt Einträge gab, bleiben leer
  if (planOn(st.settings, d)) {
    const ds = dutiesOn(ix, m.id, d, today), done = ds.filter(e => e.status === 'done').length;
    if (!ds.length) return 'frei';
    if (done === ds.length) return 'ok';
    if (k === tk) return 'now';
    return done ? 'teil' : 'miss';
  }
  const g = dayGoal(m, d, st.settings), p = dayPoints(ix, m.id, d);
  if (g <= 0 || st.entries.some(e => e.task_id === 'frei' && e.member_id === m.id && e.status === 'done' && e.period === k)) return 'frei';
  if (p >= g) return 'ok';
  if (k === tk) return 'now';
  return p > 0 ? 'teil' : 'miss';
}
