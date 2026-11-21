<script>
  // Chat mit Claude: Fragen, Nachweise mit Foto, Anträge. Admins sehen zusätzlich die Chats aller anderen (nur lesen).
  // Symbole, die der Server zu erledigten Aktionen schickt (stehen hier, damit sie ins Symbol-Sprite kommen):
  // 'star' 'send' 'repeat' 'clipboard-list' 'lightbulb' 'trash-2' 'user-minus' 'shuffle' 'eye' 'undo-2' 'tree-palm'
  // 'triangle-alert' 'circle-check' 'circle-x' 'database' 'image-off' 'settings' 'rotate-cw'
  import { tick, untrack } from 'svelte';
  import Icon from '../parts/Icon.svelte';
  import { S, G, api, post, mem, mName, markChatSeen, setChatBusy } from '../lib/store.svelte.js';
  import { open, toast } from '../lib/ui.svelte.js';
  import Camera from '../sheets/Camera.svelte';
  import ChatPhoto from '../sheets/ChatPhoto.svelte';
  import { md } from '../lib/md.js';

  let mode = $state('mein'); // Admins: 'mein' | 'alle'
  let who = $state(null); // Admins: wessen Chat gerade angesehen wird (null = eigener)
  let people = $state.raw([]), limitEur = $state(10);
  let text = $state(''), shot = $state.raw(null), sending = $state(false), loaded = $state(false), limit = $state(false);
  let box = $state();
  const target = $derived(who || S.meId);
  const own = $derived(target === S.meId);
  const msgs = $derived(S.chat.filter(m => m.member_id === target));
  const busy = $derived(!!S.chatBusy[target]?.busy);
  const SUGGEST = ['Was muss ich heute noch machen?', 'Wie viele Punkte hab ich diese Woche?', 'Ich hab mehr gemacht als eingetragen', 'Wie funktioniert der Dienstplan?'];

  async function load(id) {
    loaded = false;
    try {
      const r = await api('GET', '/chat' + (id !== S.meId ? `?member=${encodeURIComponent(id)}` : ''));
      S.chat = [...S.chat.filter(m => m.member_id !== id), ...r.messages];
      setChatBusy(r.busy);
      limit = !!r.limit;
    } catch (e) { toast(e.message); }
    loaded = true;
    await bottom();
  }
  async function loadPeople() {
    try { const r = await api('GET', '/chat/people'); people = r.people; limitEur = r.limit; } catch (e) { toast(e.message); }
  }
  $effect(() => { const id = target; untrack(() => load(id)); });
  $effect(() => { if (mode === 'alle') untrack(loadPeople); });
  // Neue Nachricht oder Claude tippt: nach unten, solange man ohnehin unten war
  $effect(() => {
    msgs.length; busy;
    untrack(() => { if (own) markChatSeen(); if (innerHeight + scrollY > document.body.scrollHeight - 220) bottom(); });
  });
  async function bottom() { await tick(); scrollTo({ top: document.body.scrollHeight }); }

  async function send(t = text) {
    t = t.trim();
    if ((!t && !shot) || sending || busy) return;
    sending = true;
    try {
      await post('/chat', { text: t, ...(shot ? { photo: shot.photo, thumb: shot.thumb, galerie: !!shot.galerie } : {}) });
      text = ''; shot = null;
      grow();
      await bottom();
    } catch (e) { toast(e.message, 5000); if (e.status === 429) limit = true; }
    sending = false;
  }
  async function snap() {
    const img = await open(Camera, { label: 'Foto für Claude', kind: 'beweis' }, true);
    if (img) shot = { photo: img.photo, thumb: img.thumb };
  }
  // Admins: Bild aus der Galerie (z. B. ein Screenshot). Zählt nie als Beweis, das weiß Claude.
  let picker = $state();
  async function pick(ev) {
    const f = ev.currentTarget.files?.[0];
    ev.currentTarget.value = '';
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const draw = max => {
        const sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
        cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
        const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); // durchsichtige Screenshots nicht schwarz
        g.drawImage(bmp, 0, 0, cv.width, cv.height);
        return cv;
      };
      const big = draw(1600);
      let q = 0.85, photo = big.toDataURL('image/jpeg', q);
      while (photo.length * 0.75 > 850_000 && q > 0.4) { q -= 0.12; photo = big.toDataURL('image/jpeg', q); }
      shot = { photo, thumb: draw(480).toDataURL('image/jpeg', 0.6), galerie: true };
    } catch { toast('Das Bild ließ sich nicht öffnen'); }
  }
  function key(e) {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
  }
  function grow() { if (!box) return; box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 132) + 'px'; }

  // Anzeige: Claudes Antworten mit Markdown (Personen mit Emoji, Fotos aus der App, Chat-Fotos nur aus diesem Chat)
  const mdCtx = $derived.by(() => {
    const own = new Set(msgs.map(m => m.photo).filter(Boolean));
    return { people: new Map(S.members.map(m => [m.name.toLowerCase(), m])), photoOk: name => !/^[cg]-/.test(name) || own.has(name) };
  });
  /** Klicks in Claudes Antworten: Foto groß ansehen, Code kopieren. */
  function mdClick(e) {
    const ph = e.target.closest?.('[data-photo]');
    if (ph) return open(ChatPhoto, { name: ph.dataset.photo });
    const cp = e.target.closest?.('[data-copy]');
    if (cp) navigator.clipboard?.writeText(cp.closest('pre').querySelector('code').textContent).then(() => toast('Kopiert'), () => toast('Kopieren ging nicht'));
  }
  const time = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  function dayLabel(iso) {
    const d = new Date(iso), t = new Date(), y = new Date(Date.now() - 864e5);
    if (d.toDateString() === t.toDateString()) return 'Heute';
    if (d.toDateString() === y.toDateString()) return 'Gestern';
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const newDay = i => i === 0 || new Date(msgs[i - 1].created_at).toDateString() !== new Date(msgs[i].created_at).toDateString();
  const euro = n => (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `vor ${Math.max(1, m)} Min` : m < 1440 ? `vor ${Math.round(m / 60)} Std` : new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }); };
  function view(id) { who = id === S.meId ? null : id; mode = 'mein'; }
</script>

<div class="narrow chat">
  <div class="top">
    {#if !own}<button class="icb" onclick={() => { who = null; mode = 'alle'; }} aria-label="Zurück"><Icon name="arrow-left" size={18} /></button>{/if}
    <span class="cav sys big">✨</span>
    <div class="grow">
      <h1>{own ? 'Claude' : `Chat von ${mName(target)}`} {#if own}<span class="badge">System</span>{/if}</h1>
      <p class="sub">{own ? 'Fragen, Nachweise, Anträge an die Admins' : 'Nur lesen'}</p>
    </div>
  </div>
  {#if G.admin && own}
    <div class="seg">
      <button class:on={mode === 'mein'} onclick={() => (mode = 'mein')}>Mein Chat</button>
      <button class:on={mode === 'alle'} onclick={() => (mode = 'alle')}>Alle Chats</button>
    </div>
  {/if}

  {#if mode === 'alle'}
    <section class="card list">
      {#each people as p (p.member_id)}
        {@const m = mem(p.member_id)}
        {@const isAdmin = m?.role === 'admin'}
        <button class="row" onclick={() => view(p.member_id)}>
          <span class="ava sm">{m?.emoji || '🙂'}</span>
          <span class="grow"><b>{m?.name || 'Ehemalig'}</b><small class="clip">{p.preview?.role === 'claude' ? 'Claude: ' : ''}{p.preview?.text || 'Foto'}</small></span>
          <span class="meta"><small>{ago(p.last)}</small><small class:late={!isAdmin && p.month >= limitEur * 0.8}>{euro(p.month)}{isAdmin ? '' : ` / ${euro(limitEur)}`}</small></span>
        </button>
      {:else}
        <p class="sub">Noch hat niemand mit Claude geschrieben.</p>
      {/each}
      <p class="hint">Beträge sind die API-Kosten in diesem Monat. Nur Admins sehen sie, ohne Grenze für Admins.</p>
    </section>
  {:else}
    <div class="msgs">
      {#if loaded && !msgs.length && own}
        <div class="cm claude">
          <span class="cav sys">✨</span>
          <div class="cbub">
            <p>Hi {G.me.name}! Ich bin Claude. Frag mich alles rund um den Putzplan: Punkte, Dienste, wer was gemacht hat.</p>
            <p>Mehr gemacht als eingetragen? Schick ein Foto, dann gibt es vielleicht einen kleinen Bonus. Größeres gebe ich als Antrag an Dorina und Felix weiter.</p>
          </div>
        </div>
        <div class="suggest">
          {#each SUGGEST as s (s)}<button class="chip" onclick={() => send(s)}>{s}</button>{/each}
        </div>
      {/if}
      {#each msgs as m, i (m.id)}
        {#if newDay(i)}<div class="cday">{dayLabel(m.created_at)}</div>{/if}
        <div class="cm {m.role === 'user' ? 'me' : 'claude'}">
          {#if m.role !== 'user'}<span class="cav sys">✨</span>{/if}
          <div class="cbub">
            {#if m.photo}
              <button class="cphoto" onclick={() => open(ChatPhoto, { name: m.photo })} aria-label="Foto groß ansehen"><img src="/photos/{m.photo}.t.jpg" alt="Foto" loading="lazy" /></button>
            {/if}
            {#if m.text}<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions --><div class="md" onclick={mdClick}>{@html md(m.text, mdCtx)}</div>{/if}
            {#if m.actions?.length}
              <div class="cacts">{#each m.actions as a, j (j)}<span class="chip c-brand"><Icon name={a.icon || 'check'} size={13} />{a.text}</span>{/each}</div>
            {/if}
            <small class="ctime">{time(m.created_at)}</small>
          </div>
        </div>
      {/each}
      {#if busy}
        <div class="cm claude"><span class="cav sys">✨</span><div class="cbub typing" aria-label="Claude schreibt"><i></i><i></i><i></i></div></div>
      {/if}
    </div>

    {#if own}
      <div class="composer">
        {#if limit}
          <p class="hint">Für diesen Monat hast du Claude schon sehr viel gefragt. Ab nächstem Monat geht es weiter.</p>
        {:else if !S.chatReady}
          <p class="hint">Claude ist noch nicht eingerichtet.</p>
        {:else}
          {#if shot}
            <div class="cshot"><img src={shot.thumb} alt="Dein Foto" /><span class="grow">{shot.galerie ? 'Bild aus der Galerie kommt mit' : 'Foto kommt mit'}</span><button class="icb" onclick={() => (shot = null)} aria-label="Foto entfernen"><Icon name="x" size={16} /></button></div>
          {/if}
          <div class="cin">
            <button class="icb" onclick={snap} aria-label="Foto machen" disabled={sending}><Icon name="camera" size={18} /></button>
            {#if G.admin}
              <button class="icb" onclick={() => picker.click()} aria-label="Bild aus der Galerie" title="Bild aus der Galerie (nur Admins)" disabled={sending}><Icon name="image" size={18} /></button>
              <input bind:this={picker} type="file" accept="image/*" onchange={pick} hidden />
            {/if}
            <textarea bind:this={box} bind:value={text} oninput={grow} onkeydown={key} rows="1" maxlength="2000" placeholder={busy ? 'Claude schreibt …' : 'Schreib Claude …'}></textarea>
            <button class="btn sm send" onclick={() => send()} disabled={sending || busy || (!text.trim() && !shot)} aria-label="Senden"><Icon name="send-horizontal" size={18} /></button>
          </div>
          <small class="cnote">Dorina und Felix können alle Chats lesen.</small>
        {/if}
      </div>
    {/if}
  {/if}
</div>
