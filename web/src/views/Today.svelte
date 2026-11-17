<script>
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

  let room = $state('alle');
  const c = $derived(G.calc), me = $derived(G.me), d = $derived(c.d), plan = $derived(c.plan);
  const my = $derived(c.per[me.id]);
  const mins = iso => Math.max(0, Math.floor((S.now - new Date(iso)) / 60000));
  const roomName = e => (e.task_id === 'adhoc' ? 'Extra' : taskOf(e.task_id)?.room || 'Extra');
  const ptsFor = e => (e.task_id === 'adhoc' ? e.points : L.ptsOf(taskOf(e.task_id)));
  const locked = $derived(G.extrasLocked);
  const lockHint = () => toast(`Erst deine Dienste, dann Extras. Noch ${G.myOpen.length} offen.`);

  // Meine Sachen: nachbessern, läuft gerade, Dienste, Eigenes für mich, heute schon erledigte Dienste
  const mine = $derived(S.entries.filter(e => L.involved(e, me.id)));
  const fix = $derived(mine.filter(e => e.status === 'done' && e.review === 'nach'));
  const running = $derived(mine.filter(e => e.status === 'started'));
  const todo = $derived(mine.filter(e => e.status === 'todo' && e.member_id === me.id));
  const duties = $derived(todo.filter(L.isDuty));
  const ownExtras = $derived(todo.filter(e => !L.isDuty(e)));
  const personal = $derived(L.personalTasksFor(c.st, me, d).filter(t => !L.entryFor(c.ix, t, d, me.id)));
  const dutiesDone = $derived(my.duties.filter(e => e.status === 'done'));
  const left = $derived(plan ? my.duties.length - my.dutiesDone : Math.max(0, my.goal - my.goalPts));
  const doneToday = $derived(mine.filter(e => e.status === 'done' && !L.ADMIN_KINDS.has(e.task_id) && L.dKey(new Date(e.after_at)) === c.today));
  const mineCount = $derived(fix.length + running.length + duties.length + personal.length + (plan ? 0 : ownExtras.length));

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

  // Wer hat heute was? (nur mit Dienstplan)
  const board = $derived(plan ? G.active.map(m => ({ m, list: c.per[m.id].duties })).filter(x => x.list.length) : []);

  const royals = $derived(L.royals(c.st, d));
  const iAmRoyal = $derived(royals.some(r => r.m.id === me.id));
  const royalDay = $derived(iAmRoyal && L.royalDayTaken(c.st, me, d));
  const washToday = $derived(+me.waschtag === L.isoDay(d)), washTomorrow = $derived(+me.waschtag === L.isoDay(d) % 7 + 1);
  const greet = $derived(L.isoDay(d) >= 6 ? 'Schönes Wochenende' : ['Guten Morgen', 'Hallo', 'Na'][Math.min(2, Math.floor(d.getHours() / 8))]);
  const heroText = $derived(plan
    ? (!my.duties.length ? 'Heute hast du keine Dienste. Extras bringen trotzdem Punkte.' : left ? `Noch ${left} ${left === 1 ? 'Dienst' : 'Dienste'}, dann ist dein Tag geschafft` : 'Alle Dienste erledigt! Jetzt gibt es Extras.')
    : (!my.goal ? 'Heute hast du frei' : left ? `Noch ${left} Punkte bis zum Tagesziel` : 'Tagesziel geschafft!'));
</script>

{#snippet tile(name)}
  {@const r = roomOf(name, S.settings)}
  <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
{/snippet}
{#snippet extraBtn(go)}
  {#if locked}<button class="btn sec sm" onclick={lockHint} aria-label="Gesperrt, erst deine Dienste"><Icon name="lock" size={16} /></button>
  {:else}<button class="btn sm" onclick={go}><Icon name="camera" size={16} />Start</button>{/if}
{/snippet}

<div class="narrow">
  <section class="hero">
    {#if plan}<Ring value={my.dutiesDone} goal={my.duties.length} />{:else}<Ring value={my.goalPts} goal={my.goal} />{/if}
    <div class="grow">
      <h1>{greet}, {me.name} {me.emoji}</h1>
      <p>{heroText}</p>
      <div class="chips">
        <span class="chip"><Icon name="flame" size={14} />{my.streak} {my.streak === 1 ? 'Tag' : 'Tage'}</span>
        <span class="chip"><Icon name="star" size={14} />{my.today} P heute</span>
        <span class="chip"><Icon name="trophy" size={14} />{my.week} P Woche</span>
        <button class="chip" onclick={() => open(Help)} aria-label="So funktioniert's"><Icon name="circle-help" size={14} />Regeln</button>
      </div>
      {#if !plan && my.bank > 0 && left > 0}
        <button class="btn white sm" style="margin-top:10px" onclick={() => confirm(`${Math.min(my.bank, left)} Punkte vom Konto einlösen? Dann ist das Tagesziel geschafft.`) && redeem()}><Icon name="piggy-bank" size={16} />{Math.min(my.bank, left)} Punkte einlösen</button>
      {/if}
    </div>
  </section>

  {#if G.planSoon}
    <button class="strip c-info" style="width:100%;text-align:left" onclick={() => open(Help)}><Icon name="calendar-check" size={16} /><span class="grow">Ab morgen gibt es den Dienstplan: Die großen Aufgaben werden fair verteilt, Kleinkram wird Extra.</span><Icon name="chevron-right" size={16} /></button>
  {/if}
  {#if washToday}<div class="strip c-info"><Icon name="shirt" size={16} />Heute ist dein Waschtag: Korb runterbringen</div>
  {:else if washTomorrow}<div class="strip c-info"><Icon name="shirt" size={16} />Morgen ist dein Waschtag</div>{/if}
  {#if royals.length}
    <div class="strip c-warn">
      <Icon name="crown" size={16} />
      <span class="grow">{royals.map(r => `${L.royalTitle(r.m)} ${r.m.name}`).join(' & ')} {royals.length > 1 ? 'regieren' : 'regiert'} diese Woche ({royals[0].pts} P)
        {#if royalDay}· dein freier Tag: {L.DAYS[L.isoDay(new Date(royalDay.after_at))]}{/if}</span>
      {#if iAmRoyal && !royalDay}<button class="btn warn sm" onclick={() => open(Royal)}>Freien Tag wählen</button>{/if}
    </div>
  {/if}

  {#if mineCount || dutiesDone.length}
    <div class="sec-h"><h2>{plan ? 'Deine Dienste' : 'Meins'}</h2><span class="cnt">{plan ? `${my.dutiesDone} von ${my.duties.length} erledigt` : mineCount}</span></div>
    <section class="card list">
      {#each fix as e (e.id)}
        <div class="row">
          <span class="tile c-warn"><Icon name="rotate-ccw" /></span>
          <div class="grow"><b>{e.title}</b><small><span class="late">Bitte nachbessern</span>{e.review_note ? `: ${e.review_note}` : ''}</small></div>
          <button class="btn warn sm" onclick={() => redo(e)}><Icon name="camera" size={16} />Neues Foto</button>
        </div>
      {/each}
      {#each running as e (e.id)}
        <div class="row">
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small>läuft seit {mins(e.before_at)} Min{e.helpers.length ? ` · im Team mit ${[e.member_id, ...e.helpers].filter(x => x !== me.id).map(mName).join(', ')}` : ''}</small></div>
          {#if e.member_id === me.id}
            <button class="icb" onclick={() => cancel(e)} aria-label="Abbrechen"><Icon name="x" size={16} /></button>
            <button class="btn ok sm" onclick={() => finish(e)}><Icon name="camera" size={16} />Fertig</button>
          {:else}
            <span class="chip c-brand"><Icon name="handshake" size={14} />Du hilfst mit</span>
          {/if}
        </div>
        {#if e.member_id === me.id}
          {#each e.pending as h (h)}
            <div class="row ask">
              <span class="ava sm">{mem(h)?.emoji || '🙂'}</span>
              <div class="grow"><b>{mName(h)} möchte mithelfen</b><small>bei {e.title}</small></div>
              <button class="icb" onclick={() => decideHelper(e, h, false)} aria-label="Ablehnen"><Icon name="x" size={16} /></button>
              <button class="btn ok sm" onclick={() => decideHelper(e, h, true)}><Icon name="check" size={16} />Ja</button>
            </div>
          {/each}
        {/if}
      {/each}
      {#each duties as e (e.id)}
        <div class="row">
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)} P</span>{e.created_by === 'plan' ? '' : e.note === 'koch' ? ' · wer kocht, räumt auf' : ` · von ${mName(e.created_by)}`}{#if L.dutyDay(e) < c.today} · <span class="late">seit {L.DAYS[L.isoDay(new Date(e.created_at))]}</span>{/if}</small></div>
          <button class="btn sm" onclick={() => start({ entry: e })}><Icon name="camera" size={16} />Start</button>
        </div>
      {/each}
      {#each personal as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)} P</span> · nur für dich{t.freq === 'monthly' ? ' · bis Monatsende' : t.freq === 'weekend' ? ' · dieses Wochenende' : ''}</small></div>
          <button class="btn sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Start</button>
        </div>
      {/each}
      {#if !plan}
        {#each ownExtras as e (e.id)}
          <div class="row">
            <span class="tile c-brand"><Icon name="sparkles" /></span>
            <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)} P</span> · Extra</small></div>
            <button class="icb" onclick={() => dropEntry(e)} aria-label="Von der Liste nehmen"><Icon name="x" size={16} /></button>
            <button class="btn sm" onclick={() => start({ entry: e })}><Icon name="camera" size={16} />Start</button>
          </div>
        {/each}
      {/if}
      {#each dutiesDone as e (e.id)}
        <div class="row done">
          <span class="tile c-ok"><Icon name="check" /></span>
          <div class="grow"><b>{e.title}</b><small>erledigt{e.after_at ? ` um ${new Date(e.after_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}</small></div>
          <span class="pts">+{L.shares(e)[me.id] ?? e.points}</span>
        </div>
      {/each}
    </section>
  {:else if plan}
    <div class="sec-h"><h2>Deine Dienste</h2></div>
    <section class="card"><p class="sub">Heute hast du keine Dienste. Du kannst trotzdem Extras machen oder anderen helfen.</p></section>
  {/if}

  {#if freeDuties.length || others.length}
    <div class="sec-h"><h2>{plan ? 'Noch offen' : 'Gerade dran'}</h2>{#if plan}<span class="cnt">hat niemand, jeder darf</span>{/if}</div>
    <section class="card list">
      {#each others as e (e.id)}
        <div class="row">
          <span class="ava sm">{mem(e.member_id)?.emoji || '🙂'}</span>
          <div class="grow"><b>{e.title}</b><small>{mName(e.member_id)}{e.helpers.length ? ' + ' + e.helpers.map(mName).join(', ') : ''} ist dran · seit {mins(e.before_at)} Min</small></div>
          {#if e.pending.includes(me.id)}<span class="chip"><Icon name="hourglass" size={14} />Angefragt</span>
          {:else}<button class="btn sec sm" onclick={() => join(e)}><Icon name="handshake" size={16} />Mithelfen</button>{/if}
        </div>
      {/each}
      {#each freeDuties as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)} P</span> · ~{t.minutes} Min{#if L.overdueInPeriod(t, d)} · <span class="late">liegt {L.lateLabel(t)}</span>{/if}</small></div>
          <button class="btn sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Start</button>
        </div>
      {/each}
    </section>
  {/if}

  <div class="sec-h">
    <h2>{plan ? 'Extras' : 'Offen'}</h2>
    <span class="cnt grow">{#if plan && locked}<span class="late"><Icon name="lock" size={12} /> erst deine Dienste</span>{:else}{extras.length} {extras.length === 1 ? 'Aufgabe' : 'Aufgaben'}{/if}</span>
    <button class="btn sec sm" onclick={() => open(Extra)}><Icon name="plus" size={16} />Eigene</button>
  </div>
  {#if plan}<p class="sub" style="margin:-4px 2px 8px">{locked ? 'Kleinkram gibt Punkte obendrauf, aber erst wenn deine Dienste erledigt sind.' : 'Kleinkram, der Punkte obendrauf bringt.'}</p>{/if}
  {#if rooms.length > 1}
    <div class="filter">
      <button class:on={room === 'alle'} onclick={() => (room = 'alle')}>Alle <em>{extras.length}</em></button>
      {#each rooms as r (r)}
        <button class:on={room === r} onclick={() => (room = r)}><Icon name={roomOf(r, S.settings).icon} size={16} />{r} <em>{extras.filter(t => t.room === r).length}</em></button>
      {/each}
    </div>
  {/if}
  <section class="card list" class:dim={plan && locked}>
    {#if plan}
      {#each ownExtras as e (e.id)}
        <div class="row">
          <span class="tile c-brand"><Icon name="sparkles" /></span>
          <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)} P</span> · selbst eingetragen</small></div>
          <button class="icb" onclick={() => dropEntry(e)} aria-label="Von der Liste nehmen"><Icon name="x" size={16} /></button>
          {@render extraBtn(() => start({ entry: e }))}
        </div>
      {/each}
    {:else}
      {#each others.filter(e => inRoom(roomName(e))) as e (e.id)}
        <div class="row">
          <span class="ava sm">{mem(e.member_id)?.emoji || '🙂'}</span>
          <div class="grow"><b>{e.title}</b><small>{mName(e.member_id)} ist dran · seit {mins(e.before_at)} Min</small></div>
          {#if e.pending.includes(me.id)}<span class="chip"><Icon name="hourglass" size={14} />Angefragt</span>
          {:else}<button class="btn sec sm" onclick={() => join(e)}><Icon name="handshake" size={16} />Mithelfen</button>{/if}
        </div>
      {/each}
    {/if}
    {#each extras.filter(t => inRoom(t.room)) as t (t.id)}
      <div class="row">
        {@render tile(t.room)}
        <div class="grow">
          <b>{t.title}</b>
          <small><span class="pts">+{L.ptsOf(t)} P</span> · ~{t.minutes} Min{#if L.overdueInPeriod(t, d)} · <span class="late">liegt {L.lateLabel(t)}</span>{/if}{G.kid ? (t.leicht ? ' · leicht' : ' · mit Hilfe') : ''}</small>
        </div>
        {#if plan}{@render extraBtn(() => start({ task: t }))}{:else}<button class="btn sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Start</button>{/if}
      </div>
    {:else}
      {#if !ownExtras.length}<p class="empty">Alles erledigt. Die Bude glänzt!</p>{/if}
    {/each}
  </section>

  {#if board.length}
    <details class="card list">
      <summary><Icon name="users" />Wer hat heute was? <span class="cnt">{board.reduce((s, x) => s + x.list.filter(e => e.status === 'done').length, 0)} von {board.reduce((s, x) => s + x.list.length, 0)} erledigt</span></summary>
      {#each board as x (x.m.id)}
        {@const done = x.list.filter(e => e.status === 'done').length}
        <div class="row board">
          <span class="ava sm">{x.m.emoji}</span>
          <div class="grow">
            <b>{x.m.name}</b> <span class="cnt">{done}/{x.list.length}</span>
            <div class="dchips">
              {#each x.list as e (e.id)}
                <span class="dchip {e.status}"><Icon name={e.status === 'done' ? 'check' : e.status === 'started' ? 'timer' : e.status === 'missed' ? 'x' : 'circle'} size={12} />{e.title}</span>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </details>
  {/if}

  {#if early.length}
    <details class="card list">
      <summary><Icon name="chevron-down" />Später dran, schon vorziehen? <span class="cnt">{early.length}</span></summary>
      {#each early as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)} P</span> · {t.freq === 'weekly' ? `eigentlich ${L.DAYS[t.day || 1]}` : `eigentlich ab dem ${t.day || 1}.`}{plan ? (t.pflicht ? ' · Dienst' : ' · Extra') : ''}</small></div>
          {#if plan && !t.pflicht && locked}{@render extraBtn(() => {})}{:else}<button class="btn sec sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Jetzt</button>{/if}
        </div>
      {/each}
    </details>
  {/if}
  {#if doneToday.length}
    <details class="card list">
      <summary><Icon name="circle-check" />Heute von dir erledigt <span class="cnt">{doneToday.length}</span></summary>
      {#each doneToday as e (e.id)}
        <div class="row">
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small>{new Date(e.after_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr{e.helpers.length ? ' · im Team' : ''}{plan ? (L.isDuty(e) ? ' · Dienst' : ' · Extra') : ''}</small></div>
          <span class="pts">+{L.shares(e)[me.id] ?? e.points}</span>
        </div>
      {/each}
    </details>
  {/if}
</div>
