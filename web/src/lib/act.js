// Abläufe, die aus mehreren Schritten bestehen: Team wählen, Foto (oder Video) machen, speichern.
import { S, G, post, del, mName, apply } from './store.svelte.js';
import { open, toast, rain, tryDo } from './ui.svelte.js';
import { DEFAULT_RAIN } from '../../../shared/logic.js';
import Team from '../sheets/Team.svelte';
import Camera from '../sheets/Camera.svelte';

const shoot = (label, kind) => open(Camera, { label, kind }, true);
const CHEERS = ['Mega!', 'Stark gemacht!', 'Sauber!', 'Du rockst!', 'Haken dran!'];
const photoOnly = img => ({ photo: img.photo, thumb: img.thumb });

/** Das Video kommt nach dem Foto hinterher (roh, nicht als JSON). Klappt es nicht, bleibt das Foto trotzdem. */
async function sendVideo(id, step, blob) {
  if (!blob) return;
  toast('Video wird hochgeladen …', 60000);
  try {
    const r = await fetch(`/api/entries/${id}/video?step=${step}`, { method: 'POST', headers: { 'Content-Type': blob.type || 'video/mp4', 'X-Putzplan': '1' }, body: blob });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Das Video ging nicht hoch');
    for (const c of data.changes || []) apply(c);
    toast('Video ist drin.');
  } catch (e) { toast(`${e.message || 'Das Video ging nicht hoch'}. Das Foto ist aber gespeichert.`, 5000); }
}

/** Aufgabe aus dem Plan starten (task) oder eine zugewiesene/Extra-Aufgabe (entry). */
export async function start({ task, entry }) {
  const title = task?.title || entry.title;
  const team = await open(Team, { title });
  if (!team) return;
  const img = await shoot(title, 'before');
  if (!img) return;
  let res;
  if (await tryDo(async () => { res = await post('/entries/start', { ...(task ? { task_id: task.id } : { entry_id: entry.id }), helpers: team, ...photoOnly(img) }); })) {
    toast(team.length ? `Vorher ist drin. Los geht's im Team mit ${team.map(mName).join(' & ')}!` : 'Vorher ist drin. Jetzt loslegen!');
    await sendVideo(res.id, 'before', img.video);
  }
}
export async function finish(e) {
  const wait = (+S.settings.min_minutes || 0) * 60e3 - (Date.now() - new Date(e.before_at));
  if (wait > 0) return toast(`So schnell? Noch ${Math.ceil(wait / 60e3)} Min. Erst putzen, dann Foto!`);
  const img = await shoot(e.title, 'after');
  if (!img) return;
  let res;
  if (await tryDo(async () => { res = await post(`/entries/${e.id}/finish`, photoOnly(img)); })) {
    rain(G.me?.rain || DEFAULT_RAIN);
    toast(`${CHEERS[Math.floor(Math.random() * CHEERS.length)]} +${res.points} Punkte`);
    await sendVideo(e.id, 'after', img.video);
  }
}
export async function redo(e) {
  const img = await shoot(e.title, 'after');
  if (img && (await tryDo(() => post(`/entries/${e.id}/redo`, photoOnly(img))))) {
    toast('Neues Nachher-Foto ist drin.');
    await sendVideo(e.id, 'after', img.video);
  }
}
export async function cancel(e) {
  if (confirm('Abbrechen? Das Vorher-Foto wird gelöscht.')) await tryDo(() => post(`/entries/${e.id}/cancel`));
}
export async function join(e) {
  if (await tryDo(() => post(`/entries/${e.id}/join`))) toast(`Anfrage ist raus. ${mName(e.member_id)} muss dich noch bestätigen.`);
}
/** Wer angefangen hat: Mithelf-Anfrage annehmen oder ablehnen. */
export async function decideHelper(e, who, accept) {
  if (await tryDo(() => post(`/entries/${e.id}/pending`, { member_id: who, accept })) && accept) { rain('🤝💪✨'); toast(`${mName(who)} hilft jetzt mit!`); }
}
export const dropEntry = e => confirm('Diese Aufgabe von der Liste nehmen?') && tryDo(() => del(`/entries/${e.id}`));
/** Admins: PIN einer Person zurücksetzen. Sie legt beim nächsten Öffnen eine neue fest. */
export async function resetPin(m) {
  if (!confirm(`PIN von ${m.name} zurücksetzen? Beim nächsten Öffnen legt ${m.name} eine neue fest.`)) return;
  if (await tryDo(() => post(`/members/${m.id}/reset-pin`))) toast(`PIN zurückgesetzt. ${m.name} kann jetzt eine neue festlegen.`);
}
export async function redeem() {
  let res;
  if (await tryDo(async () => { res = await post('/redeem'); })) { rain('💰🪙✨😎'); toast(`${res.amount} Punkte eingelöst. Tagesziel geschafft!`); }
}
