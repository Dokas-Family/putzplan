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
</script>

<Head title={entry.title} {close} />
<div class="zoom" class:two={shots.length === 2}>
  {#each shots as [key, label] (key)}
    <div class="ph" style="aspect-ratio:auto">
      {#if entry[key + '_video']}
        <video src="/photos/{entry[key + '_video']}" poster="/photos/{entry[key + '_photo']}.jpg" controls playsinline loop muted autoplay preload="metadata"></video>
      {:else}
        <img src="/photos/{entry[key + '_photo']}.jpg" alt={label} />
      {/if}
      <span>{label}{entry[key + '_video'] ? ' · Video' : ''}</span>
    </div>
  {/each}
</div>
{#if entry.status === 'done' && involved(entry, S.meId) && shots.length === 2}
  <button class="btn sec wide" style="margin-top:10px" onclick={() => tryDo(() => shareEntry(entry))}><Icon name="share-2" size={16} />Als Bild teilen</button>
{/if}
