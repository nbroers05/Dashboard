'use strict';

// The three layouts. The tiles themselves stay the same; this script only moves them, and puts them back exactly when
// another layout applies. ("Arrange" with layout.js doesn't exist anymore since 0.45.0.)
//
// desk: a wide landscape screen (from 1280px, landscape), with the sidebar from rail.js. Everything on one screen: top bar, three columns
//       (left weather+rain alarm, notifications, AH; middle player and agenda; right Canvas, F1, Episodes, film/last
//       watched/friends with tabs) and at the bottom a "More" bar with mail, to-do, steps and Spotify month that folds up.
// tall: portrait screen (wider than 700px, not desk), the "new" portrait design: player, row weather/F1/AH (the rain alarm
//       is in the weather tile), row Canvas/notifications, one rotating tile (last watched, film, Episodes, health),
//       agenda, and a "More" bar with to-do. (The old portrait design and the toggle button are gone since 0.44.11.)
// phone: phone (up to 700px), tab bar with Today/Agenda/Media/Data; most of it is in phone.js (DASH_PHONE).
(() => {
  const { h, store } = DASH;
  const dash = document.querySelector('.dashboard');
  if (!dash) return;
  const deskMq = window.matchMedia('(min-width: 1280px) and (orientation: landscape)');
  const wideMq = window.matchMedia('(min-width: 701px)');
  const $ = (id) => document.getElementById(id);

  // ---------- Gedeelde bouwstenen ----------
  // Weather and rain alarm in one tile
  const weather = h('div', 'desk-weather');

  // "More": a thin bar at the bottom, folds up
  const more = h('div', 'desk-more');
  const moreBar = h('button', 'desk-more-bar');
  moreBar.type = 'button';
  moreBar.setAttribute('aria-expanded', 'false');
  const moreList = h('span', 'desk-more-list');
  moreBar.append(h('span', 'desk-more-label', 'More'), moreList, h('span', 'desk-more-chev', '▲'));
  const drawer = h('div', 'desk-drawer');
  more.append(drawer, moreBar);
  function setMore(open) {
    more.classList.toggle('open', open);
    moreBar.setAttribute('aria-expanded', open);
  }
  moreBar.onclick = () => setMore(!more.classList.contains('open'));

  // ---------- desk: drie kolommen ----------
  const left = h('div', 'desk-col desk-left');
  const mid = h('div', 'desk-col desk-mid');
  const right = h('div', 'desk-col desk-right');

  // Film tonight / Last watched with tabs
  const TAB_KEY = 'desk.tab';
  const tabs = h('div', 'desk-tabs');
  const tabBar = h('div', 'desk-tabbar');
  tabBar.setAttribute('role', 'tablist');
  const TABS = [['w-stars', 'Film tonight'], ['w-letterboxd', 'Last watched'], ['w-friends', 'Friends']];
  const tabBtns = TABS.map(([id, label]) => {
    const b = h('button', null, label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.onclick = () => setTab(id);
    return b;
  });
  tabBar.append(...tabBtns);
  tabs.append(tabBar);
  function setTab(id) {
    store.set(TAB_KEY, id);
    TABS.forEach(([tid], i) => {
      const on = tid === id;
      tabBtns[i].setAttribute('aria-selected', on);
      if ($(tid)) $(tid).hidden = !on;
    });
  }

  // ---------- tall: rows and the rotating tile ----------
  const row3 = h('div', 'tall-row tall-3');
  // Canvas · Notifications · Health (since 0.59.0): equally wide columns; Canvas without open deadlines drops out (tall-auto)
  const row2 = h('div', 'tall-row tall-auto');
  const hidden = h('div', 'tall-hidden');   // the mail tile keeps loading (for the number on the Gmail icon), but without a tile
  const rot = h('div', 'tall-rot');
  const dots = h('div', 'tall-dots');
  // Arrows left and right: click through the parts yourself (after that 30 s no automatic advance)
  const arrow = (cls, label, text) => { const b = h('button', `tall-arrow ${cls}`, text); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; return b; };
  const prevBtn = arrow('prev', 'Previous', '‹'), nextBtn = arrow('next', 'Next', '›');
  const nav = h('div', 'tall-nav');
  nav.append(prevBtn, dots, nextBtn);
  rot.append(nav);
  const ROT = ['w-letterboxd', 'w-memory', 'w-friends', 'w-stars', 'w-sptop', 'w-episodes'];   // w-memory = Memory Lane (0.60.0, tall only); health is fixed in the Canvas/Notifications row since 0.59.0
  const ROT_MS = 12000;
  let rotIndex = 0, rotTimer = null, pausedUntil = 0, hover = false;
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A part without data (still loading, not linked, no extension): skip it
  const hasData = (el) => !!el && !el.querySelector(':scope > .w-body > .w-empty, :scope > .w-body > .w-note:only-child');
  const slides = () => ROT.map($).filter(Boolean);
  function show(i) {
    const list = slides();
    rotIndex = (i + list.length) % list.length;
    list.forEach((el, k) => {
      el.classList.toggle('on', k === rotIndex);
      el.setAttribute('aria-hidden', k === rotIndex ? 'false' : 'true');
    });
    [...dots.children].forEach((d, k) => d.setAttribute('aria-current', k === rotIndex ? 'true' : 'false'));
  }
  function next(dir = 1) {
    const list = slides();
    for (let step = 1; step <= list.length; step++) {
      const k = (rotIndex + dir * step + list.length * step) % list.length;
      if (hasData(list[k])) return show(k);
    }
  }
  prevBtn.onclick = () => { next(-1); pausedUntil = Date.now() + 30000; };
  nextBtn.onclick = () => { next(1); pausedUntil = Date.now() + 30000; };
  function buildDots() {
    dots.replaceChildren(...slides().map((el, k) => {
      const b = h('button');
      b.type = 'button';
      b.setAttribute('aria-label', (el.querySelector('.eyebrow') || {}).textContent || `Onderdeel ${k + 1}`);
      // Picked yourself: 30 seconds without automatic advance
      b.onclick = () => { show(k); pausedUntil = Date.now() + 30000; };
      return b;
    }));
  }
  function rotTick() {
    // Pause: mouse on it, a pop-up open, just picked yourself, or "reduce motion"
    if ((hover && Date.now() - movedAt < 30000) || calm() || Date.now() < pausedUntil) return;
    if (document.querySelector('dialog[open]') || more.classList.contains('open')) return;
    next();
  }
  // Mouse on it = a short pause, but only while you move it (0.60.0): if the mouse happens to lie still on it, the tile
  // simply carries on after 30 s (portrait screen nobody touches, 1.0 plan).
  let movedAt = 0;
  rot.addEventListener('mouseenter', () => { hover = true; movedAt = Date.now(); });
  rot.addEventListener('mousemove', () => { movedAt = Date.now(); });
  rot.addEventListener('mouseleave', () => { hover = false; });

  // ---------- Moving and putting back ----------
  // Where each tile came from (parent + place), to put it back exactly
  const home = new Map();
  function remember(ids) {
    for (const el of ids.map($).filter(Boolean)) {
      if (!home.has(el)) home.set(el, { parent: el.parentElement, index: [...el.parentElement.children].indexOf(el) });
    }
  }
  const put = (box, ids) => box.append(...ids.map((id) => (typeof id === 'string' ? $(id) : id)).filter(Boolean));

  // ---------- Thin player on tall (since 0.59.0) ----------
  // Button in the player (#player-size, only visible on tall): the big player becomes a narrow strip like in the landscape
  // layout (small cover on the left, title, bar and buttons next to it). Lyrics keep working (next to it, the same height). Per browser.
  const THIN_KEY = 'tall.playerThin';
  const sizeBtn = $('player-size');
  function thin(on, keep) {
    dash.classList.toggle('player-thin', on);
    if (sizeBtn) {
      sizeBtn.setAttribute('aria-pressed', String(on));
      sizeBtn.title = on ? 'Big player' : 'Thin player';
    }
    if (!keep) store.set(THIN_KEY, on);
    window.dispatchEvent(new Event('resize'));
  }
  if (sizeBtn) sizeBtn.onclick = () => thin(!dash.classList.contains('player-thin'));

  const MODES = {
    desk: {
      enter() {
        const ids = ['media-stack', 'calendar', 'version', 'w-weather', 'w-rain', 'w-alerts', 'w-ah', 'w-canvas', 'w-f1', 'w-episodes', 'w-stars', 'w-letterboxd', 'w-friends', 'w-mail', 'w-todo', 'w-wishes', 'w-health', 'w-sptop', 'w-checkin'];
        remember(ids);
        put(weather, ['w-weather', 'w-rain']);
        put(tabs, ['w-stars', 'w-letterboxd', 'w-friends']);
        put(left, [weather, 'w-alerts', 'w-checkin', 'w-ah']);
        put(mid, ['media-stack', 'calendar']);
        put(right, ['w-canvas', 'w-f1', 'w-episodes', tabs]);
        put(drawer, ['w-mail', 'w-todo', 'w-wishes', 'w-health', 'w-sptop']);
        moreList.textContent = 'Mail · To-do · Wishes · Steps · Spotify';
        if ($('version')) moreBar.append($('version'));
        dash.append(left, mid, right, more);
        setTab(store.get(TAB_KEY) || 'w-stars');
        // Lyrics are a pop-up here: don't open them right at load
        if ($('lyrics') && !$('lyrics').hidden) $('lyrics-close').click();
        if (window.DASH_RAIL) DASH_RAIL.enter(dash);   // sidebar on the left (rail.js)
      },
      leave() {
        if (window.DASH_RAIL) DASH_RAIL.leave();      // first: put the agenda back if it was open full screen
        TABS.forEach(([id]) => { if ($(id)) $(id).hidden = false; });
        [left, mid, right].forEach((el) => el.remove());
      },
    },
    tall: {
      enter() {
        const ids = ['w-weather', 'w-rain', 'w-f1', 'w-ah', 'w-canvas', 'w-alerts', 'w-health', ...ROT, 'w-mail', 'w-todo', 'w-wishes', 'w-checkin', 'version'];
        remember(ids);
        put(weather, ['w-weather', 'w-rain']);
        put(row3, [weather, 'w-f1', 'w-ah']);
        put(row2, ['w-canvas', 'w-alerts', 'w-health']);
        thin(store.get(THIN_KEY) === true);
        const memory = $('w-memory');   // grab before moving: rot isn't in the page yet, so $() wouldn't find it
        rot.prepend(...ROT.map($).filter(Boolean));
        if (memory) memory.hidden = false;
        put(hidden, ['w-mail']);
        // To-do off tall (0.59.0, 1.0 plan); the to-do tile still loads (desk/phone)
        put(hidden, ['w-todo']);
        put(drawer, ['w-checkin', 'w-wishes']);
        moreList.textContent = 'Check-in · Wishes';
        if ($('version')) moreBar.append($('version'));   // version on the right in the More bar, like in desk
        const before = $('calendar');
        [row3, row2, rot].forEach((el) => dash.insertBefore(el, before));
        dash.append(hidden, more);
        buildDots();
        show(0);
        if (!hasData(slides()[0])) next();
        rotTimer = setInterval(rotTick, ROT_MS);
      },
      leave() {
        thin(false, true);
        if ($('w-memory')) $('w-memory').hidden = true;   // rot is still in the page here
        clearInterval(rotTimer);
        slides().forEach((el) => { el.classList.remove('on'); el.removeAttribute('aria-hidden'); });
        [row3, row2, rot, hidden].forEach((el) => el.remove());
      },
    },
    phone: {
      enter() { window.DASH_PHONE.enter({ remember, put, dash }); },
      leave() { window.DASH_PHONE.leave(); },
    },
  };

  let current = null;
  function setMode(mode) {
    if (mode === current) return;
    if (current) {
      MODES[current].leave();
      setMore(false);
      // Back in the old place, per parent in the original order
      const byParent = new Map();
      for (const [el, spot] of home) {
        if (!byParent.has(spot.parent)) byParent.set(spot.parent, []);
        byParent.get(spot.parent).push([el, spot.index]);
      }
      for (const [parent, list] of byParent) {
        list.sort((a, b) => a[1] - b[1]).forEach(([el, index]) => parent.insertBefore(el, parent.children[index] || null));
      }
      home.clear();
      [weather, more].forEach((el) => el.remove());
      dash.classList.remove(current);
      document.documentElement.classList.remove(`${current}-mode`);
    }
    current = mode;
    if (mode) {
      MODES[mode].enter();
      dash.classList.add(mode);
      document.documentElement.classList.add(`${mode}-mode`);
    }
    window.dispatchEvent(new CustomEvent('dash:layout', { detail: { mode } }));
  }

  // Which layout: wide landscape = desk; portrait/medium = tall; phone = phone
  function apply() {
    const portrait = wideMq.matches && !deskMq.matches;
    document.documentElement.classList.toggle('portrait-wide', portrait);
    setMode(deskMq.matches ? 'desk' : portrait ? 'tall' : 'phone');
  }

  // Clean up saved layouts from the old "Arrange"
  try { ['dash.layout.v2.wide', 'dash.layout.v2.phone', 'dash.layout.wide', 'dash.layout.phone', 'dash.layout'].forEach((k) => localStorage.removeItem(k)); } catch {}

  // ---------- Closing with Esc and clicking next to it ----------
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !current) return;
    if (current === 'desk' && $('lyrics') && !$('lyrics').hidden) $('lyrics-close').click();
    else if (more.classList.contains('open')) setMore(false);
  });
  document.addEventListener('click', (e) => {
    if (current !== 'desk') return;
    const ly = $('lyrics');
    if (ly && !ly.hidden && !e.target.closest('#lyrics, #lyrics-btn')) $('lyrics-close').click();
  });

  deskMq.addEventListener('change', apply);
  wideMq.addEventListener('change', apply);
  apply();
})();
