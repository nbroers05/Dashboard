'use strict';

// Breed liggend scherm (vanaf 1280px breed, liggend): alles in één scherm zonder scrollen.
// Topbalk, dan drie kolommen (links weer+buienalarm, meldingen, AH; midden speler en agenda; rechts Canvas, F1, Episodes,
// film/laatst gekeken met tabjes) en onderaan een "Meer"-balk met mail, to-do en gezondheid die naar boven uitklapt.
// De vakken zelf blijven hetzelfde; dit script verplaatst ze alleen, en zet ze terug als het scherm smaller wordt.
(() => {
  const { h, store } = DASH;
  const dash = document.querySelector('.dashboard');
  if (!dash) return;
  const mq = window.matchMedia('(min-width: 1280px) and (orientation: landscape)');
  const $ = (id) => document.getElementById(id);

  // ---------- Bouwstenen ----------
  const left = h('div', 'desk-col desk-left');
  const mid = h('div', 'desk-col desk-mid');
  const right = h('div', 'desk-col desk-right');

  // Weer en buienalarm in één vak
  const weather = h('div', 'desk-weather');

  // Film van vanavond / Laatst gekeken met tabjes
  const TAB_KEY = 'desk.tab';
  const tabs = h('div', 'desk-tabs');
  const tabBar = h('div', 'desk-tabbar');
  tabBar.setAttribute('role', 'tablist');
  const TABS = [['w-stars', 'Film van vanavond'], ['w-letterboxd', 'Laatst gekeken']];
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
      const el = $(tid);
      if (el) el.hidden = !on;
    });
  }

  // "Meer": dunne balk onderaan, klapt naar boven uit
  const more = h('div', 'desk-more');
  const moreBar = h('button', 'desk-more-bar');
  moreBar.type = 'button';
  moreBar.setAttribute('aria-expanded', 'false');
  moreBar.append(h('span', 'desk-more-label', 'Meer'), h('span', 'desk-more-list', 'Mail · To-do · Gezondheid'), h('span', 'desk-more-chev', '▲'));
  const drawer = h('div', 'desk-drawer');
  more.append(drawer, moreBar);
  function setMore(open) {
    more.classList.toggle('open', open);
    moreBar.setAttribute('aria-expanded', open);
  }
  moreBar.onclick = () => setMore(!more.classList.contains('open'));

  // ---------- Indeling: welk vak waar ----------
  const PLAN = [
    [left, ['desk-weather', 'w-alerts', 'w-ah']],
    [mid, ['media-stack', 'calendar']],
    [right, ['w-canvas', 'w-f1', 'w-episodes', 'desk-tabs']],
  ];
  const INTO = { 'desk-weather': [weather, ['w-weather', 'w-rain']], 'desk-tabs': [tabs, ['w-stars', 'w-letterboxd']] };
  const DRAWER = ['w-mail', 'w-todo', 'w-health'];

  // Waar elk vak vandaan kwam (ouder + plek), om het precies terug te zetten
  const home = new Map();
  function remember(el) {
    if (!home.has(el)) home.set(el, { parent: el.parentElement, index: [...el.parentElement.children].indexOf(el) });
  }

  let active = false;
  function enter() {
    if (active) return;
    active = true;
    const all = ['media-stack', 'calendar', 'version', 'w-weather', 'w-rain', 'w-alerts', 'w-ah', 'w-canvas', 'w-f1', 'w-episodes', 'w-stars', 'w-letterboxd', ...DRAWER].map($).filter(Boolean);
    all.forEach(remember);
    for (const [box, ids] of Object.values(INTO)) box.append(...ids.map($).filter(Boolean));
    for (const [col, ids] of PLAN) col.append(...ids.map((id) => (INTO[id] ? INTO[id][0] : $(id))).filter(Boolean));
    drawer.append(...DRAWER.map($).filter(Boolean));
    if ($('version')) moreBar.append($('version'));
    dash.append(left, mid, right, more);
    dash.classList.add('desk');
    document.documentElement.classList.add('desk-mode');
    setTab(store.get(TAB_KEY) || 'w-stars');
    // Songtekst is hier een pop-up: niet meteen openen bij het laden
    if ($('lyrics') && !$('lyrics').hidden) $('lyrics-close').click();
    window.dispatchEvent(new CustomEvent('dash:layout', { detail: { desk: true } }));
  }

  function leave() {
    if (!active) return;
    active = false;
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
    TABS.forEach(([id]) => { if ($(id)) $(id).hidden = false; });
    [left, mid, right, more].forEach((el) => el.remove());
    dash.classList.remove('desk');
    document.documentElement.classList.remove('desk-mode');
    // Je eigen indeling ("Indelen") weer toepassen
    if (DASH.layoutApply) DASH.layoutApply();
    window.dispatchEvent(new CustomEvent('dash:layout', { detail: { desk: false } }));
  }

  // ---------- Sluiten met Esc en klikken ernaast ----------
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !active) return;
    if ($('lyrics') && !$('lyrics').hidden) $('lyrics-close').click();
    else if (more.classList.contains('open')) setMore(false);
  });
  document.addEventListener('click', (e) => {
    if (!active) return;
    const ly = $('lyrics');
    if (ly && !ly.hidden && !e.target.closest('#lyrics, #lyrics-btn')) $('lyrics-close').click();
  });

  const apply = () => (mq.matches ? enter() : leave());
  mq.addEventListener('change', apply);
  apply();
})();
