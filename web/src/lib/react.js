// Reaktionen: erscheinen sofort im Handy, der Server bekommt sie hinterher. Geht etwas schief, wird es zurückgenommen.
import { S, reactionsOf, post } from './store.svelte.js';
import { rain, toast } from './ui.svelte.js';

/** Reaktion an- oder ausschalten. */
export function toggle(entry, emoji) {
  const mine = reactionsOf(entry.id).find(r => r.emoji === emoji && r.member_id === S.meId);
  if (mine) {
    S.reactions = S.reactions.filter(r => r.id !== mine.id);
    post('/reactions', { entry_id: entry.id, emoji, on: false }).catch(e => { S.reactions = [...S.reactions, mine]; toast(e.message); });
  } else add(entry, emoji, true);
}
function add(entry, emoji, withRain) {
  const r = { id: crypto.randomUUID(), entry_id: entry.id, member_id: S.meId, emoji, text: null, created_at: new Date().toISOString() };
  S.reactions = [...S.reactions, r];
  if (withRain) rain(emoji.repeat(3));
  post('/reactions', { id: r.id, entry_id: entry.id, emoji, on: true }).catch(e => { S.reactions = S.reactions.filter(x => x.id !== r.id); toast(e.message); });
}
/** Doppelt tippen: Herz geben. Ein zweites Doppeltippen nimmt es nicht wieder weg (wie man es kennt). */
export function like(entry) {
  if (reactionsOf(entry.id).some(r => r.emoji === '❤️' && r.member_id === S.meId)) return;
  add(entry, '❤️', false);
  navigator.vibrate?.(12);
}
