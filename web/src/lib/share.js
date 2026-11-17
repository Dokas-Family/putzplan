// Einen Eintrag als Bild teilen: Vorher und Nachher untereinander, Name, Aufgabe, Punkte. Im Handy über das Teilen-Menü,
// am PC als Download. Das Bild entsteht im Handy, es geht nichts an fremde Dienste.
import { mem, mName } from './store.svelte.js';
import { toast } from './ui.svelte.js';

const W = 1080, H = 1350;
async function load(name) {
  const r = await fetch(`/photos/${name}.jpg`);
  if (!r.ok) throw new Error('Foto lässt sich nicht laden');
  return createImageBitmap(await r.blob());
}
/** Bild so zuschneiden, dass es die Fläche ganz füllt (wie object-fit: cover). */
function cover(g, img, x, y, w, h, r) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, r); g.clip();
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  g.restore();
}
function label(g, text, x, y, color) {
  g.font = '800 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const w = g.measureText(text).width + 36;
  g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, 50, 25); g.fill();
  g.fillStyle = '#fff'; g.fillText(text, x + 18, y + 35);
}
function lines(g, text, max) {
  const out = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + word : word;
    if (g.measureText(t).width > max && cur) { out.push(cur); cur = word; } else cur = t;
  }
  if (cur) out.push(cur);
  if (out.length > 2) { out.length = 2; out[1] = out[1].replace(/\s*\S*$/, '') + ' …'; }
  return out;
}

export async function shareEntry(e) {
  if (!e.before_photo || !e.after_photo) throw new Error('Dafür braucht es Vorher- und Nachher-Foto');
  toast('Bild wird gebaut …', 1500);
  const [before, after] = await Promise.all([load(e.before_photo), load(e.after_photo)]);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#7c5cff'); bg.addColorStop(1, '#e5589a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // Kopf: wer und was
  const team = [e.member_id, ...(e.helpers || [])];
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `700 34px ${font}`;
  g.fillText(`${team.map(id => `${mem(id)?.emoji || ''} ${mName(id)}`).join(' & ')} hat geputzt`, 60, 92);
  g.fillStyle = '#fff'; g.font = `800 54px ${font}`;
  const title = lines(g, e.title, W - 120);
  title.forEach((t, i) => g.fillText(t, 60, 162 + i * 62));

  // Fotos untereinander
  const top = 162 + title.length * 62 - 20, ph = (H - top - 170 - 24) / 2;
  cover(g, before, 60, top, W - 120, ph, 28);
  cover(g, after, 60, top + ph + 24, W - 120, ph, 28);
  label(g, 'VORHER', 84, top + 22, 'rgba(0,0,0,.55)');
  label(g, 'NACHHER', 84, top + ph + 46, '#23a86d');

  // Fuß: Punkte, Datum, Dauer
  const d = new Date(e.after_at), mins = Math.max(1, Math.round((d - new Date(e.before_at)) / 60000));
  g.fillStyle = '#fff'; g.font = `800 46px ${font}`;
  g.fillText(`+${e.points} Punkte`, 60, H - 76);
  g.font = `600 30px ${font}`; g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillText(`${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} · ${mins} Min`, 60, H - 34);
  g.textAlign = 'right'; g.font = `800 34px ${font}`; g.fillStyle = '#fff';
  g.fillText('✨ Putzplan', W - 60, H - 52);

  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
  const file = new File([blob], `putzplan-${e.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').slice(0, 30)}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: e.title }); } catch (err) { if (err.name !== 'AbortError') throw err; }
    return;
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Bild ist gespeichert');
}
