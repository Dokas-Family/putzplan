import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { boot } from './lib/store.svelte.js';

mount(App, { target: document.getElementById('app') });

// iPhone: kein versehentliches Zoomen mit zwei Fingern. In der Großansicht von Fotos bleibt es erlaubt.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => { if (!e.target.closest?.('.zoom')) e.preventDefault(); }, { passive: false });
boot();
if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
