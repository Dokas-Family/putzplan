<script>
  // Admins: einen Dienst jemand anderem geben.
  import Head from '../parts/Head.svelte';
  import { G, mName, post } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  let { entry, close } = $props();
  async function give(m) {
    if (await tryDo(() => post(`/entries/${entry.id}/reassign`, { member_id: m.id }))) { toast(`${m.name} hat jetzt „${entry.title}“`); close(true); }
  }
</script>

<Head title="Dienst weitergeben" {close} />
<p class="sub">„{entry.title}“ hat gerade {mName(entry.member_id)}. Wer soll es machen?</p>
<div class="pick" style="margin-top:12px">
  {#each G.active.filter(m => m.id !== entry.member_id) as m (m.id)}
    {@const p = G.calc.per[m.id]}
    <button onclick={() => give(m)}>{m.emoji} {m.name} <small style="display:inline">· {p.duties.length} Dienste</small></button>
  {/each}
</div>
<p class="hint">Die Person bekommt eine Benachrichtigung. Das lässt sich im Protokoll zurücknehmen.</p>
