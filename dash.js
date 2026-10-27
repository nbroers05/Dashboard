'use strict';

// Gedeelde hulpjes voor de kleine vakken.
// Elk vak draait via DASH.widget(): gaat er in één vak iets mis, dan toont alleen dát vak een melding.
window.DASH = (() => {
  const DEMO = new URLSearchParams(location.search).has('demo');

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

  // Start een vak. fn(card, body, guard) mag async zijn; guard(fn) beschermt latere callbacks (timers, events).
  function widget(id, fn) {
    const card = document.getElementById(id);
    if (!card) return;
    const body = card.querySelector('.w-body');
    const fail = (e) => {
      console.error(`[${id}]`, e);
      body.replaceChildren(h('p', 'w-note', 'Dit vak kon niet laden. Het probeert het later opnieuw.'));
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

  return { DEMO, h, store, getJSON, widget, every, onCalendar, isAH, startOfDay, addDays, startOfWeek, fmtTime, fmtWeekday, fmtDay, nl };
})();
