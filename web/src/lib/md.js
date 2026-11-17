// Kleines Markdown für Claudes Antworten im Chat, ohne Bibliothek und sicher: Erst wird alles maskiert, dann werden
// nur bekannte Muster zu HTML. Kann: Absätze, **fett**, *kursiv*, ~~durch~~, `code`, Codeblöcke ```sprache (mit Kopieren),
// Überschriften, Listen, Zitate, Trennlinien, Tabellen, Links (nur https), @Name (Person mit Emoji), :symbol: (Symbole
// der App), Fotos aus der App ![Text](foto:NAME) und kleine Diagramme: ```balken, ```fortschritt, ```kacheln.

/** Symbole, die Claude mit :name: benutzen darf (stehen hier, damit sie ins Symbol-Sprite kommen). */
export const ICONS = new Set(['flame', 'star', 'trophy', 'crown', 'check', 'x', 'circle-check', 'circle-x', 'sparkles', 'calendar', 'calendar-check',
  'clock', 'timer', 'trash-2', 'recycle', 'shirt', 'utensils', 'chef-hat', 'bath', 'bed', 'sofa', 'brush-cleaning', 'spray-can', 'washing-machine',
  'droplets', 'heart', 'thumbs-up', 'party-popper', 'medal', 'target', 'trending-up', 'trending-down', 'chart-column', 'gift', 'tree-palm', 'house',
  'car', 'dog', 'cat', 'sun', 'moon', 'coffee', 'pizza', 'cooking-pot', 'zap', 'rocket', 'lightbulb', 'triangle-alert', 'info', 'shield-check',
  'hand-heart', 'leaf', 'baby', 'user', 'users', 'smile', 'laugh', 'gamepad-2', 'graduation-cap', 'briefcase', 'dumbbell', 'music', 'bike']);
export const CHARTS = ['balken', 'fortschritt', 'kacheln'];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = n => `<svg class="ic" width="16" height="16" aria-hidden="true"><use href="#i-${n}"/></svg>`;
/** Zahl wie geschrieben: „1.234“ und „3,5“ deutsch, „3.5“ englisch. */
const num = s => { s = String(s); return /,/.test(s) ? +s.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? +s.replace(/\./g, '') : +s; };

/**
 * Eine Zeile (roh) in HTML: maskieren, dann Code, Fotos, Links, Hervorhebungen, Symbole und Personen.
 * ctx: { people: Map(kleiner Name → { name, emoji }), photoOk(name) }
 */
function inline(raw, ctx) {
  const keep = [];
  const hold = html => `\u0001${keep.push(html) - 1}\u0001`;
  let s = String(raw).replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(foto:([a-z0-9-]{8,80})\)/g, (all, alt, name) => (ctx.photoOk?.(name) ? hold(`<button type="button" class="mimg" data-photo="${name}"><img src="/photos/${name}.t.jpg" alt="${alt || 'Foto'}" loading="lazy"></button>`) : ''));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`));
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g, (_, pre, u) => pre + hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u.replace(/^https?:\/\//, '')}</a>`));
  s = s.replace(/\*\*(?=\S)(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>').replace(/~~(?=\S)(.+?)~~/g, '<s>$1</s>');
  s = s.replace(/:([a-z0-9-]{2,30}):/g, (all, n) => (ICONS.has(n) ? icon(n) : all));
  s = s.replace(/(^|[^\w@])@([A-Za-zÄÖÜäöüß]{2,20})/g, (all, pre, n) => { const p = ctx.people?.get(n.toLowerCase()); return p ? `${pre}<span class="mchip">${esc(p.emoji || '🙂')} ${esc(p.name)}</span>` : all; });
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
}

// ---------- Diagramme ----------
/** Zeilen „Bezeichnung: Wert“; eine Zeile „Titel: …“ (oder „# …“) wird zur Überschrift. */
function items(lines) {
  let title = '';
  const list = [];
  // Symbole wie :flame: kurz verstecken, damit nur am echten „Bezeichnung: Wert“ getrennt wird
  const hide = s => s.replace(/:([a-z0-9-]{2,30}):/g, (a, n) => (ICONS.has(n) ? `\u0002${n}\u0002` : a));
  const show = s => s.replace(/\u0002([a-z0-9-]+)\u0002/g, ':$1:');
  for (const l of lines) {
    const t = hide(l.trim());
    if (!t) continue;
    const head = /^(?:#+\s*|titel:\s*)(.+)$/i.exec(t);
    if (head) { title = show(head[1]); continue; }
    const m = /^(.+?):\s+(.+)$/.exec(t);
    if (m) list.push({ label: show(m[1].replace(/^[-*•]\s*/, '')), value: show(m[2]) });
  }
  return { title, list };
}
function chart(kind, lines, ctx) {
  const { title, list } = items(lines);
  const head = title ? `<p class="mviz-t">${inline(title, ctx)}</p>` : '';
  if (kind === 'kacheln') {
    return `<div class="mviz">${head}<div class="mtiles">${list.map(x => `<div class="mtile"><b>${inline(x.value, ctx)}</b><small>${inline(x.label, ctx)}</small></div>`).join('')}</div></div>`;
  }
  if (kind === 'fortschritt') {
    return `<div class="mviz">${head}${list.map(x => {
      const m = /^(-?[\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/.exec(x.value);
      if (!m) return '';
      const v = num(m[1]), g = num(m[2]) || 1, pct = Math.max(0, Math.min(100, (100 * v) / g));
      return `<div class="mbar"><span class="mbar-l">${inline(x.label, ctx)}</span><span class="mbar-t${v >= g ? ' ok' : ''}"><i style="width:${pct.toFixed(1)}%"></i></span><span class="mbar-v">${esc(m[1])}/${esc(m[2])}${m[3] ? ' ' + esc(m[3]) : ''}</span></div>`;
    }).join('')}</div>`;
  }
  // balken: längster Balken = größter Wert
  const rows = list.map(x => { const m = /^(-?[\d.,]+)\s*(.*)$/.exec(x.value); return m ? { ...x, v: num(m[1]), shown: m[1], unit: m[2] } : null; }).filter(Boolean);
  const max = Math.max(1, ...rows.map(r => r.v));
  return `<div class="mviz">${head}${rows.map(r => `<div class="mbar"><span class="mbar-l">${inline(r.label, ctx)}</span><span class="mbar-t"><i style="width:${Math.max(0, (100 * r.v) / max).toFixed(1)}%"></i></span><span class="mbar-v">${esc(r.shown)}${r.unit ? ' ' + esc(r.unit) : ''}</span></div>`).join('')}</div>`;
}

// ---------- Blöcke ----------
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const BLOCK = /^\s*(```|#{1,4}\s|>|[-*•]\s|\d+[.)]\s|(-{3,}|\*{3,})\s*$)/;

export function md(text, ctx = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n'), out = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(l);
    if (fence) {
      const lang = fence[1].toLowerCase(), body = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      if (CHARTS.includes(lang)) out.push(chart(lang, body, ctx));
      else out.push(`<pre class="mcode"><span class="mcode-h">${esc(lang || 'code')}<button type="button" data-copy>Kopieren</button></span><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (l.includes('|') && i + 1 < lines.length && SEP.test(lines[i + 1])) {
      const head = cells(l), rows = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
      out.push(`<div class="mscroll"><table class="mtable"><thead><tr>${head.map(c => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, j) => `<td>${inline(r[j] ?? '', ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const h = /^\s*#{1,4}\s+(.+)$/.exec(l);
    if (h) { out.push(`<p class="mh">${inline(h[1], ctx)}</p>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) {
      const q = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(inline(lines[i].replace(/^\s*>\s?/, ''), ctx));
      out.push(`<blockquote>${q.join('<br>')}</blockquote>`);
      continue;
    }
    const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(l) || ol.test(l)) {
      const re = ul.test(l) ? ul : ol, tag = re === ul ? 'ul' : 'ol', li = [];
      for (; i < lines.length && re.test(lines[i]); i++) li.push(`<li>${inline(lines[i].replace(re, ''), ctx)}</li>`);
      out.push(`<${tag}>${li.join('')}</${tag}>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !BLOCK.test(lines[i]) && !(lines[i].includes('|') && SEP.test(lines[i + 1] || '')); i++) para.push(inline(lines[i], ctx));
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('');
}
