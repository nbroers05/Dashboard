'use strict';

// Zijbalk op de pc (alleen in desk, sinds 0.46.0): smalle icoonbalk links met logo, Overzicht, Agenda, Mijn data,
// Feeds en onderaan Instellingen. De tegenhanger van de tabbalk op de telefoon (phone.js). desk.js zet hem aan en uit.
// - Overzicht = het dashboard: sluit de open pagina (via zijn eigen knop, zodat het adres en de terug-knop kloppen).
// - Mijn data en Feeds = de bestaande pagina's (knoppen .tb-mydata/.tb-feeds staan in desk verborgen in de topbalk).
// - Agenda = de gewone agenda (#calendar) schermvullend in een eigen laag, zelfde stijl als Feeds/Mijn data, adres
//   #agenda; Esc of terug = weer het dashboard (de agenda gaat dan terug naar zijn plek in de middelste kolom).
// - Rood puntje bij Feeds: data/feeds.json heeft iets nieuwers dan de laatste keer dat je Feeds opende (feeds.seen).
// Naam als tooltip (title), actief item met een licht vlakje. Minimale modus: balk weg (CSS).
window.DASH_RAIL = (() => {
  const { h, store } = DASH;
  const $ = (sel) => document.querySelector(sel);
  let active = false, dash = null;

  const rail = h('nav', 'rail');
  rail.setAttribute('aria-label', 'Pagina\'s');
  const ICON = {
    overview: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>',
    agenda: '<svg viewBox="0 0 24 24"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 9v10h14V9H5zm2 2h4v4H7v-4z"/></svg>',
    mydata: '<svg viewBox="0 0 24 24"><path d="M5 13h3v7H5v-7zm5.5-5h3v12h-3V8zM16 3h3v17h-3V3z"/></svg>',
    feeds: '<svg viewBox="0 0 24 24"><path d="M4 4h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4zm15 4h2v10a2 2 0 0 1-2 2V8zM7 7v3h7V7H7zm0 5v2h7v-2H7zm0 4v2h7v-2H7z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54a7.4 7.4 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>',
  };
  const btns = {};
  function item(id, label, onClick) {
    const b = h('button', 'rail-btn');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = ICON[id];
    b.onclick = onClick;
    btns[id] = b;
    return b;
  }
  const logo = h('button', 'rail-logo');
  logo.type = 'button';
  logo.title = 'Overzicht';
  logo.setAttribute('aria-label', 'Overzicht');
  logo.innerHTML = '<img src="favicon.svg" alt="">';
  logo.onclick = () => go('overview');
  const top = h('div', 'rail-top');
  top.append(logo, item('overview', 'Overzicht', () => go('overview')), item('agenda', 'Agenda', () => go('agenda')),
    item('mydata', 'Mijn data', () => go('mydata')), item('feeds', 'Feeds', () => go('feeds')));
  const dot = h('i', 'rail-dot');
  dot.hidden = true;
  btns.feeds.append(dot);
  rail.append(top, item('settings', 'Instellingen', () => { const s = $('.tb-settings'); if (s) s.click(); }));

  // ---------- Welke pagina is open ----------
  const PAGES = { feeds: ['feeds-open', '.tb-feeds'], mydata: ['mydata-open', '.tb-mydata'], games: ['games-open', '.tb-games'] };
  function current() {
    if (document.body.classList.contains('agenda-open')) return 'agenda';
    for (const [id, [cls]] of Object.entries(PAGES)) if (document.body.classList.contains(cls)) return id;
    return 'overview';
  }
  function mark() {
    const cur = current();
    for (const [id, b] of Object.entries(btns)) if (id !== 'settings') b.setAttribute('aria-current', id === cur ? 'page' : 'false');
    const s = $('.tb-settings');
    btns.settings.setAttribute('aria-pressed', s ? s.getAttribute('aria-pressed') || 'false' : 'false');
    if (cur === 'feeds') seen();
  }
  function go(id) {
    const cur = current();
    if (id === cur) return;
    if (id === 'overview') {
      if (cur === 'agenda') return setAgenda(false);
      const p = PAGES[cur];
      if (p && $(p[1])) $(p[1]).click();   // eigen knop: sluit en zet het adres goed
      return;
    }
    if (id === 'agenda') return setAgenda(true);
    if (cur === 'agenda') setAgenda(false, true);
    const p = PAGES[id];
    if (p && $(p[1])) $(p[1]).click();
  }

  // ---------- Agenda als eigen laag ----------
  const layer = h('section', 'ag-layer');
  layer.setAttribute('aria-label', 'Agenda');
  layer.hidden = true;
  let calHome = null, pushed = false;
  const placeLayer = () => {
    const bar = $('#topbar');
    if (bar) layer.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 10)}px`;
  };
  function setAgenda(open, fromHash) {
    if (!active) return;
    const cal = document.getElementById('calendar');
    if (open === !layer.hidden || !cal) return;
    if (open) {
      window.dispatchEvent(new CustomEvent('dash:page', { detail: 'agenda' }));
      calHome = { parent: cal.parentElement, next: cal.nextSibling };
      layer.hidden = false;
      layer.append(cal);
      document.body.classList.add('agenda-open');
      placeLayer();
      if (!fromHash && location.hash !== '#agenda') {
        if (['#feeds', '#mydata', '#games'].includes(location.hash)) history.replaceState(null, '', '#agenda');
        else { history.pushState(null, '', '#agenda'); pushed = true; }
      }
    } else {
      if (calHome && calHome.parent) calHome.parent.insertBefore(cal, calHome.next && calHome.next.parentElement === calHome.parent ? calHome.next : null);
      layer.hidden = true;
      document.body.classList.remove('agenda-open');
      if (!fromHash && location.hash === '#agenda') {
        if (pushed) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
      }
      pushed = false;
    }
    window.dispatchEvent(new Event('resize'));   // weekraster opnieuw passend maken
    mark();
  }
  window.addEventListener('dash:page', (e) => { if (e.detail !== 'agenda' && active && !layer.hidden) setAgenda(false, true); });
  window.addEventListener('popstate', () => { if (active) setAgenda(location.hash === '#agenda', true); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active && !layer.hidden && !document.querySelector('dialog[open]') && document.activeElement.tagName !== 'INPUT') setAgenda(false);
  });
  window.addEventListener('resize', () => { if (active && !layer.hidden) placeLayer(); });

  // ---------- Rood puntje: nieuws sinds je Feeds voor het laatst opende ----------
  let newest = null;
  function seen() {
    if (newest) store.set('feeds.seen', newest);
    dot.hidden = true;
  }
  async function checkFeeds() {
    if (!active) return;
    try {
      const d = await DASH.getJSON(`data/feeds.json?t=${Math.floor(Date.now() / 600000)}`);
      const times = [...(d.news || []), ...(d.film || [])].flatMap((s) => (s.items || []).map((it) => it.time))
        .concat(((d.youtube || {}).videos || []).map((v) => v.time)).filter(Boolean).map((t) => new Date(t).toISOString()).sort();
      newest = times[times.length - 1] || null;
      if (!newest) return;
      const last = store.get('feeds.seen');
      if (!last) store.set('feeds.seen', newest);   // eerste keer: niets "nieuw"
      dot.hidden = !last || newest <= last || current() === 'feeds';
      btns.feeds.title = dot.hidden ? 'Feeds' : 'Feeds · er is iets nieuws';
    } catch (e) { console.warn('[zijbalk] feeds', e); }
  }
  DASH.every(10 * 60 * 1000, checkFeeds);

  const watch = new MutationObserver(mark);

  // ---------- Aan en uit (vanuit desk.js) ----------
  function enter(d) {
    active = true;
    dash = d;
    document.body.append(rail);
    dash.append(layer);
    watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const s = $('.tb-settings');
    if (s) watch.observe(s, { attributes: true, attributeFilter: ['aria-pressed'] });
    if (location.hash === '#agenda') setAgenda(true, true);
    mark();
    checkFeeds();
  }
  function leave() {
    if (!layer.hidden) setAgenda(false, true);
    active = false;
    watch.disconnect();
    rail.remove();
    layer.remove();
  }
  return { enter, leave };
})();
