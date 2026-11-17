<script>
  import { tick } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import Icon from './parts/Icon.svelte';
  import { S, G, mName } from './lib/store.svelte.js';
  import { ui, toast, open } from './lib/ui.svelte.js';
  import { pushAsk, pushLater } from './lib/push.js';
  import PushAsk from './sheets/PushAsk.svelte';
  import { ROLES } from '../../shared/logic.js';
  import Join from './views/Join.svelte';
  import Who from './views/Who.svelte';
  import Today from './views/Today.svelte';
  import Photos from './views/Photos.svelte';
  import Rank from './views/Rank.svelte';
  import Me from './views/Me.svelte';
  import Overview from './views/Overview.svelte';
  import Admin from './views/Admin.svelte';
  import Chat from './views/Chat.svelte';

  const NAV = [
    { id: 'uebersicht', icon: 'layout-dashboard', label: 'Übersicht', admin: true },
    { id: 'heute', icon: 'list-checks', label: 'Heute' },
    { id: 'fotos', icon: 'images', label: 'Fotos' },
    { id: 'claude', icon: 'sparkles', label: 'Claude' },
    { id: 'rang', icon: 'trophy', label: 'Rangliste' },
    { id: 'ich', icon: 'user', label: 'Ich' },
    { id: 'verwaltung', icon: 'settings', label: 'Verwaltung', admin: true, desk: true },
  ];
  const VIEWS = { uebersicht: Overview, heute: Today, fotos: Photos, claude: Chat, rang: Rank, ich: Me, verwaltung: Admin };
  const items = $derived(NAV.filter(n => !n.admin || G.admin));
  const View = $derived(VIEWS[items.some(n => n.id === S.tab) ? S.tab : 'heute']);
  const badge = $derived(G.admin ? G.queue.length + G.proposals.length + G.pinHelp.length + G.openAntraege.length : 0);
  const fresh = $derived(G.freshMine); // neue Kommentare bei meinen Beiträgen
  const dot = id => (id === 'uebersicht' ? badge : id === 'fotos' ? fresh : id === 'claude' && G.chatNew && S.tab !== 'claude' ? 1 : 0);
  // Ansicht merken: Reiter und Scrollstelle überstehen Neuladen und Reiterwechsel.
  // Gemerkt wird der oberste sichtbare Beitrag (data-anchor), weil Pixel bei nachladenden Bildern ungenau sind.
  const VIEW = 'pp_view', FRESH = 30 * 60e3;
  const readView = () => { try { return JSON.parse(localStorage.getItem(VIEW) || '{}') || {}; } catch { return {}; } };
  const saveView = patch => { try { localStorage.setItem(VIEW, JSON.stringify({ ...readView(), ...patch, at: Date.now() })); } catch {} };
  function where() {
    for (const el of document.querySelectorAll('[data-anchor]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 70) return { id: el.dataset.anchor, off: r.top, y: scrollY };
    }
    return { y: scrollY };
  }
  function remember() { if (S.phase === 'app') saveView({ tab: S.tab, pos: { ...(readView().pos || {}), [S.tab]: where() } }); }
  async function restore(tab) {
    const v = readView(), p = v.pos?.[tab];
    await tick();
    await new Promise(r => requestAnimationFrame(r));
    if (tab === 'claude') return; // der Chat scrollt selbst nach unten
    if (!p || Date.now() - (v.at || 0) > FRESH) return scrollTo(0, 0);
    const align = () => {
      const el = p.id && document.querySelector(`[data-anchor="${CSS.escape(p.id)}"]`);
      if (el) scrollTo(0, scrollY + el.getBoundingClientRect().top - p.off);
      else scrollTo(0, p.y || 0);
    };
    align();
    setTimeout(align, 300); // falls oben noch etwas nachgeladen wurde
  }
  function go(id) {
    if (id === S.tab) return scrollTo({ top: 0, behavior: 'smooth' }); // nochmal tippen: nach oben
    remember();
    S.tab = id;
    saveView({ tab: id });
    restore(id);
  }
  let saveTimer;
  $effect(() => {
    const onScroll = () => { clearTimeout(saveTimer); saveTimer = setTimeout(remember, 250); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('pagehide', remember);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('pagehide', remember); };
  });
  let restored = false;
  $effect(() => { if (S.phase === 'app' && G.me && !restored) { restored = true; restore(S.tab); } });

  // Durchsagen kommen bei offenen Apps sofort als Meldung an
  $effect(() => { if (S.say && S.say.from !== S.meId) toast(`Durchsage von ${mName(S.say.from)}: ${S.say.text}`, 8000); });

  // Beim Öffnen fragen, ob Benachrichtigungen an sollen: einmal je Person und App-Start, kurz nachdem die App steht
  let asked;
  $effect(() => {
    const id = S.phase === 'app' ? S.meId : null;
    if (!id || asked === id) return;
    asked = id;
    setTimeout(async () => {
      const kind = S.meId === id && pushAsk();
      if (!kind || ui.sheets.length) return;
      const r = await open(PushAsk, { kind });
      if (r !== 'an') pushLater(r === 'nie');
    }, 800);
  });
</script>

{#if S.phase === 'boot'}
  <p class="empty" style="margin-top:40vh">Lädt …</p>
{:else if S.phase === 'join'}
  <Join />
{:else if S.phase === 'who'}
  <Who />
{:else if G.me}
  <div class="shell">
    <aside class="side">
      <div class="logo"><Icon name="sparkles" />Putzplan</div>
      {#each items as n (n.id)}
        <button class:on={S.tab === n.id} onclick={() => go(n.id)}><Icon name={n.icon} />{n.label}{#if dot(n.id)}<i class="nb">{dot(n.id)}</i>{/if}</button>
      {/each}
      <div class="who"><span class="ava sm">{G.me.emoji}</span><div><b>{G.me.name}</b><small>{ROLES[G.me.role]}</small></div></div>
    </aside>
    <main>
      {#if S.update}<button class="strip c-info" style="width:100%;text-align:left" onclick={() => location.reload()}><Icon name="refresh-cw" size={16} />Es gibt eine neue Version. Antippen zum Aktualisieren.</button>{/if}
      {#if !S.online}<div class="strip c-warn"><Icon name="wifi-off" size={16} />Keine Verbindung. Änderungen der anderen kommen gleich nach.</div>{/if}
      <View />
    </main>
  </div>
  <nav class="tabs">
    {#each items.filter(n => !n.desk) as n (n.id)}
      <button class:on={S.tab === n.id} onclick={() => go(n.id)}><Icon name={n.icon} /><span>{n.label}</span>{#if dot(n.id)}<i class="nb">{dot(n.id)}</i>{/if}</button>
    {/each}
  </nav>
{/if}

{#each ui.sheets as s (s.id)}
  {#if s.full}
    <s.comp {...s.props} close={s.close} />
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="sheet-bg" transition:fade={{ duration: 120 }} onclick={e => e.target === e.currentTarget && s.close()}>
      <div class="sheet" class:big={s.props.big} transition:fly={{ y: 40, duration: 180 }}><s.comp {...s.props} close={s.close} /></div>
    </div>
  {/if}
{/each}
{#if ui.toast}{#key ui.toast.id}<div class="toast" transition:fade={{ duration: 120 }}>{ui.toast.msg}</div>{/key}{/if}
{#if ui.rain}
  {#key ui.rain.id}
    <div class="rain" aria-hidden="true">
      {#each ui.rain.drops as d, i (i)}<span style="left:{d.left}vw;font-size:{d.size}px;animation-duration:{d.dur}s;animation-delay:{d.delay}s">{d.e}</span>{/each}
    </div>
  {/key}
{/if}
