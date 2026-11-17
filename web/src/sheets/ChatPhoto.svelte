<script>
  // Ein Foto aus dem Chat groß.
  import Head from '../parts/Head.svelte';
  let { name, close } = $props();
</script>

<Head title="Foto im Chat" {close} />
<img class="cbig" src="/photos/{name}.jpg" alt="Foto im Chat" />
