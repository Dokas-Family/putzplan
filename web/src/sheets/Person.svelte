<script>
  // Alles zu einer Person an einem Ort (nur Admins).
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, mem } from '../lib/store.svelte.js';
  import { open } from '../lib/ui.svelte.js';
  import { resetPin } from '../lib/act.js';
  import Action from './Action.svelte';
  import MemberEdit from './MemberEdit.svelte';
  import Points from './Points.svelte';
  import DutyPick from './DutyPick.svelte';
  let { id, close } = $props();
  const m = $derived(mem(id)), p = $derived(G.calc.per[id]);
  const today = $derived(S.entries.filter(e => L.involved(e, id) && !L.ADMIN_KINDS.has(e.task_id) && ((e.status === 'done' && L.dKey(new Date(e.after_at)) === G.calc.today) || e.status === 'started' || e.status === 'todo' || (e.status === 'missed' && L.dutyDay(e) >= L.dKey(L.noon(G.calc.d, 1))))));
  const time = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const act = kind => open(Action, { kind, member: id });
</script>

{#if m && p}
  <Head title="{m.emoji} {m.name}" {close}><span class="chip c-brand">{L.ROLES[m.role]}</span></Head>
  <div class="stats" style="margin:0 0 14px">
    {#if G.plan}<div><b>{p.dutiesDone}/{p.duties.length}</b><small>Dienste</small></div>{:else}<div><b>{p.goalPts}{p.goal ? '/' + p.goal : ''}</b><small>Tagesziel</small></div>{/if}
    <div><b>{p.today}</b><small>P heute</small></div>
    <div><b>{p.week}</b><small>P Woche</small></div>
    <div><b>{p.streak}</b><small>Tage Serie</small></div>
  </div>
  {#if G.plan && p.dutyWeek?.total}<p class="hint" style="margin:-6px 0 10px">Diese Woche {p.dutyWeek.done} von {p.dutyWeek.total} Diensten erledigt.</p>{/if}
  <div class="list">
    <h2>Heute</h2>
    {#each today as e (e.id)}
      <div class="row">
        <span class="tile c-{e.status === 'done' ? 'ok' : e.status === 'started' ? 'brand' : e.status === 'missed' ? 'bad' : 'warn'}"><Icon name={e.status === 'done' ? 'check' : e.status === 'started' ? 'timer' : e.status === 'missed' ? 'x' : 'clipboard-list'} /></span>
        <div class="grow"><b>{e.title}</b><small>{e.status === 'done' ? `fertig um ${time(e.after_at)}` : e.status === 'started' ? `läuft seit ${time(e.before_at)}` : e.status === 'missed' ? 'gestern nicht gemacht' : L.isDuty(e) ? (e.created_by === 'plan' ? 'Dienst, noch nicht angefangen' : 'zugewiesen, noch nicht angefangen') : 'selbst eingetragen'}</small></div>
        {#if e.status === 'todo' && L.isDuty(e)}<button class="icb" onclick={() => open(DutyPick, { entry: e })} aria-label="Jemand anderem geben"><Icon name="shuffle" size={16} /></button>{/if}
        {#if e.status === 'done'}<span class="pts">+{L.shares(e)[id] ?? e.points}</span>{/if}
      </div>
    {:else}
      <p class="sub">Heute noch nichts.</p>
    {/each}
  </div>
  <p class="f">Aktionen</p>
  <div class="quick">
    <button class="btn ok" onclick={() => act('bonus')}><Icon name="star" size={16} />Belohnung</button>
    <button class="btn bad" onclick={() => act('warn')}><Icon name="triangle-alert" size={16} />Abmahnung</button>
    <button class="btn info" onclick={() => act('frei')}><Icon name="tree-palm" size={16} />Frei geben</button>
    <button class="btn" onclick={() => act('assign')}><Icon name="clipboard-list" size={16} />Zuweisen</button>
    <button class="btn sec" onclick={() => open(Points, { member: m })}><Icon name="history" size={16} />Alle Punkte</button>
    <button class="btn sec" onclick={() => open(MemberEdit, { member: m })}><Icon name="pencil" size={16} />Bearbeiten</button>
  </div>
  {#if m.has_pin}
    <button class="btn wide {m.pin_help ? 'warn' : 'sec'}" style="margin-top:10px" onclick={() => resetPin(m)}><Icon name="key-round" size={16} />{m.pin_help ? 'PIN vergessen: jetzt zurücksetzen' : 'PIN zurücksetzen'}</button>
  {:else}
    <p class="hint">Noch keine PIN. {m.name} legt beim nächsten Öffnen der App eine fest.</p>
  {/if}
{/if}
