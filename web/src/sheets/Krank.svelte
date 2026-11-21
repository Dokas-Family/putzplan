<script>
  // Krank melden: für sich selbst, Admins auch für andere. Zählt wie frei, die Dienste gehen an die anderen.
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, mName } from '../lib/store.svelte.js';
  import { krank, gesund } from '../lib/act.js';
  let { member = null, close } = $props();
  const id = $derived(member || S.meId), self = $derived(id === S.meId);
  // schon krank gemeldet: ab welchem Tag bis wann
  const sick = $derived(S.entries.filter(e => e.task_id === 'frei' && e.note === 'krank' && e.status === 'done' && e.member_id === id && e.period >= G.calc.today).map(e => e.period).sort());
  const later = $derived(sick.filter(k => k > G.calc.today));
  const day = k => L.fromKey(k).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const OPTS = [[1, 'Nur heute'], [2, 'Heute und morgen'], [3, '3 Tage']];
  async function go(n) { if (await krank(n, id)) close(); }
  async function well() { await gesund(id); close(); }
</script>

<Head title={self ? 'Krank melden' : `${mName(id)} krank melden`} {close} />
{#if sick.length}
  <div class="note c-info"><Icon name="thermometer" size={18} /><span>{self ? 'Du bist' : `${mName(id)} ist`} krank gemeldet bis {day(sick.at(-1))}.</span></div>
  {#if later.length}<button class="btn ok wide" style="margin-top:12px" onclick={well}><Icon name="heart" size={16} />Wieder gesund ab morgen</button>{/if}
  <p class="hint">Heute bleibt, wie es ist. {later.length ? '' : 'Für morgen ist nichts mehr eingetragen.'}</p>
{:else}
  <p class="sub">{self ? 'Gute Besserung! Deine Dienste gehen an die anderen, deine Serie bleibt stehen.' : `Die Dienste von ${mName(id)} gehen an die anderen, die Serie bleibt stehen.`} Dorina und Felix bekommen Bescheid.</p>
  <div class="opts">
    {#each OPTS as [n, label] (n)}
      <button class="opt" onclick={() => go(n)}><Icon name="thermometer" size={18} /><span class="grow">{label}</span><Icon name="chevron-right" size={16} /></button>
    {/each}
  </div>
{/if}
