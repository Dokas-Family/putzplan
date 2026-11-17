// Markdown in Claudes Chat-Antworten (web/src/lib/md.js): schön, aber nie eingeschleustes HTML oder Skript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { md } from '../web/src/lib/md.js';

const ctx = { people: new Map([['mia', { name: 'Mia', emoji: '🌸' }]]), photoOk: n => !n.startsWith('c-') };

test('Markdown: Hervorhebungen, Code, Listen, Tabellen, Personen und Symbole', () => {
  const h = md('**fett** *kursiv* `x` :flame: @Mia @Niemand\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```python\nprint(1)\n```', ctx);
  assert.match(h, /<b>fett<\/b> <i>kursiv<\/i> <code>x<\/code> <svg[^>]*><use href="#i-flame"\/><\/svg>/);
  assert.match(h, /<span class="mchip">🌸 Mia<\/span> @Niemand/);
  assert.match(h, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(h, /<th>A<\/th><th>B<\/th>.*<td>1<\/td><td>2<\/td>/);
  assert.match(h, /<pre class="mcode"><span class="mcode-h">python<button type="button" data-copy>Kopieren<\/button><\/span><code>print\(1\)<\/code><\/pre>/);
  assert.match(md('um 21:45 Uhr :unbekannt:', ctx), /um 21:45 Uhr :unbekannt:/);
});

test('Markdown: Diagramme', () => {
  const h = md('```balken\nTitel: Punkte\n@Mia: 40\nFelix: 20 P\n```\n```fortschritt\nIris: 3/10\n```\n```kacheln\n:flame: Serie: 6 Tage\n```', ctx);
  assert.match(h, /<p class="mviz-t">Punkte<\/p>/);
  assert.match(h, /width:100\.0%.*40.*width:50\.0%.*20 P/);
  assert.match(h, /mbar-t"><i style="width:30\.0%"><\/i><\/span><span class="mbar-v">3\/10/);
  assert.match(h, /<div class="mtile"><b>6 Tage<\/b><small><svg[^>]*><use href="#i-flame"\/><\/svg> Serie<\/small><\/div>/);
});

test('Markdown: nichts Gefährliches kommt durch', () => {
  const h = md('<img src=x onerror=alert(1)> <script>x</script> [a](javascript:alert(1)) [b](https://x.de/"onmouseover="alert(1)) ![c](foto:c-0000000000) ![d](foto:../../etc) ```kacheln\n<b>x</b>: <i>y</i>\n```', ctx);
  assert.ok(!/<img src=x|<script|href="javascript|onmouseover="/.test(h), h);
  assert.ok(!h.includes('foto:c-') && !h.includes('/photos/c-'), 'fremde Chat-Fotos bleiben weg');
  assert.match(md('```\n</code><script>alert(1)</script>\n```'), /&lt;\/code&gt;&lt;script&gt;/);
  assert.match(md('| <x> |\n|---|\n| "y" |'), /<th>&lt;x&gt;<\/th>.*<td>&quot;y&quot;<\/td>/);
});
