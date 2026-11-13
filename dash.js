'use strict';

// Shared helpers for the small tiles.
// Every tile runs via DASH.widget(): if something goes wrong in one tile, only that tile shows a message.
window.DASH = (() => {
  const DEMO = new URLSearchParams(location.search).has('demo');

  // Version number at the bottom: the same number as ?v=N after the files in index.html
  const VERSION = (new URL(document.currentScript.src).searchParams.get('v')) || '?';
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('version');
    if (el) el.textContent = `Dashboard version ${VERSION}${DEMO ? ' · demo' : ''}`;
  });

  // ?size: shows how big the window really is (without toolbars), to test at exactly that size
  if (new URLSearchParams(location.search).has('size')) {
    document.addEventListener('DOMContentLoaded', () => {
      const tag = document.createElement('div');
      tag.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;padding:8px 14px;border-radius:12px;background:#f5b02e;color:#111;font:700 15px/1.3 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.5)';
      const show = () => { tag.textContent = `${innerWidth} × ${innerHeight} · scale ${devicePixelRatio} · ${matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'}`; };
      addEventListener('resize', show);
      show();
      document.body.append(tag);
    });
  }

  // ---------- As an app on the phone (since 0.46.3) ----------
  // Service worker (sw.js): always the network first, the cache only offline. A new one per version (sw.js?v=…).
  // Offline: a bar at the top, so you know you're seeing the last loaded version and tiles don't refresh.
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && VERSION !== '?') {
    addEventListener('load', () => navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch((e) => console.warn('[app] service worker', e)));
  }
  function offlineNote() {
    let el = document.getElementById('offline-note');
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-note';
      el.setAttribute('role', 'status');
      el.textContent = 'Offline: you\'re seeing the last loaded version';
      document.body.append(el);
    }
    el.hidden = navigator.onLine;
  }
  addEventListener('online', offlineNote);
  addEventListener('offline', offlineNote);
  document.addEventListener('DOMContentLoaded', () => { if (!navigator.onLine) offlineNote(); });

  // ---------- Loading ----------
  // ?mini=1 (new-tab page): only clock, date and search bar. The rest (Spotify, agenda, tiles) only loads
  // when you open the full dashboard, so a new tab is ready right away. Without ?mini=1 everything loads right away.
  const MINI = new URLSearchParams(location.search).get('mini') === '1';
  let files = null, wanted = false, loaded = false;
  function loadAll() {
    if (loaded) return;
    if (!files) { wanted = true; return; }
    loaded = true;
    // Tiles invisible until motion.js slides them in (otherwise they flash first), with a safety net
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('booting');
      setTimeout(() => document.body.classList.remove('booting'), 3000);
    }
    for (const f of files) {
      const el = document.createElement('script');
      const external = /^https?:/.test(f);
      el.src = external ? f : `${f}?v=${VERSION}`;
      // Own files run in order; the Google login separately (calendar.js waits for it itself)
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

  // Message in a tile with a button (reload, log in again, ...)
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
  // "Link agenda" button for tiles that need Google Calendar
  const connectGoogle = () => (window.DASH_GOOGLE ? window.DASH_GOOGLE.connect() : document.getElementById('cal-connect') && document.getElementById('cal-connect').click());

  // Start a tile. fn(card, body, guard) may be async; guard(fn) protects later callbacks (timers, events).
  function widget(id, fn) {
    const card = document.getElementById(id);
    if (!card) return;
    const body = card.querySelector('.w-body');
    // Failed: a short message with a button, instead of an empty tile
    const fail = (e) => {
      console.error(`[${id}]`, e);
      body.replaceChildren(problem('This tile couldn\'t load. It will try again later.', 'Reload now', () => location.reload()));
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

  // Repeat fn every ms, but not while the tab is in the background (and right away when coming back).
  // Since 0.59.0 also right after sleep or when the internet is back (event dash:wake, see below).
  function every(ms, fn) {
    let last = Date.now();
    setInterval(() => { if (!document.hidden) { last = Date.now(); fn(); } }, ms);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - last > ms) { last = Date.now(); fn(); }
    });
    addEventListener('dash:wake', () => { if (!document.hidden) { last = Date.now(); fn(); } });
  }

  // ---------- Self-recovery (since 0.59.0, 1.0 plan) ----------
  // Waking up: a timer that ticks every 30 s; if suddenly more than 3 minutes passed in between, the PC was asleep.
  // Then (after 8 s, so wifi and the helper are up), and when the internet comes back (after 3 s): event dash:wake,
  // on which every tile refetches right away via every(). Never more than once per 30 s.
  let tickAt = Date.now(), wakeTimer = null, wokeAt = 0;
  function wake(delay) {
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      if (Date.now() - wokeAt < 30000) return;
      wokeAt = Date.now();
      dispatchEvent(new CustomEvent('dash:wake'));
      checkVersion();
    }, delay);
  }
  setInterval(() => {
    const now = Date.now();
    if (now - tickAt > 3 * 60000) wake(8000);
    tickAt = now;
  }, 30000);
  addEventListener('online', () => wake(3000));

  // New version on the site: reload by itself, so a screen that's always on doesn't keep running old code.
  // Every 15 minutes (and after waking up) fetch index.html and compare dash.js's ?v=. Only reload when
  // nobody is using the dashboard: 2 minutes without mouse/keys, no pop-up open and not typing.
  // Once per new version (sessionStorage), so an old copy from a cache doesn't cause a reload loop.
  let lastInput = Date.now();
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  let pendingVersion = null;
  async function checkVersion() {
    if (DEMO || VERSION === '?' || location.protocol === 'file:') return;
    try {
      const res = await fetch(`${location.pathname}?versioncheck=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const m = (await res.text()).match(/dash\.js\?v=([\w.]+)/);
      if (m && m[1] !== VERSION) pendingVersion = m[1];
    } catch {}
    tryReload();
  }
  function tryReload() {
    if (!pendingVersion) return;
    let done = null;
    try { done = sessionStorage.getItem('dash.reloadedFor'); } catch {}
    if (done === pendingVersion) return;
    const busy = Date.now() - lastInput < 2 * 60000 || document.querySelector('dialog[open]')
      || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
    if (busy) return;
    try { sessionStorage.setItem('dash.reloadedFor', pendingVersion); } catch {}
    location.reload();
  }
  setInterval(checkVersion, 15 * 60000);
  setInterval(tryReload, 60000);

  // Appointments from calendar.js
  function onCalendar(fn) {
    window.addEventListener('dash:calendar', (e) => fn(e.detail));
    if (window.DASH_CALENDAR) fn(window.DASH_CALENDAR);
  }

  // ---------- Rain for the next 2 hours (shared by weather, rain alarm and the bike check) ----------
  // First Buienradar (radar, per 5 minutes). If that fails, Open-Meteo per quarter hour (weather model, less precise).
  // Returns { source, updated, slots: [{ start, end, mmh }] } with mmh = precipitation in mm per hour.
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
    // Lines like "087|22:55": value 0-255 and the (Dutch) time
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
    if (slots.length < 6) throw new Error('Buienradar returned no usable data');
    return { source: 'Buienradar', slots };
  }

  async function openMeteoRain() {
    const data = await getJSON('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: HOME.lat, longitude: HOME.lon, minutely_15: 'precipitation', forecast_minutely_15: 12,
      timezone: 'Europe/Amsterdam', timeformat: 'unixtime',
    }));
    const m = data.minutely_15;
    const slots = [];
    // A value at time T is the sum of the quarter hour before it: spread over three 5-minute pieces
    m.time.forEach((t, i) => {
      for (let k = 3; k > 0; k--) slots.push({ start: t * 1000 - k * FIVE, end: t * 1000 - (k - 1) * FIVE, mmh: (m.precipitation[i] || 0) * 4 });
    });
    return { source: 'Open-Meteo', slots };
  }

  // Fetch for real once per 5 minutes, even when several tiles ask at the same time
  function radar() {
    if (radarCache && Date.now() - radarCache.at < FIVE) return radarCache.promise;
    const promise = buienradar()
      .catch((e) => { console.warn('[rain] Buienradar failed, using Open-Meteo:', e); return openMeteoRain(); })
      .then((r) => ({ ...r, updated: Date.now(), slots: r.slots.filter((s) => s.end > Date.now()) }));
    radarCache = { at: Date.now(), promise };
    promise.catch(() => { radarCache = null; });
    return promise;
  }
  const RAIN_MIN = 0.1; // mm per hour: from here it counts as rain

  // ---------- Background color from a cover ----------
  // Average "lively" color → { tint, accent }. The front card in the media stack decides the page color.
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
      return null; // no CORS or something else: keep the default colors
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
  // Remember a source's color; only the front source colors the page
  function tint(owner, colors) { tints[owner] = colors; if (owner === tintOwner) applyTint(); }
  function tintFront(owner) { tintOwner = owner; applyTint(); }

  // ---------- Notifications (widgets/alerts.js shows them) ----------
  // Each tile reports what's going on: DASH.alert('canvas', [{ level, icon, text, sub, onDismiss }]) or DASH.alert('canvas', null).
  // level: 'urgent' (red), 'warn' (orange) or 'info'. onDismiss = a ✕ is added.
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

  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtWeekday = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
  function fmtDay(ms) {
    const diff = Math.round((startOfDay(ms) - startOfDay(Date.now())) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === -1) return 'yesterday';
    return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const dec = (v, d = 1) => v.toFixed(d);   // number with d decimals

  // Image with a color block below it: while it loads (or if it fails) you see the block with text, never a broken icon
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

  // Pop-up panel for a tile (Predict a film, F1 video, ...). color = the tile's accent color.
  function panel(title, color) {
    const dialog = h('dialog', 'panel-dialog');
    if (color) dialog.style.setProperty('--c', color);
    const head = h('div', 'panel-head');
    const close = h('button', 'w-btn ghost', 'Close');
    close.onclick = () => dialog.close();
    head.append(h('b', null, title), close);
    const content = h('div', 'panel-body');
    dialog.append(head, content);
    // Click next to the panel = close
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    return { dialog, head, body: content, open: () => dialog.showModal(), close: () => dialog.close() };
  }

  return { VERSION, DEMO, MINI, boot, loadAll, problem, connectGoogle, coverTint, tint, tintFront, h, store, getJSON, widget, every, onCalendar, HOME, radar, RAIN_MIN, alert, allAlerts, isAH, startOfDay, addDays, startOfWeek, fmtTime, fmtWeekday, fmtDay, dec, img, panel };
})();
