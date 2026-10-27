'use strict';

// Topbalk: klok, datum, weeknummer, snelkoppelingen (uit config.js), Google-zoekbalk en de knop voor minimale modus.
// Minimale modus: alleen een grote klok, datum en zoekbalk. Esc of dezelfde knop zet hem terug. Keuze blijft bewaard.
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  if (!bar) return;

  const timeEl = bar.querySelector('.tb-time');
  const dateEl = bar.querySelector('.tb-date');
  const weekEl = bar.querySelector('.tb-week');
  const links = bar.querySelector('.tb-links');
  const menuBtn = bar.querySelector('.tb-menu');
  const minBtn = bar.querySelector('.tb-min');
  const search = bar.querySelector('.tb-search input');

  // ---------- Klok en datum ----------
  // ISO-weeknummer (week begint op maandag, week 1 bevat de eerste donderdag)
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  function tick() {
    const now = new Date();
    const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const week = `week ${isoWeek(now)}`;
    if (timeEl.textContent !== time) {
      timeEl.textContent = time;
      timeEl.dateTime = now.toISOString();
    }
    if (dateEl.textContent !== date) dateEl.textContent = date;
    if (weekEl.textContent !== week) weekEl.textContent = week;
    // Precies op de volgende seconde opnieuw, zodat de minuut op tijd omslaat
    setTimeout(tick, 1000 - now.getMilliseconds() + 5);
  }
  tick();

  // ---------- Snelkoppelingen ----------
  // Eigen lijst (aangepast op het dashboard, in localStorage) gaat vóór de standaardlijst uit config.js
  const LINKS_KEY = 'dash.links';
  const defaults = () => (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.snelkoppelingen) || [];
  const current = () => store.get(LINKS_KEY) || defaults();

  function renderLinks() {
    links.replaceChildren();
    for (const { name, url, icon } of current()) {
      let host = '';
      try { host = new URL(url).hostname; } catch { continue; }
      const a = h('a', 'tb-link');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = name;
      const src = icon ? icon.replace('{dag}', new Date().getDate()) : `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
      a.append(DASH.img(src, 'tb-icon', (name || host)[0].toUpperCase()), h('span', 'tb-name', name || host));
      links.append(a);
    }
    const edit = h('button', 'tb-link tb-edit');
    edit.type = 'button';
    edit.title = 'Snelkoppelingen aanpassen';
    edit.append(h('span', 'tb-icon tb-plus', '+'), h('span', 'tb-name', 'Aanpassen'));
    edit.onclick = openEditor;
    links.append(edit);
  }

  // Paneel om links toe te voegen, te wijzigen, te verplaatsen en weg te halen
  let editor = null;
  function openEditor() {
    if (!editor) editor = DASH.panel('Snelkoppelingen', 'var(--accent)');
    editor.dialog.classList.add('links-dialog');
    const rows = h('div', 'lk-rows');
    const addRow = (item = { name: '', url: '' }) => {
      const row = h('div', 'lk-row');
      row._icon = item.icon;
      row._url = item.url;
      const name = h('input');
      name.placeholder = 'Naam';
      name.value = item.name || '';
      const url = h('input');
      url.type = 'url';
      url.placeholder = 'https://…';
      url.value = item.url || '';
      const btn = (label, title, fn) => { const b = h('button', 'w-btn ghost', label); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
      row.append(name, url,
        btn('↑', 'Omhoog', () => row.previousElementSibling && rows.insertBefore(row, row.previousElementSibling)),
        btn('✕', 'Weghalen', () => row.remove()));
      rows.append(row);
      return name;
    };
    current().forEach((x) => addRow(x));

    const add = h('button', 'w-btn ghost', '+ Link toevoegen');
    add.type = 'button';
    add.onclick = () => addRow().focus();
    const reset = h('button', 'text-btn', 'Standaardlijst terugzetten');
    reset.type = 'button';
    reset.onclick = () => { try { localStorage.removeItem(LINKS_KEY); } catch {} renderLinks(); editor.close(); };
    const save = h('button', 'w-btn', 'Opslaan');
    save.type = 'button';
    save.onclick = () => {
      const list = [];
      for (const row of rows.children) {
        const [n, u] = row.querySelectorAll('input');
        let url = u.value.trim();
        if (!url) continue;
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        try { new URL(url); } catch { u.focus(); return; }
        const item = { name: n.value.trim(), url };
        // Eigen icoon (Gmail, Agenda) alleen houden zolang de link hetzelfde blijft
        if (row._icon && url === row._url) item.icon = row._icon;
        list.push(item);
      }
      store.set(LINKS_KEY, list);
      renderLinks();
      editor.close();
    };
    const foot = h('div', 'lk-foot');
    const right = h('div', 'lk-actions');
    right.append(add, save);
    foot.append(reset, right);
    const note = h('p', 'w-note', 'Wordt bewaard in deze browser. Op een ander apparaat zie je de standaardlijst uit config.js.');
    editor.body.replaceChildren(rows, foot, note);
    editor.open();
  }

  renderLinks();

  // Telefoon: snelkoppelingen in een uitklapmenu
  menuBtn.onclick = () => {
    const open = !bar.classList.contains('menu-open');
    bar.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
  };
  document.addEventListener('click', (e) => {
    if (bar.classList.contains('menu-open') && !e.target.closest('.tb-links, .tb-menu')) {
      bar.classList.remove('menu-open');
      menuBtn.setAttribute('aria-expanded', false);
    }
  });

  // ---------- Minimale modus ----------
  const KEY = 'dash.minimal';
  function setMinimal(on) {
    document.body.classList.toggle('minimal', on);
    minBtn.setAttribute('aria-pressed', on);
    minBtn.title = on ? 'Alles weer tonen (Esc)' : 'Minimale modus';
    store.set(KEY, on);
  }
  setMinimal(store.get(KEY) === true);
  minBtn.onclick = () => setMinimal(!document.body.classList.contains('minimal'));

  // ---------- Sneltoetsen ----------
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !typing(document.activeElement) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      search.focus();
      search.select();
    } else if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (document.activeElement === search) search.blur();
      if (document.body.classList.contains('minimal')) setMinimal(false);
    }
  });
})();
