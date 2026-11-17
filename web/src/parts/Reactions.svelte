<script>
  // Reaktionen und Kommentare unter einem Foto. Die zwei neuesten Kommentare sind immer zu sehen.
  import Icon from './Icon.svelte';
  import { S, G, reactionsOf, mem, mName, isSystem, post, del } from '../lib/store.svelte.js';
  import { tryDo, open } from '../lib/ui.svelte.js';
  import { toggle } from '../lib/react.js';
  import { shareEntry } from '../lib/share.js';
  import Reactors from '../sheets/Reactors.svelte';
  import { REACTS, involved } from '../../../shared/logic.js';
  let { entry } = $props();
  let picking = $state(false), writing = $state(false), all3 = $state(false), text = $state(''), sending = $state(false), input = $state();
  const all = $derived(reactionsOf(entry.id));
  const comments = $derived(all.filter(r => r.text).sort((a, b) => a.created_at.localeCompare(b.created_at)));
  const shown = $derived(all3 ? comments : comments.slice(-2));
  const groups = $derived(REACTS.map(e => ({ e, who: all.filter(r => r.emoji === e) })).filter(g => g.who.length));
  const mineEntry = $derived(involved(entry, S.meId));

  // Gedrückt halten (oder Rechtsklick) zeigt, wer womit reagiert hat. Kurz tippen reagiert wie bisher.
  let holdTimer, held = false;
  const who = () => { held = true; open(Reactors, { entry }); };
  function down() { held = false; clearTimeout(holdTimer); holdTimer = setTimeout(who, 450); }
  const up = () => clearTimeout(holdTimer);
  function menu(e) { e.preventDefault(); clearTimeout(holdTimer); if (!held) who(); }
  function tap(emoji) { if (held) return void (held = false); toggle(entry, emoji); }
  function pick(emoji) { picking = false; toggle(entry, emoji); }

  async function write() { writing = true; all3 = true; await Promise.resolve(); input?.focus(); }
  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    sending = true; text = '';
    if (!(await tryDo(() => post('/reactions', { id: crypto.randomUUID(), entry_id: entry.id, text: t })))) text = t;
    sending = false;
  }
  function ago(iso) {
    const s = (S.now - new Date(iso)) / 1000;
    if (s < 90) return 'gerade eben';
    if (s < 3600) return `vor ${Math.round(s / 60)} Min`;
    if (s < 6 * 3600) return `vor ${Math.round(s / 3600)} Std`;
    const d = new Date(iso), y = new Date(S.now); y.setDate(y.getDate() - 1);
    const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date(S.now).toDateString()) return hm;
    if (d.toDateString() === y.toDateString()) return `gestern ${hm}`;
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + hm;
  }
</script>

<div class="reacts">
  {#if picking}
    {#each REACTS as e (e)}
      <button class="rc" class:on={all.some(r => r.emoji === e && r.member_id === S.meId)} onclick={() => pick(e)}>{e}</button>
    {/each}
    <button class="rc ghost" onclick={() => (picking = false)} aria-label="Schließen"><Icon name="x" size={14} /></button>
  {:else}
    {#each groups as g (g.e)}
      <button class="rc" class:on={g.who.some(r => r.member_id === S.meId)} onclick={() => tap(g.e)} onpointerdown={down} onpointerup={up} onpointerleave={up} onpointercancel={up} oncontextmenu={menu}
        title="{g.who.map(r => mName(r.member_id)).join(', ')} (gedrückt halten für Details)">{g.e} {g.who.length}</button>
    {/each}
    <button class="rc ghost" onclick={() => (picking = true)} aria-label="Reagieren"><Icon name="smile-plus" size={16} /></button>
    <button class="rc ghost" onclick={write} aria-label="Kommentieren"><Icon name="message-circle" size={16} />{comments.length || ''}</button>
    {#if mineEntry}<button class="rc ghost" onclick={() => tryDo(() => shareEntry(entry))} aria-label="Als Bild teilen"><Icon name="share-2" size={16} /></button>{/if}
  {/if}
</div>

{#if comments.length || writing}
  <div class="cmts">
    {#if comments.length > shown.length}<button class="more" onclick={() => (all3 = true)}>Alle {comments.length} Kommentare ansehen</button>{/if}
    {#each shown as c (c.id)}
      {@const sys = isSystem(c.member_id)}
      <div class="cmt" class:sys>
        <span class="cav" class:sys>{#if sys}<Icon name="sparkles" size={15} />{:else}{mem(c.member_id)?.emoji || '🙂'}{/if}</span>
        <div class="cb">
          <div class="ch">
            <b>{mName(c.member_id)}</b>{#if sys}<span class="badge">System</span>{/if}
            <time>{ago(c.created_at)}</time>
            {#if c.member_id === S.meId || G.admin}<button class="cx" onclick={() => confirm('Kommentar löschen?') && tryDo(() => del('/reactions/' + c.id))} aria-label="Kommentar löschen"><Icon name="x" size={12} /></button>{/if}
          </div>
          <p>{c.text}</p>
        </div>
      </div>
    {/each}
    {#if writing}
      <div class="cin">
        <span class="cav">{G.me?.emoji}</span>
        <input bind:this={input} bind:value={text} maxlength="300" placeholder="Kommentieren …" enterkeyhint="send" onkeydown={e => e.key === 'Enter' && send()} />
        <button class="send" onclick={send} disabled={!text.trim() || sending} aria-label="Senden"><Icon name="send" size={16} /></button>
      </div>
    {:else}
      <button class="more" onclick={write}>Kommentieren …</button>
    {/if}
  </div>
{/if}
