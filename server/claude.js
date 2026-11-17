// Claude als System-Konto, aus der Konsole des Servers (im Container):
//   node server/claude.js neu [Anzahl]   zeigt die neuesten erledigten Einträge mit Fotos und Kommentaren
//   node server/claude.js -              liest Kommentare/Reaktionen als JSON von der Eingabe:
//                                        [{ "entry_id": "…", "text": "…" }, { "entry_id": "…", "emoji": "👏" }]
// Geschickt wird über den laufenden Dienst, damit offene Apps es sofort sehen und Benachrichtigungen rausgehen.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { q, getMeta, setMeta } from './db.js';

const [cmd, arg] = process.argv.slice(2);
const name = id => q.get('select name from members where id = ?', id)?.name || id;

if (cmd === 'neu') {
  const rows = q.all("select * from entries where status = 'done' and after_photo is not null order by after_at desc limit ?", +arg || 12);
  for (const e of rows.reverse()) {
    const team = [e.member_id, ...JSON.parse(e.helpers || '[]')].map(name).join(' + ');
    const said = q.all('select member_id, emoji, text from reactions where entry_id = ? order by created_at', e.id).map(r => `${name(r.member_id)}: ${r.text || r.emoji}`);
    console.log(JSON.stringify({ id: e.id, wer: team, aufgabe: e.title, fertig: e.after_at, minuten: Math.round((new Date(e.after_at) - new Date(e.before_at)) / 60000), punkte: e.points, vorher: e.before_photo, nachher: e.after_photo, video: e.after_video || e.before_video || null, reaktionen: said }));
  }
} else if (cmd === '-') {
  let token = getMeta('system_token');
  if (!token) { token = randomBytes(24).toString('base64url'); setMeta('system_token', token); }
  const items = JSON.parse(readFileSync(0, 'utf8'));
  for (const it of items) {
    const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/system/say`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-System-Token': token }, body: JSON.stringify(it) });
    const j = await r.json().catch(() => ({}));
    console.log(r.status, it.entry_id, it.text ? it.text.slice(0, 50) : it.emoji, j.error || '');
  }
} else {
  console.log('Aufruf: node server/claude.js neu [Anzahl] | node server/claude.js - < kommentare.json');
}
