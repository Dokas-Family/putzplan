<script>
  // Team eines Eintrags: Wer angefangen hat, nimmt Helfer bis 24 Stunden nach dem Abhaken wieder heraus.
  // Wer aus Versehen dabei ist, tritt selbst aus. Admins dürfen das immer. Die Punkte teilen sich danach neu auf.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, mem, mName, post } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  let { id, close } = $props();
  const e = $derived([...S.entries, ...S.older].find(x => x.id === id));
  const owner = $derived(e?.member_id === S.meId);
  async function out(who) {
    const self = who === S.meId;
    if (!confirm(self ? 'Du warst doch nicht dabei? Dann bist du raus und bekommst keine Punkte dafür.' : `${mName(who)} aus dem Team nehmen? Die Punkte teilen sich dann neu auf.`)) return;
    if (await tryDo(() => post(`/entries/${id}/remove-helper`, { member_id: who }))) { toast(self ? 'Du bist raus.' : `${mName(who)} ist raus.`); if (self) close(); }
  }
  const decide = (who, accept) => tryDo(() => post(`/entries/${id}/pending`, { member_id: who, accept }));
</script>

<Head title="Team" {close} />
{#if e}
  <p class="sub" style="margin-bottom:10px">{e.title}</p>
  <div class="list">
    <div class="row"><span class="ava sm">{mem(e.member_id)?.emoji || '🙂'}</span><div class="grow"><b>{mName(e.member_id)}</b><small>hat angefangen</small></div></div>
    {#each e.helpers as h (h)}
      <div class="row">
        <span class="ava sm">{mem(h)?.emoji || '🙂'}</span>
        <div class="grow"><b>{mName(h)}</b><small>hilft mit</small></div>
        {#if owner || G.admin || h === S.meId}<button class="btn sec sm" onclick={() => out(h)}><Icon name="user-minus" size={16} />{h === S.meId ? 'War nicht dabei' : 'Rausnehmen'}</button>{/if}
      </div>
    {/each}
    {#each e.pending as h (h)}
      <div class="row">
        <span class="ava sm">{mem(h)?.emoji || '🙂'}</span>
        <div class="grow"><b>{mName(h)}</b><small>möchte mithelfen</small></div>
        {#if (owner || G.admin) && e.status === 'started'}
          <button class="icb" onclick={() => decide(h, false)} aria-label="Ablehnen"><Icon name="x" size={16} /></button>
          <button class="btn ok sm" onclick={() => decide(h, true)}><Icon name="check" size={16} />Annehmen</button>
        {/if}
      </div>
    {/each}
  </div>
  <p class="hint">Herausnehmen geht bis 24 Stunden nach dem Abhaken. Die Punkte teilen sich danach automatisch neu auf.</p>
{/if}
