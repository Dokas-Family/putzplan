<script>
  // Kamera nur live, keine Galerie. Liefert das Foto und ein kleines Vorschaubild, wahlweise dazu ein kurzes Video.
  // Beim Video wird das letzte Bild zum Foto, damit Vorschau, Prüfen und Teilen gleich bleiben.
  import { onDestroy } from 'svelte';
  import Icon from '../parts/Icon.svelte';
  import { G } from '../lib/store.svelte.js';
  import { toast } from '../lib/ui.svelte.js';
  let { label, kind = 'before', close } = $props();
  let video = $state(), stream = $state.raw(null), error = $state(''), shot = $state.raw(null);
  let mode = $state('foto'), rec = $state.raw(null), secs = $state(0), torch = $state(false), torchOk = $state(false);
  let facing = 'environment', fakeTimer;
  const dev = import.meta.env.DEV, MAX = 15;
  const two = n => String(n).padStart(2, '0');
  const TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const videoType = () => (typeof MediaRecorder === 'undefined' ? null : TYPES.find(t => MediaRecorder.isTypeSupported(t)) || null);
  const canVideo = !!videoType() && kind !== 'beweis'; // Nachweis für Claude: nur Foto
  const TAG = { before: 'VORHER', after: 'NACHHER', beweis: 'NACHWEIS' };

  async function start() {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) return void (error = 'Dieser Browser kann keine Kamera in Apps öffnen. Bitte die App in Chrome oder Safari öffnen.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      error = ''; torch = false;
      torchOk = !!stream.getVideoTracks()[0]?.getCapabilities?.().torch; // Lampe: viele Android-Handys ja, iPhone leider nicht
    }
    catch {
      if (dev) return fakeCam(); // nur in der Entwicklung: bewegtes Testbild statt Kamera
      error = 'Ich komme nicht an die Kamera. Bitte erlaube den Kamera-Zugriff für diese App und versuch es nochmal. Fotos aus der Galerie gehen absichtlich nicht.';
    }
  }
  function stop() { stream?.getTracks().forEach(t => t.stop()); stream = null; clearInterval(fakeTimer); }
  $effect(() => { if (video && stream) { video.srcObject = stream; video.play().catch(() => {}); } });
  start();
  onDestroy(() => { rec?.r.state === 'recording' && rec.r.stop(); stop(); if (shot?.url) URL.revokeObjectURL(shot.url); });

  function canvas(source, sw, sh, max) {
    const sc = Math.min(1, max / Math.max(sw, sh)), cv = document.createElement('canvas');
    cv.width = Math.round(sw * sc); cv.height = Math.round(sh * sc);
    cv.getContext('2d').drawImage(source, 0, 0, cv.width, cv.height);
    return cv;
  }
  function still(source, sw, sh) {
    const cv = canvas(source, sw, sh, 1280), g = cv.getContext('2d'), d = new Date();
    const stamp = `${G.me?.name || ''} · ${TAG[kind] || 'VORHER'} · ${two(d.getDate())}.${two(d.getMonth() + 1)}. ${two(d.getHours())}:${two(d.getMinutes())}`;
    const fs = Math.max(14, Math.round(cv.width / 32));
    g.font = `bold ${fs}px system-ui,sans-serif`;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, cv.height - fs * 1.8, cv.width, fs * 1.8);
    g.fillStyle = '#fff'; g.fillText(stamp, fs * 0.6, cv.height - fs * 0.6);
    return { photo: cv.toDataURL('image/jpeg', 0.72), thumb: canvas(cv, cv.width, cv.height, 480).toDataURL('image/jpeg', 0.6) };
  }
  async function lamp() {
    try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: !torch }] }); torch = !torch; }
    catch { torchOk = false; toast('Die Lampe geht auf diesem Handy leider nicht. Mach am besten das Licht an.'); }
  }
  function snap() {
    if (!video?.videoWidth) return toast('Kamera lädt noch …');
    shot = still(video, video.videoWidth, video.videoHeight);
  }

  // ---------- Video ----------
  function record() {
    if (!video?.videoWidth || !stream) return toast('Kamera lädt noch …');
    const type = videoType(), chunks = [];
    const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_500_000 });
    r.ondataavailable = e => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      if (!blob.size) return toast('Das Video ist leer geblieben. Nochmal versuchen?');
      shot = { ...rec.frame, video: blob, url: URL.createObjectURL(blob) };
      rec = null;
    };
    secs = 0;
    rec = { r, frame: null, t: setInterval(() => { secs++; if (secs >= MAX) finishRec(); }, 1000) };
    r.start(500);
  }
  function finishRec() {
    if (!rec || rec.r.state !== 'recording') return;
    clearInterval(rec.t);
    rec.frame = still(video, video.videoWidth, video.videoHeight); // letztes Bild wird das Foto
    rec.r.stop();
  }
  function again() { if (shot?.url) URL.revokeObjectURL(shot.url); shot = null; }

  function fakeCam() { // nur in der Entwicklung
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 960;
    const g = cv.getContext('2d');
    let i = 0;
    const draw = () => {
      const grad = g.createLinearGradient(0, 0, 1280, 960);
      grad.addColorStop(0, kind === 'after' ? '#23a86d' : '#6b6880'); grad.addColorStop(1, kind === 'after' ? '#7c5cff' : '#3d3a52');
      g.fillStyle = grad; g.fillRect(0, 0, 1280, 960);
      g.fillStyle = '#fff'; g.font = 'bold 64px system-ui'; g.fillText('Testkamera ' + (i++ % 100), 80, 160);
      g.beginPath(); g.arc(640 + 300 * Math.sin(i / 10), 520, 80, 0, 7); g.fill();
    };
    draw();
    fakeTimer = setInterval(draw, 100);
    stream = cv.captureStream(15);
    error = '';
  }
</script>

<div class="cam">
  <div class="cap"><span class="tag" class:after={kind === 'after'}>{TAG[kind] || 'VORHER'}{mode === 'video' ? '-Video' : '-Foto'}</span><br />{label}</div>
  <div class="stage">
    {#if shot?.url}
      <video src={shot.url} autoplay loop muted playsinline></video>
    {:else if shot}
      <img src={shot.photo} alt="Aufnahme" />
    {:else if error}
      <div class="msg"><Icon name="camera-off" size={44} /><p>{error}</p></div>
    {:else}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} autoplay playsinline muted></video>
      {#if rec}<div class="recbar"><i></i>{two(Math.floor(secs / 60))}:{two(secs % 60)} / 0:{MAX}</div>{/if}
    {/if}
  </div>
  {#if !shot && !error && canVideo && !rec}
    <div class="modes">
      <button class:on={mode === 'foto'} onclick={() => (mode = 'foto')}><Icon name="camera" size={16} />Foto</button>
      <button class:on={mode === 'video'} onclick={() => (mode = 'video')}><Icon name="video" size={16} />Video</button>
    </div>
  {/if}
  <div class="ctl">
    {#if shot}
      <button class="btn sec" onclick={again}><Icon name="rotate-ccw" size={16} />Nochmal</button>
      <button class="btn ok" onclick={() => close(shot)}><Icon name="check" size={16} />Passt</button>
    {:else if rec}
      <span style="min-width:96px"></span>
      <button class="shutter rec on" aria-label="Aufnahme beenden" onclick={finishRec}><i></i></button>
      <span style="min-width:96px"></span>
    {:else}
      <button class="btn sec" onclick={() => close()}>Abbrechen</button>
      {#if !error}
        {#if mode === 'video'}
          <button class="shutter rec" aria-label="Video aufnehmen" onclick={record}><i></i></button>
        {:else}
          <button class="shutter" aria-label="Foto machen" onclick={snap}></button>
        {/if}
        <span class="row" style="gap:6px">
          {#if torchOk}<button class="btn sec" onclick={lamp} aria-label={torch ? 'Lampe aus' : 'Lampe an'}><Icon name={torch ? 'flashlight' : 'flashlight-off'} /></button>{/if}
          <button class="btn sec" onclick={() => { facing = facing === 'environment' ? 'user' : 'environment'; start(); }} aria-label="Kamera wechseln"><Icon name="switch-camera" /></button>
        </span>
      {/if}
    {/if}
  </div>
</div>
