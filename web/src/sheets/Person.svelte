<script>
  // Eine Person auf einen Blick (aus „Familie“): was sie heute hat. Offene Dienste anderer lassen sich übernehmen,
  // Admins haben zusätzlich alle Aktionen (belohnen, frei, krank, zuweisen, bearbeiten, PIN).
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, mem } from '../lib/store.svelte.js';
  import { open } from '../lib/ui.svelte.js';
  import { resetPin, takeover } from '../lib/act.js';
  import Action from './Action.svelte';
  import MemberEdit from './MemberEdit.svelte';
  import Points from './Points.svelte';
  import DutyPick from './DutyPick.svelte';
  import Krank from './Krank.svelte';
  let { id, close } = $props();
  const m = $derived(mem(id)), p = $derived(G.calc.per[id]), self = $derived(id === S.meId);
  const today = $derived(S.entries.filter(e => L.involved(e, id) && !L.ADMIN_KINDS.has(e.task_id) && ((e.status === 'done' && L.dKey(new Date(e.after_at)) === G.calc.today) || e.status === 'started' || e.status === 'todo' || (e.status === 'missed' && L.dutyDay(e) >= L.dKey(L.noon(G.calc.d, 1))))));
  const time = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const act = kind => open(Action, { kind, member: id });
  const canTake = e => !self && e.status === 'todo' && e.member_id === id && L.isDuty(e) && L.dutyDay(e) === G.calc.today;
  const ICON = { done: ['ok', 'check'], started: ['brand', 'timer'], missed: ['bad', 'x'], todo: ['warn', 'circle-dashed'] };
  const sub = e => (e.status === 'done' ? `fertig um ${time(e.after_at)}` : e.status === 'started' ? `läuft seit ${time(e.before_at)}` : e.status === 'missed' ? 'gestern liegen geblieben' : L.isDuty(e) ? 'Dienst, noch offen' : 'Extra, selbst eingetragen');
</script>

{#if m && p}
  <Head title="{m.emoji} {m.name}" {close}><span class="chip c-brand">{L.ROLES[m.role]}</span></Head>
  {#if p.krank}<div class="note c-info"><Icon name="thermometer" size={18} /><span>Heute krank gemeldet. Gute Besserung!</span></div>
  {:else if p.frei}<div class="note c-info"><Icon name="tree-palm" size={18} /><span>Hat heute frei.</span></div>{/if}
  <div class="stats">
    {#if G.plan}<div><b>{p.dutiesDone}/{p.duties.length}</b><small>Dienste</small></div>{:else}<div><b>{p.goalPts}{p.goal ? '/' + p.goal : ''}</b><small>Tagesziel</small></div>{/if}
    <div><b>{p.today}</b><small>P heute</small></div>
    <div><b>{p.week}</b><small>P Woche</small></div>
    <div><b>{p.streak}</b><small>Serie</small></div>
  </div>
  <div class="list" style="margin-top:10px">
    {#each today as e (e.id)}
      <div class="row">
        <span class="tile c-{ICON[e.status]?.[0] || 'warn'}"><Icon name={ICON[e.status]?.[1] || 'circle-dashed'} /></span>
        <div class="grow"><b>{e.title}</b><small>{sub(e)}{e.fuer ? ' · übernommen' : ''}</small></div>
        {#if canTake(e)}<button class="btn sec sm" onclick={async () => { await takeover(e); }}><Icon name="repeat" size={15} />Übernehmen</button>{/if}
        {#if G.admin && e.status === 'todo' && L.isDuty(e)}<button class="icb" onclick={() => open(DutyPick, { entry: e })} aria-label="Jemand anderem geben"><Icon name="shuffle" size={16} /></button>{/if}
        {#if e.status === 'done'}<span class="pts">+{L.shares(e)[id] ?? e.points}</span>{/if}
      </div>
    {:else}
      <p class="sub">Heute noch nichts.</p>
    {/each}
  </div>
  {#if today.some(canTake)}<p class="hint">Übernehmen: Du machst den Dienst, bekommst die Punkte und +1 Bonus.</p>{/if}

  {#if G.admin}
    <div class="quick" style="margin-top:14px">
      <button class="btn ok sm" onclick={() => act('bonus')}><Icon name="star" size={16} />Belohnung</button>
      <button class="btn bad sm" onclick={() => act('warn')}><Icon name="triangle-alert" size={16} />Abmahnung</button>
      <button class="btn info sm" onclick={() => act('frei')}><Icon name="tree-palm" size={16} />Frei geben</button>
      <button class="btn info sm" onclick={() => open(Krank, { member: id })}><Icon name="thermometer" size={16} />Krank</button>
      <button class="btn sm" onclick={() => act('assign')}><Icon name="clipboard-list" size={16} />Zuweisen</button>
      <button class="btn sec sm" onclick={() => open(Points, { member: m })}><Icon name="history" size={16} />Punkte</button>
    </div>
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn sec sm grow" onclick={() => open(MemberEdit, { member: m })}><Icon name="pencil" size={16} />Bearbeiten</button>
      {#if m.has_pin}<button class="btn sm grow {m.pin_help ? 'warn' : 'sec'}" onclick={() => resetPin(m)}><Icon name="key-round" size={16} />{m.pin_help ? 'PIN vergessen' : 'PIN zurücksetzen'}</button>{/if}
    </div>
    {#if !m.has_pin}<p class="hint">Noch keine PIN. {m.name} legt beim nächsten Öffnen der App eine fest.</p>{/if}
  {:else if self}
    <button class="btn info wide" style="margin-top:14px" onclick={() => open(Krank)}><Icon name="thermometer" size={16} />{p.krank ? 'Krankmeldung ansehen' : 'Krank melden'}</button>
  {/if}
{/if}
