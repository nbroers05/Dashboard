'use strict';

// Indelingen naast de gewone (die van layout.js, met "Indelen"). De vakken zelf blijven hetzelfde; dit script
// verplaatst ze alleen, en zet ze precies terug als een andere indeling geldt.
//
// desk: breed liggend scherm (vanaf 1280px, liggend). Alles in één scherm zonder scrollen: topbalk, drie kolommen
//       (links weer+buienalarm, meldingen, AH; midden speler en agenda; rechts Canvas, F1, Episodes, film/laatst
//       gekeken/vrienden met tabjes) en onderaan een "Meer"-balk met mail, to-do, gezondheid en Spotify-maandoverzicht die naar boven uitklapt.
// tall: staand scherm (breder dan 700px, niet desk), het "nieuwe" staande ontwerp: speler, rij weer/F1/AH (buienalarm
//       zit in het weervak), rij Canvas/meldingen, één roterend vak (laatst gekeken, film, Episodes, gezondheid),
//       agenda, en een "Meer"-balk met to-do. Met de knop in de topbalk wissel je naar het oude ontwerp (dash.design).
// Telefoon (tot 700px) en het oude staande ontwerp: geen van beide, gewoon layout.js.
(() => {
  const { h, store } = DASH;
  const dash = document.querySelector('.dashboard');
  if (!dash) return;
  const deskMq = window.matchMedia('(min-width: 1280px) and (orientation: landscape)');
  const wideMq = window.matchMedia('(min-width: 701px)');
  const DESIGN_KEY = 'dash.design';
  const $ = (id) => document.getElementById(id);

  // ---------- Gedeelde bouwstenen ----------
  // Weer en buienalarm in één vak
  const weather = h('div', 'desk-weather');

  // "Meer": dunne balk onderaan, klapt naar boven uit
  const more = h('div', 'desk-more');
  const moreBar = h('button', 'desk-more-bar');
  moreBar.type = 'button';
  moreBar.setAttribute('aria-expanded', 'false');
  const moreList = h('span', 'desk-more-list');
  moreBar.append(h('span', 'desk-more-label', 'Meer'), moreList, h('span', 'desk-more-chev', '▲'));
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

  // Film van vanavond / Laatst gekeken met tabjes
  const TAB_KEY = 'desk.tab';
  const tabs = h('div', 'desk-tabs');
  const tabBar = h('div', 'desk-tabbar');
  tabBar.setAttribute('role', 'tablist');
  const TABS = [['w-stars', 'Film van vanavond'], ['w-letterboxd', 'Laatst gekeken'], ['w-friends', 'Vrienden']];
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

  // ---------- tall: rijen en het roterende vak ----------
  const row3 = h('div', 'tall-row tall-3');
  const row2 = h('div', 'tall-row tall-2');
  const hidden = h('div', 'tall-hidden');   // het mailvak blijft laden (voor het getal op het Gmail-icoon), maar zonder vak
  const rot = h('div', 'tall-rot');
  const dots = h('div', 'tall-dots');
  rot.append(dots);
  const ROT = ['w-letterboxd', 'w-friends', 'w-stars', 'w-sptop', 'w-episodes', 'w-health'];
  const ROT_MS = 12000;
  let rotIndex = 0, rotTimer = null, pausedUntil = 0, hover = false;
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Onderdeel zonder data (nog laden, niet gekoppeld, geen extensie): overslaan
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
  function next() {
    const list = slides();
    for (let step = 1; step <= list.length; step++) {
      const k = (rotIndex + step) % list.length;
      if (hasData(list[k])) return show(k);
    }
  }
  function buildDots() {
    dots.replaceChildren(...slides().map((el, k) => {
      const b = h('button');
      b.type = 'button';
      b.setAttribute('aria-label', (el.querySelector('.eyebrow') || {}).textContent || `Onderdeel ${k + 1}`);
      // Zelf kiezen: 30 seconden niet automatisch verder
      b.onclick = () => { show(k); pausedUntil = Date.now() + 30000; };
      return b;
    }));
  }
  function rotTick() {
    // Pauze: muis erop, een pop-up open, net zelf gekozen, of "beweging beperken"
    if (hover || calm() || Date.now() < pausedUntil) return;
    if (document.querySelector('dialog[open]') || more.classList.contains('open')) return;
    next();
  }
  rot.addEventListener('mouseenter', () => { hover = true; });
  rot.addEventListener('mouseleave', () => { hover = false; });

  // ---------- Verplaatsen en terugzetten ----------
  // Waar elk vak vandaan kwam (ouder + plek), om het precies terug te zetten
  const home = new Map();
  function remember(ids) {
    for (const el of ids.map($).filter(Boolean)) {
      if (!home.has(el)) home.set(el, { parent: el.parentElement, index: [...el.parentElement.children].indexOf(el) });
    }
  }
  const put = (box, ids) => box.append(...ids.map((id) => (typeof id === 'string' ? $(id) : id)).filter(Boolean));

  const MODES = {
    desk: {
      enter() {
        const ids = ['media-stack', 'calendar', 'version', 'w-weather', 'w-rain', 'w-alerts', 'w-ah', 'w-canvas', 'w-f1', 'w-episodes', 'w-stars', 'w-letterboxd', 'w-friends', 'w-mail', 'w-todo', 'w-health', 'w-sptop'];
        remember(ids);
        put(weather, ['w-weather', 'w-rain']);
        put(tabs, ['w-stars', 'w-letterboxd', 'w-friends']);
        put(left, [weather, 'w-alerts', 'w-ah']);
        put(mid, ['media-stack', 'calendar']);
        put(right, ['w-canvas', 'w-f1', 'w-episodes', tabs]);
        put(drawer, ['w-mail', 'w-todo', 'w-health', 'w-sptop']);
        moreList.textContent = 'Mail · To-do · Gezondheid · Spotify';
        if ($('version')) moreBar.append($('version'));
        dash.append(left, mid, right, more);
        setTab(store.get(TAB_KEY) || 'w-stars');
        // Songtekst is hier een pop-up: niet meteen openen bij het laden
        if ($('lyrics') && !$('lyrics').hidden) $('lyrics-close').click();
      },
      leave() {
        TABS.forEach(([id]) => { if ($(id)) $(id).hidden = false; });
        [left, mid, right].forEach((el) => el.remove());
      },
    },
    tall: {
      enter() {
        const ids = ['w-weather', 'w-rain', 'w-f1', 'w-ah', 'w-canvas', 'w-alerts', ...ROT, 'w-mail', 'w-todo'];
        remember(ids);
        put(weather, ['w-weather', 'w-rain']);
        put(row3, [weather, 'w-f1', 'w-ah']);
        put(row2, ['w-canvas', 'w-alerts']);
        rot.prepend(...ROT.map($).filter(Boolean));
        put(hidden, ['w-mail']);
        put(drawer, ['w-todo']);
        moreList.textContent = 'To-do';
        const before = $('calendar');
        [row3, row2, rot].forEach((el) => dash.insertBefore(el, before));
        dash.append(hidden, more);
        buildDots();
        show(0);
        if (!hasData(slides()[0])) next();
        rotTimer = setInterval(rotTick, ROT_MS);
      },
      leave() {
        clearInterval(rotTimer);
        slides().forEach((el) => { el.classList.remove('on'); el.removeAttribute('aria-hidden'); });
        [row3, row2, rot, hidden].forEach((el) => el.remove());
      },
    },
  };

  let current = null;
  function setMode(mode) {
    if (mode === current) return;
    if (current) {
      MODES[current].leave();
      setMore(false);
      // Terug op de oude plek, per ouder in de oorspronkelijke volgorde
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
      if (!mode && DASH.layoutApply) DASH.layoutApply();   // je eigen indeling ("Indelen") weer toepassen
    }
    current = mode;
    if (mode) {
      MODES[mode].enter();
      dash.classList.add(mode);
      document.documentElement.classList.add(`${mode}-mode`);
    }
    window.dispatchEvent(new CustomEvent('dash:layout', { detail: { mode } }));
  }

  // Welke indeling: breed liggend = desk; staand/middelgroot = nieuw of oud (knop in de topbalk); telefoon = gewoon
  function apply() {
    const portrait = wideMq.matches && !deskMq.matches;
    document.documentElement.classList.toggle('portrait-wide', portrait);
    const design = store.get(DESIGN_KEY) === 'old' ? 'old' : 'new';
    setMode(deskMq.matches ? 'desk' : portrait && design === 'new' ? 'tall' : null);
  }

  // ---------- Sluiten met Esc en klikken ernaast ----------
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
  window.addEventListener('dash:design', apply);
  apply();
})();
