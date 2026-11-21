<script>
  // Heute: oben der eigene Stand, darunter nur, was zu tun ist. Erledigtes und Extras klappen sich ein.
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Ring from '../parts/Ring.svelte';
  import { S, G, mem, mName, taskOf } from '../lib/store.svelte.js';
  import { start, finish, redo, cancel, join, dropEntry, redeem, decideHelper } from '../lib/act.js';
  import { open, toast } from '../lib/ui.svelte.js';
  import { roomOf } from '../lib/rooms.js';
  import Extra from '../sheets/Extra.svelte';
  import Royal from '../sheets/Royal.svelte';
  import Help from '../sheets/Help.svelte';
  import Krank from '../sheets/Krank.svelte';

  let room = $state('alle');
  const c = $derived(G.calc), me = $derived(G.me), d = $derived(c.d), plan = $derived(c.plan);
  const my = $derived(c.per[me.id]);
  const mins = iso => Math.max(0, Math.floor((S.now - new Date(iso)) / 60000));
  const hhmm = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const roomName = e => (e.task_id === 'adhoc' ? 'Extra' : taskOf(e.task_id)?.room || 'Extra');
  const ptsFor = e => (e.task_id === 'adhoc' ? e.points : L.ptsOf(taskOf(e.task_id))) + (e.fuer ? L.FUER_BONUS : 0);
  const locked = $derived(G.extrasLocked);
  const lockHint = () => toast(`Erst deine Dienste, dann Extras. Noch ${G.myOpen.length} offen.`);

  // Meins: nachbessern, läuft gerade, Dienste, Eigenes für mich
  const mine = $derived(S.entries.filter(e => L.involved(e, me.id)));
  const fix = $derived(mine.filter(e => e.status === 'done' && e.review === 'nach'));
  const running = $derived(mine.filter(e => e.status === 'started'));
  const todo = $derived(mine.filter(e => e.status === 'todo' && e.member_id === me.id));
  const duties = $derived(todo.filter(L.isDuty));
  const ownExtras = $derived(todo.filter(e => !L.isDuty(e)));
  const personal = $derived(L.personalTasksFor(c.st, me, d).filter(t => !L.entryFor(c.ix, t, d, me.id)));
  const openCount = $derived(fix.length + running.length + duties.length + personal.length + (plan ? 0 : ownExtras.length));
  const doneToday = $derived(mine.filter(e => e.status === 'done' && !L.ADMIN_KINDS.has(e.task_id) && L.dKey(new Date(e.after_at)) === c.today).sort((a, b) => b.after_at.localeCompare(a.after_at)));
  const extrasDone = $derived(doneToday.filter(e => !L.isDuty(e)).length);

  // Gemeinsame Aufgaben, die heute dran oder liegengeblieben sind und noch niemand hat
  const openTasks = $derived(G.shared.filter(t => !L.entryFor(c.ix, t, d, null))
    .sort((a, b) => (G.kid ? (b.leicht ? 1 : 0) - (a.leicht ? 1 : 0) : 0) || (L.overdueInPeriod(b, d) ? 1 : 0) - (L.overdueInPeriod(a, d) ? 1 : 0)));
  const freeDuties = $derived(plan ? openTasks.filter(t => t.pflicht) : []); // Dienste, die keiner bekommen hat: jeder darf
  const extras = $derived(plan ? openTasks.filter(t => !t.pflicht) : openTasks);
  const rooms = $derived([...new Set(extras.map(t => t.room))]);
  const inRoom = name => room === 'alle' || name === room;
  const others = $derived(S.entries.filter(e => e.status === 'started' && !L.involved(e, me.id) && e.task_id !== 'adhoc'));
  const early = $derived(S.tasks.filter(t => t.active && !t.per_person && (t.freq === 'weekly' || t.freq === 'monthly') && !L.dueOn(t, d) && !L.overdueInPeriod(t, d) && !L.entryFor(c.ix, t, d, null)));
  $effect(() => { if (room !== 'alle' && !rooms.includes(room)) room = 'alle'; });

  const royals = $derived(L.royals(c.st, d));
  const iAmRoyal = $derived(royals.some(r => r.m.id === me.id));
  const royalDay = $derived(iAmRoyal && L.royalDayTaken(c.st, me, d));
  const washToday = $derived(+me.waschtag === L.isoDay(d)), washTomorrow = $derived(+me.waschtag === L.isoDay(d) % 7 + 1);
  const beforePlan = $derived(plan && d.getHours() < 4 && !my.duties.length); // vor 4 Uhr ist noch nicht verteilt
  const greet = $derived(d.getHours() < 11 ? 'Guten Morgen' : d.getHours() < 18 ? 'Hi' : 'Guten Abend');
  const left = $derived(plan ? my.duties.length - my.dutiesDone : Math.max(0, my.goal - my.goalPts));
  const heroText = $derived(my.krank ? 'Du bist heute krank gemeldet. Gute Besserung! 🤒'
    : my.frei ? 'Heute hast du frei. Genieß es!'
    : beforePlan ? 'Deine Dienste kommen um 4 Uhr.'
    : plan ? (!my.duties.length ? 'Heute keine Dienste. Extras bringen trotzdem Punkte.' : left ? `Noch ${left} ${left === 1 ? 'Dienst' : 'Dienste'}, dann ist dein Tag geschafft.` : `Alles erledigt!${extrasDone ? ` Plus ${extrasDone} ${extrasDone === 1 ? 'Extra' : 'Extras'}.` : ''}`)
    : !my.goal ? 'Heute hast du frei.' : left ? `Noch ${left} Punkte bis zum Tagesziel.` : 'Tagesziel geschafft!');
  // Extras: offen, sobald die eigenen Dienste erledigt sind (oder es keine gibt)
  let extrasOpen = $state(null);
  const showExtras = $derived(extrasOpen ?? (openCount === 0));
</script>

{#snippet tile(name)}
  {@const r = roomOf(name, S.settings)}
  <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
{/snippet}
{#snippet go(fn, label = 'Starten', icon = 'camera', kind = '')}
  <button class="go {kind}" onclick={fn} aria-label={label} title={label}><Icon name={icon} size={19} /></button>
{/snippet}
{#snippet extraGo(fn)}
  {#if locked}<button class="go sec" onclick={lockHint} aria-label="Gesperrt, erst deine Dienste"><Icon name="lock" size={17} /></button>{:else}{@render go(fn)}{/if}
{/snippet}

<div class="narrow">
  <section class="hero">
    {#if plan}<Ring value={my.dutiesDone} goal={my.duties.length} size={64} />{:else}<Ring value={my.goalPts} goal={my.goal} size={64} />{/if}
    <div class="grow">
      <h1>{greet}, {me.name} {me.emoji}</h1>
      <p>{heroText}</p>
      <div class="hstats">
        <span><Icon name="flame" size={14} />{my.streak} {my.streak === 1 ? 'Tag' : 'Tage'}</span>
        <span><Icon name="star" size={14} />{my.today} heute</span>
        <span><Icon name="trophy" size={14} />{my.week} Woche</span>
      </div>
    </div>
  </section>

  {#if !plan && my.bank > 0 && left > 0 && !my.frei}
    <button class="note c-brand" onclick={() => confirm(`${Math.min(my.bank, left)} Punkte vom Konto einlösen? Dann ist das Tagesziel geschafft.`) && redeem()}><Icon name="piggy-bank" size={17} /><span class="grow">{Math.min(my.bank, left)} Punkte vom Konto einlösen</span><Icon name="chevron-right" size={16} /></button>
  {/if}
  {#if washTomorrow && !washToday}<div class="note c-info"><Icon name="shirt" size={17} /><span>Morgen ist dein Waschtag</span></div>{/if}
  {#if royals.length}
    <div class="note c-warn">
      <Icon name="crown" size={17} />
      <span class="grow">{royals.map(r => `${L.royalTitle(r.m)} ${r.m.name}`).join(' & ')} {royals.length > 1 ? 'regieren' : 'regiert'} diese Woche{#if royalDay} · dein freier Tag: {L.DAYS[L.isoDay(new Date(royalDay.after_at))]}{/if}</span>
      {#if iAmRoyal && !royalDay}<button class="btn warn sm" onclick={() => open(Royal)}>Tag wählen</button>{/if}
    </div>
  {/if}

  {#if openCount}
    <div class="sec-h"><h2>{plan ? 'Deine Dienste' : 'Meins'}</h2><span class="cnt">{plan ? `${my.dutiesDone} von ${my.duties.length} erledigt` : `${openCount} offen`}</span></div>
    <section class="card list tasks">
      {#each fix as e (e.id)}
        <div class="row" data-anchor={e.id}>
          <span class="tile c-warn"><Icon name="rotate-ccw" /></span>
          <div class="grow"><b>{e.title}</b><small><span class="late">Bitte nachbessern</span>{e.review_note ? `: ${e.review_note}` : ''}</small></div>
          {@render go(() => redo(e), 'Neues Nachher-Foto', 'camera', 'warn')}
        </div>
      {/each}
      {#each running as e (e.id)}
        <div class="row" data-anchor={e.id}>
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small class="on">läuft seit {mins(e.before_at)} Min{e.helpers.length ? ` · mit ${[e.member_id, ...e.helpers].filter(x => x !== me.id).map(mName).join(', ')}` : ''}</small></div>
          {#if e.member_id === me.id}
            <button class="icb" onclick={() => cancel(e)} aria-label="Abbrechen"><Icon name="x" size={16} /></button>
            <button class="btn ok sm" onclick={() => finish(e)}><Icon name="camera" size={16} />Fertig</button>
          {:else}
            <span class="chip c-brand"><Icon name="handshake" size={14} />Du hilfst</span>
          {/if}
        </div>
        {#if e.member_id === me.id}
          {#each e.pending as h (h)}
            <div class="row ask">
              <span class="ava sm">{mem(h)?.emoji || '🙂'}</span>
              <div class="grow"><b>{mName(h)} möchte mithelfen</b></div>
              <button class="icb" onclick={() => decideHelper(e, h, false)} aria-label="Ablehnen"><Icon name="x" size={16} /></button>
              <button class="btn ok sm" onclick={() => decideHelper(e, h, true)}><Icon name="check" size={16} />Ja</button>
            </div>
          {/each}
        {/if}
      {/each}
      {#each duties as e (e.id)}
        <div class="row" data-anchor={e.id}>
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)}</span>{e.fuer ? ` · für ${mName(e.fuer)}` : e.created_by === 'plan' ? '' : e.note === 'koch' ? ' · wer kocht, räumt auf' : ` · von ${mName(e.created_by)}`}{#if L.dutyDay(e) < c.today}{' · '}<span class="late">seit {L.DAYS[L.isoDay(new Date(e.created_at))]}</span>{/if}</small></div>
          {@render go(() => start({ entry: e }))}
        </div>
      {/each}
      {#each personal as t (t.id)}
        <div class="row" data-anchor={t.id}>
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)}</span> · nur für dich{t.freq === 'monthly' ? ' · bis Monatsende' : t.freq === 'weekend' ? ' · dieses Wochenende' : ''}</small></div>
          {@render go(() => start({ task: t }))}
        </div>
      {/each}
      {#if !plan}
        {#each ownExtras as e (e.id)}
          <div class="row" data-anchor={e.id}>
            <span class="tile c-brand"><Icon name="sparkles" /></span>
            <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)}</span> · Extra</small></div>
            <button class="icb" onclick={() => dropEntry(e)} aria-label="Von der Liste nehmen"><Icon name="x" size={16} /></button>
            {@render go(() => start({ entry: e }))}
          </div>
        {/each}
      {/if}
    </section>
  {:else if plan && my.duties.length && !my.frei}
    <section class="card done-card"><span class="big">🎉</span><div><b>Alle Dienste erledigt!</b><small>Deine Serie läuft. Extras bringen Punkte obendrauf.</small></div></section>
  {/if}

  {#if doneToday.length}
    <details class="card list fold">
      <summary><Icon name="circle-check" />Heute erledigt <span class="cnt grow">{doneToday.length}{extrasDone ? ` · davon ${extrasDone} ${extrasDone === 1 ? 'Extra' : 'Extras'}` : ''}</span><Icon name="chevron-down" size={16} /></summary>
      {#each doneToday as e (e.id)}
        <div class="row">
          <span class="tile c-ok"><Icon name="check" /></span>
          <div class="grow"><b>{e.title}</b><small>{hhmm(e.after_at)} Uhr{e.helpers.length ? ' · im Team' : ''}{plan ? (L.isDuty(e) ? ' · Dienst' : ' · Extra') : ''}</small></div>
          <span class="pts">+{L.shares(e)[me.id] ?? e.points}</span>
        </div>
      {/each}
    </details>
  {/if}

  {#if freeDuties.length || others.length}
    <div class="sec-h"><h2>{plan && freeDuties.length ? 'Noch offen' : 'Gerade dran'}</h2>{#if plan && freeDuties.length}<span class="cnt">hat niemand, jeder darf</span>{/if}</div>
    <section class="card list tasks">
      {#each others as e (e.id)}
        <div class="row">
          <span class="ava sm">{mem(e.member_id)?.emoji || '🙂'}</span>
          <div class="grow"><b>{e.title}</b><small>{mName(e.member_id)}{e.helpers.length ? ' + ' + e.helpers.map(mName).join(', ') : ''} · seit {mins(e.before_at)} Min</small></div>
          {#if e.pending.includes(me.id)}<span class="chip"><Icon name="hourglass" size={14} />Angefragt</span>
          {:else}<button class="btn sec sm" onclick={() => join(e)}><Icon name="handshake" size={16} />Helfen</button>{/if}
        </div>
      {/each}
      {#each freeDuties as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)}</span> · ~{t.minutes} Min{#if L.overdueInPeriod(t, d)}{' · '}<span class="late">liegt {L.lateLabel(t)}</span>{/if}</small></div>
          {@render go(() => start({ task: t }))}
        </div>
      {/each}
    </section>
  {/if}

  <details class="card list fold extras" open={showExtras} ontoggle={e => (extrasOpen = e.currentTarget.open)}>
    <summary><Icon name="sparkles" />{plan ? 'Extras' : 'Offen für alle'} <span class="cnt grow">{#if plan && locked}<Icon name="lock" size={12} /> erst deine Dienste{:else}{extras.length + (plan ? ownExtras.length : 0)}{/if}</span><Icon name="chevron-down" size={16} /></summary>
    <div class="row xtools">
      {#if rooms.length > 1}
        <div class="filter grow">
          <button class:on={room === 'alle'} onclick={() => (room = 'alle')}>Alle</button>
          {#each rooms as r (r)}<button class:on={room === r} onclick={() => (room = r)}><Icon name={roomOf(r, S.settings).icon} size={15} />{r}</button>{/each}
        </div>
      {:else}<span class="grow"></span>{/if}
      <button class="btn sec sm" onclick={() => open(Extra)}><Icon name="plus" size={16} />Eigene</button>
    </div>
    {#if plan}
      {#each ownExtras as e (e.id)}
        <div class="row">
          <span class="tile c-brand"><Icon name="sparkles" /></span>
          <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)}</span> · selbst eingetragen</small></div>
          <button class="icb" onclick={() => dropEntry(e)} aria-label="Von der Liste nehmen"><Icon name="x" size={16} /></button>
          {@render extraGo(() => start({ entry: e }))}
        </div>
      {/each}
    {/if}
    {#each extras.filter(t => inRoom(t.room)) as t (t.id)}
      <div class="row">
        {@render tile(t.room)}
        <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)}</span> · ~{t.minutes} Min{#if L.overdueInPeriod(t, d)}{' · '}<span class="late">liegt {L.lateLabel(t)}</span>{/if}{G.kid ? (t.leicht ? ' · leicht' : ' · mit Hilfe') : ''}</small></div>
        {#if plan}{@render extraGo(() => start({ task: t }))}{:else}{@render go(() => start({ task: t }))}{/if}
      </div>
    {:else}
      {#if !ownExtras.length}<p class="empty">Alles erledigt. Die Bude glänzt! ✨</p>{/if}
    {/each}
    {#if early.length}
      <p class="sub-h">Später dran, schon vorziehen?</p>
      {#each early as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)}</span> · {t.freq === 'weekly' ? `eigentlich ${L.DAYS[t.day || 1]}` : `ab dem ${t.day || 1}.`}</small></div>
          {#if plan && !t.pflicht && locked}{@render extraGo(() => {})}{:else}{@render go(() => start({ task: t }), 'Jetzt machen', 'camera', 'sec')}{/if}
        </div>
      {/each}
    {/if}
  </details>

  <div class="foot-links">
    <button class="link" onclick={() => open(Help)}><Icon name="circle-help" size={15} />So funktioniert's</button>
    <button class="link" onclick={() => open(Krank)}><Icon name="thermometer" size={15} />{my.krank ? 'Krankmeldung' : 'Krank melden'}</button>
  </div>
</div>
