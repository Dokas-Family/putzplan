<script>
  // So funktioniert der Putzplan: die Regeln in kurz, passend zu dem, was gerade eingestellt ist.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G } from '../lib/store.svelte.js';
  let { close } = $props();
  const plan = $derived(!!S.settings.dienste);
</script>

<Head title="So funktioniert's" {close} />
<div class="help">
  {#if plan}
    <div class="hrow"><span class="tile c-brand"><Icon name="calendar-check" /></span><p><b>Dienste</b>Jeden Morgen verteilt der Putzplan die großen Aufgaben fair auf alle, die da sind. Jeder ist mal dran, auch mit Küche, Bad und Müll. Wer zuletzt viel gemacht hat, bekommt etwas weniger. Deine stehen unter „Heute“ ganz oben.</p></div>
    <div class="hrow"><span class="tile c-ok"><Icon name="flame" /></span><p><b>Tag geschafft</b>Alle deine Dienste erledigt? Dann ist dein Tag geschafft und deine Serie wächst. Tage ohne Dienste brechen die Serie nicht.</p></div>
    {#if S.settings.extras_sperre}
      <div class="hrow"><span class="tile c-warn"><Icon name="lock" /></span><p><b>Erst Dienste, dann Extras</b>Kleinkram wie Decken richten oder Schuhe hinstellen ist Extra. Das bringt Punkte obendrauf, geht aber erst, wenn deine Dienste erledigt sind.</p></div>
    {:else}
      <div class="hrow"><span class="tile c-warn"><Icon name="sparkles" /></span><p><b>Extras</b>Kleinkram wie Decken richten oder Schuhe hinstellen ist Extra und bringt Punkte obendrauf.</p></div>
    {/if}
  {:else}
    <div class="hrow"><span class="tile c-brand"><Icon name="target" /></span><p><b>Tagesziel</b>Jeden Tag gibt es ein Ziel in Punkten. Such dir Aufgaben aus, bis es geschafft ist.</p></div>
  {/if}
  <div class="hrow"><span class="tile c-info"><Icon name="camera" /></span><p><b>Vorher, putzen, Nachher</b>Start macht das Vorher-Foto, Fertig das Nachher-Foto. Statt Foto geht auch ein kurzes Video. Mit „Mithelfen“ teilt ihr euch die Punkte.</p></div>
  <div class="hrow"><span class="tile c-warn"><Icon name="trophy" /></span><p><b>Punkte</b>Jede Aufgabe hat Punkte. Belohnungen geben welche dazu, Abmahnungen ziehen welche ab. „Heute“, „Woche“ und „Monat“ zählen überall gleich. Wer am Sonntagabend die meisten Wochenpunkte hat, regiert die nächste Woche und darf sich einen freien Tag aussuchen.</p></div>
  <div class="hrow"><span class="tile c-bad"><Icon name="heart" /></span><p><b>Fotos</b>Doppelt auf ein Foto tippen gibt ein Herz. Eine Reaktion gedrückt halten zeigt, wer sie gegeben hat. Eigene Einträge lassen sich als Bild teilen.</p></div>
  <div class="hrow"><span class="tile c-brand"><Icon name="sparkles" /></span><p><b>Claude</b>Kommentare mit dem Abzeichen „System“ schreibt Claude, eine KI. Claude sieht sich die Fotos an, lobt und gibt Tipps. Antworte auf Claude oder schreib „Claude“ in deinen Kommentar, dann antwortet Claude dir.</p></div>
  {#if G.admin}<p class="hint">Admins stellen unter Verwaltung › Regeln ein, ob es den Dienstplan gibt und ob Extras bis nach den Diensten warten. Ob eine Aufgabe Dienst oder Extra ist, steht bei der Aufgabe.</p>{/if}
</div>
<button class="btn wide" style="margin-top:12px" onclick={() => close()}>Alles klar</button>

<style>
  .help { display: grid; gap: 12px; }
  .hrow { display: flex; gap: 12px; align-items: flex-start; }
  .hrow p { margin: 0; font-size: 14px; color: var(--muted); }
  .hrow b { display: block; color: var(--ink); font-size: 15px; margin-bottom: 1px; }
</style>
