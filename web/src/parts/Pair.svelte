<script>
  // Vorher/Nachher als Vorschaubilder. Antippen öffnet beide groß, doppelt tippen gibt ein Herz.
  import Icon from './Icon.svelte';
  import { open } from '../lib/ui.svelte.js';
  import { like } from '../lib/react.js';
  import Zoom from '../sheets/Zoom.svelte';
  let { entry, likeable = false } = $props();
  let hearts = $state([]), last = 0, timer, n = 0;
  const zoom = () => (entry.before_photo || entry.after_photo) && open(Zoom, { entry });

  function tap(ev) {
    if (!likeable) return zoom();
    const t = Date.now();
    if (t - last < 320) { // doppelt: Herz an der Stelle, kein Großbild
      clearTimeout(timer); last = 0;
      const box = ev.currentTarget.closest('.pair').getBoundingClientRect();
      const h = { id: ++n, x: ev.clientX - box.left, y: ev.clientY - box.top };
      hearts = [...hearts, h];
      setTimeout(() => (hearts = hearts.filter(x => x !== h)), 900);
      like(entry);
      return;
    }
    last = t;
    timer = setTimeout(zoom, 320);
  }
</script>

<div class="pair">
  {#each [['before', 'Vorher'], ['after', 'Nachher']] as [key, label] (key)}
    <button class="ph" onclick={tap} aria-label="{label}-Foto groß ansehen{likeable ? ', doppelt tippen für ein Herz' : ''}">
      {#if entry[key + '_photo']}
        <img src="/photos/{entry[key + '_photo']}.t.jpg" alt={label} loading="lazy" decoding="async" draggable="false" />
      {:else if key === 'after' && entry.status === 'started'}
        <Icon name="hourglass" size={28} />
      {:else}
        <Icon name="image-off" size={28} />
      {/if}
      <span>{label}</span>
      {#if entry[key + '_video']}<i class="vid"><Icon name="play" size={14} /></i>{/if}
    </button>
  {/each}
  {#each hearts as h (h.id)}<b class="heart" style="left:{h.x}px;top:{h.y}px" aria-hidden="true">❤️</b>{/each}
</div>
