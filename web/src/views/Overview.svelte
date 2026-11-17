<script>
  // Admin-Übersicht: der ganze Tag auf einen Blick.
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import { S, G } from '../lib/store.svelte.js';
  import { open } from '../lib/ui.svelte.js';
  import { roomOf } from '../lib/rooms.js';
  import { resetPin } from '../lib/act.js';
  import { post, mName } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  import Review from '../sheets/Review.svelte';
  import DutyPick from '../sheets/DutyPick.svelte';
  import Proposals from '../sheets/Proposals.svelte';
  import Late from '../sheets/Late.svelte';
  import Person from '../sheets/Person.svelte';
  import Action from '../sheets/Action.svelte';
  import Antraege from '../sheets/Antraege.svelte';

  const c = $derived(G.calc), d = $derived(c.d), plan = $derived(c.plan);
  // Dienstplan: was heute noch offen ist, und was gestern liegen geblieben ist
  const openDuties = $derived(plan ? G.active.flatMap(m => c.per[m.id].duties.filter(e => e.status === 'todo')) : []);
  const dutyTotal = $derived(G.active.reduce((s, m) => s + c.per[m.id].duties.length, 0));
  const dutyDone = $derived(G.active.reduce((s, m) => s + c.per[m.id].dutiesDone, 0));
  const dutyPct = $derived(dutyTotal ? Math.round((100 * dutyDone) / dutyTotal) : 100);
  const yesterday = $derived(L.dKey(L.noon(d, 1)));
  const missed = $derived(S.entries.filter(e => e.status === 'missed' && L.dutyDay(e) === yesterday));
  async function redo() {
    if (!confirm('Alle heute noch nicht angefangenen Dienste neu verteilen? Angefangenes und Erledigtes bleibt.')) return;
    let r;
    if (await tryDo(async () => { r = await post('/plan/redo'); })) toast(`${r.count} Dienste neu verteilt`);
  }
  const dateLabel = $derived(d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
  const shared = $derived(G.shared.map(t => ({ t, e: L.entryFor(c.ix, t, d, null) })));
  const doneCount = $derived(shared.filter(x => x.e?.status === 'done').length);
  const runningEntries = $derived(S.entries.filter(e => e.status === 'started'));
  const fixing = $derived(S.entries.filter(e => e.status === 'done' && e.review === 'nach').length);
  const inbox = $derived([
    G.backupLate && { icon: 'database-backup', c: 'bad', title: 'Sicherung überfällig', sub: `Zuletzt gelaufen: ${new Date(S.backup).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`, go: () => { S.tab = 'verwaltung'; scrollTo(0, 0); } },
    ...G.pinHelp.map(m => ({ icon: 'key-round', c: 'info', title: `PIN vergessen: ${m.name}`, sub: 'Antippen zum Zurücksetzen', go: () => resetPin(m) })),
    G.openAntraege.length && { icon: 'send', c: 'brand', title: 'Anträge über Claude', sub: `${G.openAntraege.length} offen · ${[...new Set(G.openAntraege.map(a => mName(a.member_id)))].join(', ')}`, go: () => open(Antraege) },
    G.queue.length && { icon: 'eye', c: 'brand', title: 'Fotos prüfen', sub: `${G.queue.length} neue Vorher/Nachher-Paare`, go: () => open(Review) },
    G.proposals.length && { icon: 'lightbulb', c: 'warn', title: 'Vorschläge', sub: `${G.proposals.length} neue Aufgaben-Ideen`, go: () => open(Proposals) },
    G.late.length && { icon: 'hourglass', c: 'bad', title: 'Liegengeblieben', sub: `${G.late.length} ${G.late.length === 1 ? 'Aufgabe wartet' : 'Aufgaben warten'} schon länger`, go: () => open(Late) },
    missed.length && { icon: 'calendar-x', c: 'bad', title: `Gestern ${missed.length} ${missed.length === 1 ? 'Dienst' : 'Dienste'} nicht gemacht`, sub: [...new Set(missed.map(e => mName(e.member_id)))].join(', ') + ' · antippen für Details', go: () => open(Person, { id: missed[0].member_id }) },
  ].filter(Boolean));

  function status(m) {
    const p = c.per[m.id];
    if (L.isAway(m, d)) return ['info', 'Abwesend'];
    if (plan) {
      if (!p.duties.length) return ['info', 'Keine Dienste'];
      if (p.dutiesDone === p.duties.length) return ['ok', 'Fertig'];
      if (runningEntries.some(e => L.involved(e, m.id))) return ['brand', 'Putzt gerade'];
      return p.dutiesDone ? ['warn', 'Dabei'] : ['bad', 'Noch nichts'];
    }
    if (!p.goal) return ['info', 'Heute frei'];
    if (p.today >= p.goal) return ['ok', 'Fertig'];
    if (runningEntries.some(e => L.involved(e, m.id))) return ['brand', 'Putzt gerade'];
    return p.today ? ['warn', 'Dabei'] : ['bad', 'Noch nichts'];
  }
  // Wochenraster: Montag bis Sonntag der laufenden Woche
  const week = $derived(Array.from({ length: 7 }, (_, i) => L.noon(d, L.isoDay(d) - 1 - i)));
  // Tage vor dem ersten Eintrag (und mit Dienstplan: vor seinem Start) bleiben leer
  const since = $derived(plan && S.settings.plan_start ? S.settings.plan_start : S.entries.length ? L.dKey(new Date(S.entries.reduce((a, e) => (e.created_at < a ? e.created_at : a), S.entries[0].created_at))) : c.today);
  const rooms = $derived([...new Set(shared.map(x => x.t.room))].map(name => {
    const xs = shared.filter(x => x.t.room === name);
    return { name, total: xs.length, done: xs.filter(x => x.e?.status === 'done').length, late: xs.filter(x => !x.e && L.overdueInPeriod(x.t, d)).length, ...roomOf(name, S.settings) };
  }));
</script>

{#snippet kpi(icon, color, value, label, onclick)}
  <button class="kpi" {onclick} disabled={!onclick}>
    <span class="tile c-{color}"><Icon name={icon} /></span>
    <span><b>{@render value()}</b><small>{label}</small></span>
  </button>
{/snippet}

<div class="top">
  <div class="grow"><h1>Übersicht</h1><p class="sub">{dateLabel}</p></div>
  <button class="btn sec sm" onclick={() => { S.tab = 'verwaltung'; scrollTo(0, 0); }}><Icon name="settings" size={16} />Verwaltung</button>
</div>

<div class="kpis">
  {#snippet v1()}{#if plan}{dutyPct}<small> %</small>{:else}{doneCount}<small>/{shared.length}</small>{/if}{/snippet}
  {#snippet v2()}{runningEntries.length}{/snippet}
  {#snippet v3()}{G.late.length}{/snippet}
  {#snippet v4()}{G.queue.length}{/snippet}
  {@render kpi('circle-check', plan && dutyPct < 80 ? 'warn' : 'ok', v1, plan ? `Dienste erledigt (${dutyDone}/${dutyTotal}, Ziel 80 %)` : 'Heute erledigt')}
  {@render kpi('timer', 'info', v2, 'Läuft gerade')}
  {@render kpi('hourglass', 'bad', v3, 'Liegengeblieben', G.late.length ? () => open(Late) : null)}
  {@render kpi('eye', 'brand', v4, 'Zu prüfen', G.queue.length ? () => open(Review) : null)}
</div>

<div class="cols">
  <div>
    <section class="card list">
      <h2>Wartet auf dich</h2>
      {#each inbox as x (x.title)}
        <button class="row" onclick={x.go}><span class="tile c-{x.c}"><Icon name={x.icon} /></span><span class="grow"><b>{x.title}</b><small>{x.sub}</small></span><Icon name="chevron-right" /></button>
      {:else}
        <p class="sub">Nichts offen. Alles im Griff.</p>
      {/each}
      {#if fixing}<p class="hint">{fixing} {fixing === 1 ? 'Aufgabe wird' : 'Aufgaben werden'} gerade nachgebessert.</p>{/if}
    </section>

    <section class="card">
      <h2>Familie heute <small>antippen für Details</small></h2>
      <div class="people">
        {#each G.active as m (m.id)}
          {@const p = c.per[m.id]}
          {@const [color, text] = status(m)}
          {@const [v, g] = plan ? [p.dutiesDone, p.duties.length] : [p.goalPts, p.goal]}
          <button class="pcell" onclick={() => open(Person, { id: m.id })}>
            <span class="ava sm">{m.emoji}</span>
            <span class="grow">
              <b>{m.name}</b> <span class="n">{v}{g ? '/' + g : ''}</span>
              <span class="bar" class:ok={g > 0 && v >= g}><i style="width:{g ? Math.min(100, 100 * v / g) : 0}%"></i></span>
              <small class="c-{color}">{text}</small>
            </span>
          </button>
        {/each}
      </div>
    </section>
  </div>

  <div>
    <section class="card">
      <h2>Diese Woche</h2>
      <table class="matrix">
        <thead><tr><th></th>{#each week as x (x.getTime())}<th class:now={L.dKey(x) === c.today}>{L.DAYS_SHORT[L.isoDay(x)]}</th>{/each}</tr></thead>
        <tbody>
          {#each G.active as m (m.id)}
            <tr>
              <td>{m.emoji} {m.name}</td>
              {#each week as x (x.getTime())}
                {@const s = L.dayState(c.st, c.ix, m, x, d, since)}
                <td>
                  {#if s === 'now'}<i class="dot now" style="--p:{plan ? Math.round(100 * c.per[m.id].dutiesDone / (c.per[m.id].duties.length || 1)) : Math.round(100 * c.per[m.id].goalPts / (c.per[m.id].goal || 1))}%"></i>
                  {:else}<i class="dot {s}">{#if s === 'ok'}<Icon name="check" size={12} bold />{:else if s === 'miss'}<Icon name="x" size={12} bold />{:else if s === 'frei'}<Icon name="tree-palm" size={12} bold />{/if}</i>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="legend"><span><i class="dot ok"></i>{plan ? 'alle Dienste' : 'Ziel geschafft'}</span><span><i class="dot teil"></i>teilweise</span><span><i class="dot miss"></i>nichts</span><span><i class="dot frei"></i>{plan ? 'keine Dienste' : 'frei'}</span></div>
    </section>

    {#if plan}
      <details class="card list">
        <summary><Icon name="calendar-check" />Dienstplan heute <span class="cnt grow">{openDuties.length} noch nicht angefangen</span><Icon name="chevron-down" /></summary>
        <button class="btn sec sm wide" style="margin-bottom:6px" onclick={redo}><Icon name="shuffle" size={16} />Neu verteilen</button>
        {#each openDuties as e (e.id)}
          <div class="row">
            <span class="ava sm">{G.active.find(m => m.id === e.member_id)?.emoji || '🙂'}</span>
            <div class="grow"><b>{e.title}</b><small>{mName(e.member_id)} · noch nicht angefangen</small></div>
            <button class="icb" onclick={() => open(DutyPick, { entry: e })} aria-label="Jemand anderem geben"><Icon name="shuffle" size={16} /></button>
          </div>
        {:else}
          <p class="sub">Alle Dienste von heute sind angefangen oder erledigt.</p>
        {/each}
        <p class="hint">Jeden Morgen um 4 Uhr wird neu verteilt. Wer frei bekommt oder abwesend ist, gibt seine Dienste automatisch ab.</p>
      </details>
    {/if}

    <section class="card list">
      <h2>Räume heute</h2>
      {#each rooms as r (r.name)}
        <div class="row">
          <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
          <span class="grow"><b>{r.name}</b><span class="bar" class:ok={r.done === r.total}><i style="width:{100 * r.done / r.total}%"></i></span></span>
          {#if r.late}<span class="chip c-bad"><Icon name="hourglass" size={14} />{r.late}</span>{/if}
          <b>{r.done}/{r.total}</b>
        </div>
      {:else}
        <p class="sub">Heute steht nichts Gemeinsames an.</p>
      {/each}
    </section>
  </div>
</div>

<section class="card">
  <h2>Schnell erledigt</h2>
  <div class="quick five">
    <button class="btn ok" onclick={() => open(Action, { kind: 'bonus' })}><Icon name="star" size={16} />Belohnung</button>
    <button class="btn bad" onclick={() => open(Action, { kind: 'warn' })}><Icon name="triangle-alert" size={16} />Abmahnung</button>
    <button class="btn info" onclick={() => open(Action, { kind: 'frei' })}><Icon name="tree-palm" size={16} />Frei geben</button>
    <button class="btn" onclick={() => open(Action, { kind: 'assign' })}><Icon name="clipboard-list" size={16} />Zuweisen</button>
    <button class="btn sec" onclick={() => open(Action, { kind: 'durchsage' })}><Icon name="megaphone" size={16} />Durchsage</button>
  </div>
</section>
