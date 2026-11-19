'use strict';

// The one navigation of the website (since 1.11.0, big idea "One website"): the same tabs on every screen, in the same
// order: Today, Planner, Data, Feeds, Games, Settings. Desk/laptop: narrow icon bar on the left (with the logo that turns on
// minimal mode). Portrait (tall): the same tabs as a dock at the bottom, where the More bar used to be; after 5 minutes
// without mouse or keyboard it goes back to Today by itself. The phone has its own tab bar (phone.js) with the same tabs.
// desk.js turns it on and off: DASH_RAIL.enter(dash, 'desk' | 'tall').
// - Today = the dashboard: closes the open page (via its own button, so the address and the back button are right).
// - Data, Feeds and Games = the existing pages (their top-bar buttons .tb-mydata/.tb-feeds/.tb-games are hidden here).
//   Check-in sits at the top of Data (the tile moves there while the page is open).
// - Planner = the agenda (#calendar) and the to-do list full screen in their own layer, address #agenda; Esc or back = Today.
// - Settings = the settings dialog; Wishes is a tab in it. Focus is a button in the top bar, not a tab.
// - Red dot on Feeds: data/feeds.json has something newer than the last time you opened Feeds (feeds.seen).
window.DASH_RAIL = (() => {
  const { h, store } = DASH;
  const $ = (sel) => document.querySelector(sel);
  let active = false, dash = null;

  const rail = h('nav', 'rail');
  rail.setAttribute('aria-label', 'Pages');
  const ICON = {
    today: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>',
    planner: '<svg viewBox="0 0 24 24"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 9v10h14V9H5zm2 2h4v4H7v-4z"/></svg>',
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
    b.append(h('span', 'rail-lbl', label));
    b.onclick = onClick;
    btns[id] = b;
    return b;
  }
  const logo = h('button', 'rail-logo');
  logo.type = 'button';
  logo.title = 'Minimise';
  logo.setAttribute('aria-label', 'Minimale modus');
  logo.innerHTML = '<img src="favicon.svg" alt="">';
  logo.onclick = () => { const m = $('.tb-min'); if (m) m.click(); };
  // Games: the same icon as its (hidden here) top-bar button
  const copyIcon = (sel) => { const b = $(sel); const svg = b && b.querySelector('svg'); return svg ? svg.outerHTML : ''; };
  ICON.games = copyIcon('.tb-games');
  const top = h('div', 'rail-top');
  top.append(logo, item('today', 'Today', () => go('today')), item('planner', 'Planner', () => go('planner')),
    item('mydata', 'Data', () => go('mydata')), item('feeds', 'Feeds', () => go('feeds')),
    item('games', 'Games', () => go('games')));
  const dot = h('i', 'rail-dot');
  dot.hidden = true;
  btns.feeds.append(dot);
  rail.append(top, item('settings', 'Settings', () => { const s = $('.tb-settings'); if (s) s.click(); }));

  // ---------- Which page is open ----------
  const PAGES = { feeds: ['feeds-open', '.tb-feeds'], mydata: ['mydata-open', '.tb-mydata'], games: ['games-open', '.tb-games'] };
  function current() {
    if (document.body.classList.contains('agenda-open')) return 'planner';
    for (const [id, [cls]] of Object.entries(PAGES)) if (document.body.classList.contains(cls)) return id;
    return 'today';
  }
  function mark() {
    const cur = current();
    for (const [id, b] of Object.entries(btns)) if (id !== 'settings') b.setAttribute('aria-current', id === cur ? 'page' : 'false');
    // Settings open: the same state as its top-bar button
    const st = $('.tb-settings');
    btns.settings.setAttribute('aria-pressed', st ? st.getAttribute('aria-pressed') || 'false' : 'false');
    if (cur === 'feeds') seen();
    checkinHome(cur === 'mydata');
  }
  let idleStamp = Date.now();
  function go(id) {
    const cur = current();
    if (id === cur) return;
    idleStamp = Date.now();
    if (id === 'today') {
      if (cur === 'planner') return setAgenda(false);
      const p = PAGES[cur];
      if (p && $(p[1])) $(p[1]).click();   // own button: closes and sets the address right
      return;
    }
    if (id === 'planner') return setAgenda(true);
    if (cur === 'planner') {
      setAgenda(false, true);
      if (location.hash === '#agenda') history.replaceState(null, '', location.pathname + location.search);   // else "back" from the page would reopen the planner
      pushed = false;
    }
    const p = PAGES[id];
    if (p && $(p[1])) $(p[1]).click();
  }

  // ---------- Agenda as its own layer ----------
  const layer = h('section', 'ag-layer');
  layer.setAttribute('aria-label', 'Planner');
  layer.hidden = true;
  let calHome = null, moved = [], pushed = false;
  const placeLayer = () => {
    const bar = $('#topbar');
    if (bar) layer.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 10)}px`;
  };
  function setAgenda(open, fromHash) {
    if (!active) return;
    const cal = document.getElementById('w-day');
    if (open === !layer.hidden || !cal) return;
    if (open) {
      window.dispatchEvent(new CustomEvent('dash:page', { detail: 'agenda' }));
      layer.hidden = false;
      moved = [];
      const day = document.getElementById('w-day');
      const side = h('div', 'ag-side');
      layer.append(side);
      for (const [id, target] of [['w-day', layer], ['w-todo', side], ['w-rhythm', side]]) {
        const el = document.getElementById(id);
        if (!el) continue;
        moved.push({ el, parent: el.parentElement, next: el.nextSibling, wasHidden: el.hidden });
        el.hidden = false;
        target.append(el);
      }
      layer.prepend(...[day].filter(Boolean));
      document.body.classList.add('agenda-open');
      placeLayer();
      if (!fromHash && location.hash !== '#agenda') {
        if (['#feeds', '#mydata', '#games'].includes(location.hash)) history.replaceState(null, '', '#agenda');
        else { history.pushState(null, '', '#agenda'); pushed = true; }
      }
    } else {
      for (const m of moved.reverse()) {
        if (m.parent) m.parent.insertBefore(m.el, m.next && m.next.parentElement === m.parent ? m.next : null);
        m.el.hidden = m.wasHidden;
      }
      moved = [];
      layer.querySelector('.ag-side')?.remove();
      layer.hidden = true;
      document.body.classList.remove('agenda-open');
      if (!fromHash && location.hash === '#agenda') {
        if (pushed) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
      }
      pushed = false;
    }
    window.dispatchEvent(new Event('resize'));   // fit the week grid again
    mark();
  }
  window.addEventListener('dash:page', (e) => { if (e.detail !== 'agenda' && active && !layer.hidden) setAgenda(false, true); });
  window.addEventListener('popstate', () => { if (active) setAgenda(location.hash === '#agenda', true); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active && !layer.hidden && !document.querySelector('dialog[open]') && document.activeElement.tagName !== 'INPUT') setAgenda(false);
  });
  window.addEventListener('resize', () => { if (active && !layer.hidden) placeLayer(); });

  // ---------- Check-in on the Data page ----------
  // The tile keeps loading in the parked box; while Data is open it sits in a slot under the page header.
  let ciHome = null;
  function checkinHome(onData) {
    const ci = document.getElementById('w-checkin');
    if (!ci) return;
    if (onData && active) {
      const page = $('.md-page'), head = page && page.querySelector('.md-head');
      if (!page) return;
      let slot = page.querySelector('.md-checkin');
      if (!slot) { slot = h('div', 'md-checkin'); head ? head.after(slot) : page.prepend(slot); }
      if (ci.parentElement !== slot) {
        if (!ciHome) ciHome = { parent: ci.parentElement, next: ci.nextSibling };
        slot.append(ci);
      }
    } else if (ciHome) {
      const { parent, next } = ciHome;
      ciHome = null;
      if (parent) parent.insertBefore(ci, next && next.parentElement === parent ? next : null);
    }
  }

  // ---------- Wishes: a tab in Settings ----------
  let wishesEl = null, wishesHome = null;
  if (window.DASH_SETTINGS) DASH_SETTINGS.add({ id: 'wishes', label: 'Wishes', order: 60, render(el) {
    wishesEl = wishesEl || document.getElementById('w-wishes');
    if (wishesEl && !wishesHome) wishesHome = { parent: wishesEl.parentElement, next: wishesEl.nextSibling };
    if (wishesEl && !wishesEl.hidden) { el.append(wishesEl); return; }
    el.append(h('p', 'w-note', 'The wish list only shows on the PC with the helper running. Add wishes in WISHES.md in Obsidian.'));
  } });

  // ---------- Tall: back to Today after 5 minutes without mouse or keyboard ----------
  let idleTimer = null;
  const bump = () => { idleStamp = Date.now(); };
  function idleCheck() {
    if (!active || mode !== 'tall') return;
    if (Date.now() - idleStamp < 5 * 60 * 1000) return;
    if (document.querySelector('dialog[open]') || document.activeElement?.tagName === 'INPUT') return;
    if (current() !== 'today') go('today');
    idleStamp = Date.now();
  }

  // ---------- Red dot: news since you last opened Feeds ----------
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
      if (!last) store.set('feeds.seen', newest);   // first time: nothing "new"
      dot.hidden = !last || newest <= last || current() === 'feeds';
      btns.feeds.title = dot.hidden ? 'Feeds' : 'Feeds · there\'s something new';
    } catch (e) { console.warn('[zijbalk] feeds', e); }
  }
  DASH.every(10 * 60 * 1000, checkFeeds);

  const watch = new MutationObserver(mark);

  // ---------- On and off (from desk.js) ----------
  let mode = 'desk';
  function enter(d, m) {
    active = true;
    dash = d;
    mode = m || 'desk';
    rail.classList.toggle('dock', mode === 'tall');
    logo.hidden = mode === 'tall';
    const ver = document.getElementById('version');
    if (ver) rail.append(ver);
    document.body.append(rail);
    if (mode === 'tall') {
      for (const ev of ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, bump, { passive: true });
      idleTimer = setInterval(idleCheck, 30 * 1000);
    }
    dash.append(layer);
    watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    for (const sel of ['.tb-settings']) {
      const s = $(sel);
      if (s) watch.observe(s, { attributes: true, attributeFilter: ['aria-pressed'] });
    }
    if (location.hash === '#agenda') setAgenda(true, true);
    mark();
    checkFeeds();
  }
  function leave() {
    if (!layer.hidden) setAgenda(false, true);
    checkinHome(false);
    if (wishesEl && wishesHome && wishesHome.parent) { wishesHome.parent.insertBefore(wishesEl, wishesHome.next && wishesHome.next.parentElement === wishesHome.parent ? wishesHome.next : null); wishesHome = null; }
    for (const ev of ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel']) window.removeEventListener(ev, bump);
    clearInterval(idleTimer);
    active = false;
    watch.disconnect();
    rail.remove();
    layer.remove();
  }
  return { enter, leave };
})();
