'use strict';

// Gedeelde hulpjes voor de kleine vakken.
// Elk vak draait via DASH.widget(): gaat er in één vak iets mis, dan toont alleen dát vak een melding.
window.DASH = (() => {
  const DEMO = new URLSearchParams(location.search).has('demo');

  // Versienummer onderaan: hetzelfde getal als ?v=N achter de bestanden in index.html
  const VERSION = (new URL(document.currentScript.src).searchParams.get('v')) || '?';
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('version');
    if (el) el.textContent = `Dashboard versie ${VERSION}${DEMO ? ' · demo' : ''}`;
  });

  // ?maat: laat zien hoe groot het venster echt is (zonder werkbalken), om op precies die maat te testen
  if (new URLSearchParams(location.search).has('maat')) {
    document.addEventListener('DOMContentLoaded', () => {
      const tag = document.createElement('div');
      tag.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;padding:8px 14px;border-radius:12px;background:#f5b02e;color:#111;font:700 15px/1.3 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.5)';
      const show = () => { tag.textContent = `${innerWidth} × ${innerHeight} · schaal ${devicePixelRatio} · ${matchMedia('(orientation: portrait)').matches ? 'staand' : 'liggend'}`; };
      addEventListener('resize', show);
      show();
      document.body.append(tag);
    });
  }

  // ---------- Laden ----------
  // ?mini=1 (nieuwe-tabpagina): alleen klok, datum en zoekbalk. De rest (Spotify, agenda, vakken) laadt pas
  // als je het volledige dashboard opent, zodat een nieuw tabblad meteen klaar is. Zonder ?mini=1 laadt alles meteen.
  const MINI = new URLSearchParams(location.search).get('mini') === '1';
  let files = null, wanted = false, loaded = false;
  function loadAll() {
    if (loaded) return;
    if (!files) { wanted = true; return; }
    loaded = true;
    // Vakken onzichtbaar tot motion.js ze laat inschuiven (anders flitsen ze eerst even), met een vangnet
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('booting');
      setTimeout(() => document.body.classList.remove('booting'), 3000);
    }
    for (const f of files) {
      const el = document.createElement('script');
      const external = /^https?:/.test(f);
      el.src = external ? f : `${f}?v=${VERSION}`;
      // Eigen bestanden in volgorde uitvoeren; Google-login los erbij (calendar.js wacht er zelf op)
      el.async = external;
      document.body.append(el);
    }
  }
  function boot(list) {
    files = list;
    if (!MINI || wanted) loadAll();
  }

  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  async function getJSON(url, timeout = 12000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Melding in een vak met een knop (herladen, opnieuw inloggen, ...)
  function problem(text, label, onClick) {
    const box = h('div', 'w-empty w-problem');
    box.append(h('p', null, text));
    if (label) {
      const b = h('button', 'w-btn', label);
      b.type = 'button';
      b.onclick = onClick;
      box.append(b);
    }
    return box;
  }
  // Knop "Agenda koppelen" voor vakken die de Google Agenda nodig hebben
  const connectGoogle = () => (window.DASH_GOOGLE ? window.DASH_GOOGLE.connect() : document.getElementById('cal-connect') && document.getElementById('cal-connect').click());

  // Start een vak. fn(card, body, guard) mag async zijn; guard(fn) beschermt latere callbacks (timers, events).
  function widget(id, fn) {
    const card = document.getElementById(id);
    if (!card) return;
    const body = card.querySelector('.w-body');
    // Mislukt: korte melding met een knop, in plaats van een leeg vak
    const fail = (e) => {
      console.error(`[${id}]`, e);
      body.replaceChildren(problem('Dit vak kon niet laden. Het probeert het later opnieuw.', 'Nu herladen', () => location.reload()));
    };
    const guard = (f) => (...args) => {
      try {
        const r = f(...args);
        if (r && typeof r.catch === 'function') r.catch(fail);
      } catch (e) {
        fail(e);
      }
    };
    guard(fn)(card, body, guard);
  }

  // Herhaal fn elke ms, maar niet als het tabblad op de achtergrond staat (en direct bij terugkomen)
  function every(ms, fn) {
    let last = Date.now();
    setInterval(() => { if (!document.hidden) { last = Date.now(); fn(); } }, ms);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - last > ms) { last = Date.now(); fn(); }
    });
  }

  // Afspraken uit calendar.js
  function onCalendar(fn) {
    window.addEventListener('dash:calendar', (e) => fn(e.detail));
    if (window.DASH_CALENDAR) fn(window.DASH_CALENDAR);
  }

  // ---------- Regen voor de komende 2 uur (gedeeld door weer, buienalarm en de fietscheck) ----------
  // Eerst Buienradar (radar, per 5 minuten). Lukt dat niet, dan Open-Meteo per kwartier (weermodel, minder precies).
  // Geeft { source, updated, slots: [{ start, end, mmh }] } met mmh = neerslag in mm per uur.
  const HOME = { lat: 51.9225, lon: 4.4792 }; // Rotterdam
  const FIVE = 5 * 60000;
  let radarCache = null;

  async function buienradar() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let text;
    try {
      const res = await fetch(`https://gpsgadget.buienradar.nl/data/raintext?lat=${HOME.lat.toFixed(2)}&lon=${HOME.lon.toFixed(2)}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
    // Regels als "087|22:55": waarde 0-255 en de (Nederlandse) tijd
    const now = Date.now();
    const slots = [];
    let prev = null;
    for (const line of text.trim().split(/\r?\n/)) {
      const m = line.match(/^(\d+)\|(\d{1,2}):(\d{2})/);
      if (!m) continue;
      const d = new Date(now);
      d.setHours(Number(m[2]), Number(m[3]), 0, 0);
      let t = d.getTime();
      if (prev == null) {
        if (t - now > 12 * 3600000) t -= 86400000; // rond middernacht
        if (now - t > 12 * 3600000) t += 86400000;
      } else {
        while (t <= prev) t += 86400000;
      }
      prev = t;
      const v = Number(m[1]);
      slots.push({ start: t, end: t + FIVE, mmh: v ? 10 ** ((v - 109) / 32) : 0 });
    }
    if (slots.length < 6) throw new Error('Buienradar gaf geen bruikbare data');
    return { source: 'Buienradar', slots };
  }

  async function openMeteoRain() {
    const data = await getJSON('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: HOME.lat, longitude: HOME.lon, minutely_15: 'precipitation', forecast_minutely_15: 12,
      timezone: 'Europe/Amsterdam', timeformat: 'unixtime',
    }));
    const m = data.minutely_15;
    const slots = [];
    // Een waarde op tijd T is de som van het kwartier dáárvoor: verdelen over drie stukjes van 5 minuten
    m.time.forEach((t, i) => {
      for (let k = 3; k > 0; k--) slots.push({ start: t * 1000 - k * FIVE, end: t * 1000 - (k - 1) * FIVE, mmh: (m.precipitation[i] || 0) * 4 });
    });
    return { source: 'Open-Meteo', slots };
  }

  // Eén keer per 5 minuten echt ophalen, ook als meerdere vakken tegelijk vragen
  function radar() {
    if (radarCache && Date.now() - radarCache.at < FIVE) return radarCache.promise;
    const promise = buienradar()
      .catch((e) => { console.warn('[regen] Buienradar lukt niet, Open-Meteo gebruikt:', e); return openMeteoRain(); })
      .then((r) => ({ ...r, updated: Date.now(), slots: r.slots.filter((s) => s.end > Date.now()) }));
    radarCache = { at: Date.now(), promise };
    promise.catch(() => { radarCache = null; });
    return promise;
  }
  const RAIN_MIN = 0.1; // mm per uur: vanaf hier telt het als regen

  // ---------- Achtergrondkleur uit een hoes ----------
  // Gemiddelde "levendige" kleur → { tint, accent }. De kaart die vooraan staat in de mediastapel bepaalt de kleur van de pagina.
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hue;
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    return [Math.round(hue * 60), s, l];
  }
  function coverTint(img) {
    try {
      const size = 32;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      const px = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < px.length; i += 4) {
        const max = Math.max(px[i], px[i + 1], px[i + 2]);
        const min = Math.min(px[i], px[i + 1], px[i + 2]);
        const sat = max ? (max - min) / max : 0;
        const light = (max + min) / 510;
        const weight = 0.03 + sat * sat * (1 - Math.abs(light - 0.5) * 1.6);
        r += px[i] * weight; g += px[i + 1] * weight; b += px[i + 2] * weight; w += weight;
      }
      const [hue, s] = rgbToHsl(r / w, g / w, b / w);
      return s < 0.12
        ? { tint: `hsl(${hue} 6% 26%)`, accent: 'hsl(0 0% 92%)' }
        : { tint: `hsl(${hue} ${Math.round(Math.min(s, 0.7) * 100)}% 30%)`, accent: `hsl(${hue} ${Math.round(Math.max(0.45, Math.min(s, 0.85)) * 100)}% 66%)` };
    } catch {
      return null; // geen CORS of iets anders: standaardkleuren houden
    }
  }
  const tints = {};
  let tintOwner = 'spotify';
  function applyTint() {
    const t = tints[tintOwner];
    if (!t) return;
    document.documentElement.style.setProperty('--tint', t.tint);
    document.documentElement.style.setProperty('--accent', t.accent);
  }
  // Kleur van een bron onthouden; alleen de bron vooraan kleurt de pagina
  function tint(owner, colors) { tints[owner] = colors; if (owner === tintOwner) applyTint(); }
  function tintFront(owner) { tintOwner = owner; applyTint(); }

  // ---------- Meldingen (widgets/alerts.js toont ze) ----------
  // Elk vak meldt zelf wat er speelt: DASH.alert('canvas', [{ level, icon, text, sub, onDismiss }]) of DASH.alert('canvas', null).
  // level: 'urgent' (rood), 'warn' (oranje) of 'info'. onDismiss = er komt een ✕ bij.
  const alerts = new Map();
  function alert(key, list) {
    if (!list || (Array.isArray(list) && !list.length)) alerts.delete(key);
    else alerts.set(key, Array.isArray(list) ? list : [list]);
    window.dispatchEvent(new CustomEvent('dash:alerts'));
  }
  const allAlerts = () => [...alerts.values()].flat();

  const AH = /\bAH\b/;
  const isAH = (ev) => !ev.allDay && AH.test(ev.title || '');

  function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  function startOfWeek(ms) { const t = startOfDay(ms); return addDays(t, -((new Date(t).getDay() + 6) % 7)); }

  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const fmtWeekday = (ms) => new Date(ms).toLocaleDateString('nl-NL', { weekday: 'short' });
  function fmtDay(ms) {
    const diff = Math.round((startOfDay(ms) - startOfDay(Date.now())) / 86400000);
    if (diff === 0) return 'vandaag';
    if (diff === 1) return 'morgen';
    if (diff === -1) return 'gisteren';
    return new Date(ms).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const nl = (v, d = 1) => v.toFixed(d).replace('.', ',');

  // Plaatje met kleurvlak eronder: zolang het laadt (of als het mislukt) zie je het vlak met tekst, nooit een kapot icoon
  function img(src, cls, fallbackText, color) {
    const box = h('div', `img-box ${cls || ''}`.trim());
    if (color) box.style.setProperty('--fb', color);
    if (fallbackText) box.append(h('span', 'fb', fallbackText));
    if (src) {
      const i = new Image();
      i.alt = '';
      i.decoding = 'async';
      i.onload = () => i.classList.add('loaded');
      i.onerror = () => i.remove();
      i.src = src;
      box.append(i);
    }
    return box;
  }

  // Pop-up-paneel voor een vak (Voorspel een film, F1-video, ...). color = accentkleur van het vak.
  function panel(title, color) {
    const dialog = h('dialog', 'panel-dialog');
    if (color) dialog.style.setProperty('--c', color);
    const head = h('div', 'panel-head');
    const close = h('button', 'w-btn ghost', 'Sluiten');
    close.onclick = () => dialog.close();
    head.append(h('b', null, title), close);
    const content = h('div', 'panel-body');
    dialog.append(head, content);
    // Klik naast het paneel = sluiten
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    return { dialog, head, body: content, open: () => dialog.showModal(), close: () => dialog.close() };
  }

  return { VERSION, DEMO, MINI, boot, loadAll, problem, connectGoogle, coverTint, tint, tintFront, h, store, getJSON, widget, every, onCalendar, HOME, radar, RAIN_MIN, alert, allAlerts, isAH, startOfDay, addDays, startOfWeek, fmtTime, fmtWeekday, fmtDay, nl, img, panel };
})();
