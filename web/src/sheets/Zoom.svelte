<script>
  // Vorher und Nachher groß, mit Video, wenn es eins gibt.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S } from '../lib/store.svelte.js';
  import { tryDo } from '../lib/ui.svelte.js';
  import { shareEntry } from '../lib/share.js';
  import { involved } from '../../../shared/logic.js';
  let { entry, close } = $props();
  const shots = $derived([['before', 'Vorher'], ['after', 'Nachher']].filter(([k]) => entry[k + '_photo']));
  /** Das große Foto blendet über das kleine (schon geladene) Vorschaubild, sobald es da ist. */
  function fade(img) {
    const done = () => img.classList.add('ready');
    if (img.complete && img.naturalWidth) done();
    else img.addEventListener('load', done, { once: true });
  }
</script>

<Head title={entry.title} {close} />
<div class="zoom" class:two={shots.length === 2}>
  {#each shots as [key, label] (key)}
    <div class="ph" style="aspect-ratio:auto">
      {#if entry[key + '_video']}
        <video src="/photos/{entry[key + '_video']}" poster="/photos/{entry[key + '_photo']}.jpg" controls playsinline loop muted autoplay preload="metadata"></video>
      {:else}
        <div class="zimg">
          <img class="lo" src="/photos/{entry[key + '_photo']}.t.jpg" alt="" aria-hidden="true" />
          <img class="hi" use:fade src="/photos/{entry[key + '_photo']}.jpg" alt={label} decoding="async" />
        </div>
      {/if}
      <span>{label}{entry[key + '_video'] ? ' · Video' : ''}</span>
    </div>
  {/each}
</div>
{#if entry.status === 'done' && involved(entry, S.meId) && shots.length === 2}
  <button class="btn sec wide" style="margin-top:10px" onclick={() => tryDo(() => shareEntry(entry))}><Icon name="share-2" size={16} />Als Bild teilen</button>
{/if}
