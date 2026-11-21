<script>
  // Familie: wer heute was hat, die Woche als Rangliste mit Tagespunkten und (für Admins) was auf sie wartet.
  // Ersetzt die alte Übersicht und die Rangliste. Eine Person antippen: ihre Dienste, übernehmen, Admin-Aktionen.
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import { S, G, mName, post } from '../lib/store.svelte.js';
  import { open, toast, tryDo } from '../lib/ui.svelte.js';
  import { resetPin } from '../lib/act.js';
  import Review from '../sheets/Review.svelte';
  import Proposals from '../sheets/Proposals.svelte';
  import Late from '../sheets/Late.svelte';
  import Person from '../sheets/Person.svelte';
  import Action from '../sheets/Action.svelte';
  import Antraege from '../sheets/Antraege.svelte';
  import DutyPick from '../sheets/DutyPick.svelte';

  const c = $derived(G.calc), d = $derived(c.d), plan = $derived(c.plan);
  const dateLabel = $derived(d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
  const toAdmin = () => { S.tab = 'verwaltung'; scrollTo(0, 0); };

  // ---------- Wartet auf dich (Admins) ----------
  const yesterday = $derived(L.dKey(L.noon(d, 1)));
  const missed = $derived(S.entries.filter(e => e.status === 'missed' && L.dutyDay(e) === yesterday));
  const inbox = $derived(G.admin ? [
    G.backupLate && { icon: 'database-backup', c: 'bad', title: 'Sicherung überfällig', sub: `Zuletzt: ${new Date(S.backup).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`, go: toAdmin },
    ...G.pinHelp.map(m => ({ icon: 'key-round', c: 'info', title: `PIN vergessen: ${m.name}`, sub: 'Antippen zum Zurücksetzen', go: () => resetPin(m) })),
    G.openAntraege.length && (() => {
      const n = G.openAntraege.filter(a => a.kind !== 'meldung').length, w = G.openAntraege.length - n;
      return { icon: w ? 'shield-alert' : 'send', c: w ? 'bad' : 'brand', title: 'Von Claude', sub: `${[n && `${n} ${n === 1 ? 'Antrag' : 'Anträge'}`, w && `${w} ${w === 1 ? 'Meldung' : 'Meldungen'}`].filter(Boolean).join(', ')} · ${[...new Set(G.openAntraege.map(a => mName(a.member_id)))].join(', ')}`, go: () => open(Antraege) };
    })(),
    G.queue.length && { icon: 'eye', c: 'brand', title: 'Fotos prüfen', sub: `${G.queue.length} Vorher/Nachher-${G.queue.length === 1 ? 'Paar' : 'Paare'} noch nicht geprüft`, go: () => open(Review) },
    G.proposals.length && { icon: 'lightbulb', c: 'warn', title: 'Vorschläge', sub: `${G.proposals.length} neue Aufgaben-Ideen`, go: () => open(Proposals) },
    G.late.length && { icon: 'hourglass', c: 'warn', title: 'Liegengeblieben', sub: `${G.late.length} ${G.late.length === 1 ? 'Aufgabe wartet' : 'Aufgaben warten'} schon länger`, go: () => open(Late) },
    missed.length && { icon: 'calendar-x', c: 'bad', title: `Gestern ${missed.length} ${missed.length === 1 ? 'Dienst' : 'Dienste'} liegen geblieben`, sub: [...new Set(missed.map(e => mName(e.member_id)))].join(', '), go: () => open(Person, { id: missed[0].member_id }) },
  ].filter(Boolean) : []);

  // ---------- Heute ----------
  const running = $derived(S.entries.filter(e => e.status === 'started'));
  const early = $derived(plan && d.getHours() < 4); // vor 4 Uhr ist der Dienstplan für heute noch nicht verteilt
  const totalDuties = $derived(G.active.reduce((s, m) => s + c.per[m.id].duties.length, 0));
  const doneDuties = $derived(G.active.reduce((s, m) => s + c.per[m.id].dutiesDone, 0));
  function status(m) {
    const p = c.per[m.id];
    if (L.isAway(m, d)) return ['info', 'Abwesend'];
    if (p.krank) return ['info', 'Krank, gute Besserung'];
    if (p.frei) return ['info', 'Hat heute frei'];
    if (running.some(e => L.involved(e, m.id))) return ['brand', 'Putzt gerade'];
    if (plan) {
      if (!p.duties.length) return ['muted', early ? 'Dienste kommen um 4 Uhr' : 'Keine Dienste'];
      const left = p.duties.length - p.dutiesDone;
      return !left ? ['ok', 'Alles erledigt'] : p.dutiesDone ? ['warn', `Noch ${left} offen`] : ['bad', 'Noch nichts'];
    }
    if (!p.goal) return ['info', 'Hat heute frei'];
    return p.goalPts >= p.goal ? ['ok', 'Ziel geschafft'] : p.goalPts ? ['warn', `Noch ${p.goal - p.goalPts} P`] : ['bad', 'Noch nichts'];
  }

  // ---------- Woche ----------
  let seg = $state('woche');
  const field = $derived(seg === 'woche' ? 'week' : 'month');
  const ranked = $derived([...G.active].sort((a, b) => c.per[b.id][field] - c.per[a.id][field]));
  const lead = $derived(c.per[ranked[0]?.id]?.[field] > 0 ? ranked[0].id : null);
  const week = $derived(Array.from({ length: 7 }, (_, i) => L.noon(d, L.isoDay(d) - 1 - i)));
  // Tage, bevor es überhaupt Einträge gab, bleiben leer
  const since = $derived(S.entries.length ? L.dKey(new Date(S.entries.reduce((a, e) => (e.created_at < a ? e.created_at : a), S.entries[0].created_at))) : c.today);
  const royals = $derived(L.royals(c.st, d));

  // ---------- Admins: Dienstplan, schnelle Aktionen, Belohnungen ----------
  const openDuties = $derived(plan ? G.active.flatMap(m => c.per[m.id].duties.filter(e => e.status === 'todo')) : []);
  async function redo() {
    if (!confirm('Alle heute noch nicht angefangenen Dienste neu verteilen? Angefangenes und Erledigtes bleibt.')) return;
    let r;
    if (await tryDo(async () => { r = await post('/plan/redo'); })) toast(`${r.count} Dienste neu verteilt`);
  }
  const KIND = { bonus: ['ok', 'star'], warn: ['bad', 'triangle-alert'], frei: ['info', 'tree-palm'] };
  const rewards = $derived(S.entries.filter(e => KIND[e.task_id] && e.status === 'done').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15));
  const dayOf = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const revoke = e => confirm('Zurücknehmen?') && tryDo(() => post(`/entries/${e.id}/revoke`));
  const QUICK = [['bonus', 'star', 'Belohnen', 'ok'], ['warn', 'triangle-alert', 'Abmahnen', 'bad'], ['frei', 'tree-palm', 'Frei', 'info'], ['assign', 'clipboard-list', 'Zuweisen', 'brand'], ['durchsage', 'megaphone', 'Durchsage', 'warn']];
</script>

<div class="narrow">
  <div class="top">
    <div class="grow"><h1>Familie</h1><p class="sub">{dateLabel}</p></div>
    {#if G.admin}<button class="icb lg" onclick={toAdmin} aria-label="Verwaltung"><Icon name="settings" /></button>{/if}
  </div>

  {#if inbox.length}
    <section class="card list inbox">
      {#each inbox as x (x.title)}
        <button class="row" onclick={x.go}><span class="tile c-{x.c}"><Icon name={x.icon} /></span><span class="grow"><b>{x.title}</b><small>{x.sub}</small></span><Icon name="chevron-right" size={18} /></button>
      {/each}
    </section>
  {/if}

  <div class="sec-h"><h2>Heute</h2>{#if plan && totalDuties}<span class="cnt">{doneDuties} von {totalDuties} Diensten erledigt</span>{/if}</div>
  <section class="card list">
    {#each G.active as m (m.id)}
      {@const p = c.per[m.id]}
      {@const [col, text] = status(m)}
      {@const [v, g] = plan ? [p.dutiesDone, p.duties.length] : [p.goalPts, p.goal]}
      <button class="row person" onclick={() => open(Person, { id: m.id })}>
        <span class="ava sm">{m.emoji}</span>
        <span class="grow"><b>{m.name}</b><small class="st c-{col}">{text}{p.today ? ` · ${p.today} P` : ''}</small></span>
        {#if g}<span class="prog"><span class="bar" class:ok={v >= g}><i style="width:{Math.min(100, (100 * v) / g)}%"></i></span><small>{v}/{g}</small></span>{/if}
        <Icon name="chevron-right" size={16} />
      </button>
    {/each}
  </section>

  <div class="sec-h">
    <h2>Rangliste</h2>
    <div class="seg mini grow-0">
      <button class:on={seg === 'woche'} onclick={() => (seg = 'woche')}>Woche</button>
      <button class:on={seg === 'monat'} onclick={() => (seg = 'monat')}>Monat</button>
    </div>
  </div>
  <section class="card list">
    {#if royals.length}<p class="royal"><Icon name="crown" size={15} />{royals.map(r => `${L.royalTitle(r.m)} ${r.m.name}`).join(' & ')} {royals.length > 1 ? 'regieren' : 'regiert'} diese Woche</p>{/if}
    {#each ranked as m, i (m.id)}
      {@const p = c.per[m.id]}
      <button class="row rk" onclick={() => open(Person, { id: m.id })}>
        <span class="rank {p[field] > 0 ? 'r' + (i + 1) : ''}">{i + 1}</span>
        <span class="ava sm">{m.emoji}</span>
        <span class="grow">
          <b>{m.name}{#if lead === m.id}{' '}<Icon name="crown" size={14} />{/if}</b>
          {#if seg === 'woche'}
            <span class="wk">{#each week as x (x.getTime())}{@const s = L.dayState(c.st, c.ix, m, x, d, since)}<i class="d {s}" title={L.DAYS_SHORT[L.isoDay(x)]}></i>{/each}</span>
          {:else}<small>{p.streak ? `Serie ${p.streak} ${p.streak === 1 ? 'Tag' : 'Tage'}` : `im ${d.toLocaleDateString('de-DE', { month: 'long' })}`}</small>{/if}
        </span>
        <span class="num">{p[field]}</span>
      </button>
    {/each}
    {#if seg === 'woche'}
      <div class="legend"><span><i class="d ok"></i>geschafft</span><span><i class="d teil"></i>teilweise</span><span><i class="d miss"></i>nichts</span><span><i class="d frei"></i>frei, krank</span></div>
    {/if}
  </section>

  {#if G.admin}
    <div class="sec-h"><h2>Schnell</h2></div>
    <div class="quickrow">
      {#each QUICK as [k, icon, label, col] (k)}
        <button class="qa c-{col}" onclick={() => open(Action, { kind: k })}><span class="tile"><Icon name={icon} /></span>{label}</button>
      {/each}
    </div>

    {#if plan}
      <details class="card list">
        <summary><Icon name="calendar-check" />Dienstplan heute <span class="cnt grow">{openDuties.length} nicht angefangen</span><Icon name="chevron-down" size={16} /></summary>
        {#each openDuties as e (e.id)}
          <div class="row">
            <span class="ava sm">{G.active.find(m => m.id === e.member_id)?.emoji || '🙂'}</span>
            <div class="grow"><b>{e.title}</b><small>{mName(e.member_id)}</small></div>
            <button class="icb" onclick={() => open(DutyPick, { entry: e })} aria-label="Jemand anderem geben"><Icon name="shuffle" size={16} /></button>
          </div>
        {:else}
          <p class="sub">Alle Dienste von heute sind angefangen oder erledigt.</p>
        {/each}
        <button class="btn sec sm wide" style="margin-top:8px" onclick={redo}><Icon name="shuffle" size={16} />Neu verteilen</button>
        <p class="hint">Jeden Morgen um 4 Uhr wird verteilt. Wer frei hat, krank oder abwesend ist, gibt seine Dienste automatisch ab.</p>
      </details>
    {/if}
  {/if}

  {#if rewards.length}
    <details class="card list">
      <summary><Icon name="gift" />Belohnungen, freie Tage <span class="cnt grow">{rewards.length}</span><Icon name="chevron-down" size={16} /></summary>
      {#each rewards as e (e.id)}
        {@const sick = e.task_id === 'frei' && e.note === 'krank'}
        <div class="row">
          <span class="tile c-{KIND[e.task_id][0]}"><Icon name={sick ? 'thermometer' : KIND[e.task_id][1]} /></span>
          <div class="grow"><b>{mName(e.member_id)}: {e.title}</b><small>{e.task_id === 'frei' ? `${sick ? 'krank' : 'frei'} am ${dayOf(e.after_at)}` : `${dayOf(e.after_at)} · ${e.points > 0 ? '+' : '−'}${Math.abs(e.points)} P`}</small></div>
          {#if G.admin}<button class="icb" onclick={() => revoke(e)} aria-label="Zurücknehmen"><Icon name="undo-2" size={16} /></button>{/if}
        </div>
      {/each}
    </details>
  {/if}
</div>
