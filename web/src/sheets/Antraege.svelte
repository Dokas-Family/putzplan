<script>
  // Admins: Anträge, die Claude im Chat gestellt hat. Annehmen trägt Bonus oder freien Tag gleich ein.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, post, mem, mName } from '../lib/store.svelte.js';
  import { open, toast, tryDo } from '../lib/ui.svelte.js';
  import ChatPhoto from './ChatPhoto.svelte';
  import Zoom from './Zoom.svelte';
  let { close } = $props();
  const list = $derived(G.openAntraege);
  const done = $derived(S.antraege.filter(a => a.status !== 'offen').slice(0, 5));
  const KIND = { bonus: 'Bonus', frei: 'Freier Tag', sonstiges: 'Sonstiges' };
  const what = a => (a.kind === 'bonus' ? `+${a.points} Punkte` : a.kind === 'frei' ? `frei am ${new Date(a.day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}` : 'Sonstiges');
  const proofPhoto = a => (a.proof?.startsWith('foto:') ? a.proof.slice(5) : null);
  const proofEntry = a => (a.proof?.startsWith('eintrag:') ? [...S.entries, ...S.older].find(e => e.id === a.proof.slice(8)) : null);
  async function decide(a, accept) {
    const note = accept ? '' : prompt('Kurz warum? (optional, sieht die Person)') ?? null;
    if (note === null) return;
    if (await tryDo(() => post(`/antraege/${a.id}/decide`, { accept, note }))) toast(accept ? 'Angenommen' : 'Abgelehnt');
    if (!G.openAntraege.length) close();
  }
</script>

<Head title="Anträge über Claude" {close} />
{#each list as a (a.id)}
  {@const ph = proofPhoto(a)}
  {@const en = proofEntry(a)}
  <div class="card antrag">
    <div class="row">
      <span class="ava sm">{mem(a.member_id)?.emoji || '🙂'}</span>
      <div class="grow">
        <b>{mName(a.member_id)}: {what(a)}</b>
        <small>{KIND[a.kind]} · {a.by && a.by !== a.member_id ? `beantragt von ${mName(a.by)} · ` : ''}{new Date(a.created_at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small>
      </div>
    </div>
    <p class="why">{a.reason}</p>
    {#if ph}
      <button class="cphoto" onclick={() => open(ChatPhoto, { name: ph })}><img src="/photos/{ph}.t.jpg" alt="Beweisfoto" /></button>
    {:else if en}
      <button class="link" onclick={() => open(Zoom, { entry: en })}><Icon name="images" size={14} />Beweis: {en.title}</button>
    {:else}
      <small class="late">Ohne Beweisfoto</small>
    {/if}
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn sec grow" onclick={() => decide(a, false)}><Icon name="x" size={16} />Ablehnen</button>
      <button class="btn ok grow" onclick={() => decide(a, true)}><Icon name="check" size={16} />Annehmen</button>
    </div>
  </div>
{:else}
  <p class="sub">Keine offenen Anträge.</p>
{/each}
{#if done.length}
  <h2 style="margin-top:14px">Zuletzt entschieden</h2>
  {#each done as a (a.id)}
    <p class="sub">{a.status === 'angenommen' ? '✅' : '❌'} {mName(a.member_id)}: {what(a)} · {a.reason}{a.decided_by ? ` (${mName(a.decided_by)})` : ''}</p>
  {/each}
{/if}
