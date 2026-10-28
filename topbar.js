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
  // Ingebouwd agenda-icoon zonder datum erin (het Google Agenda-logo toont altijd het cijfer van vandaag)
  const AGENDA_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="5" y="8" width="38" height="35" rx="6" fill="#fff"/><path d="M5 14a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v5H5z" fill="#4285f4"/><rect x="13" y="3" width="4" height="10" rx="2" fill="#1a73e8"/><rect x="31" y="3" width="4" height="10" rx="2" fill="#1a73e8"/><g fill="#4285f4"><rect x="11" y="24" width="7" height="6" rx="1.5"/><rect x="20.5" y="24" width="7" height="6" rx="1.5"/><rect x="30" y="24" width="7" height="6" rx="1.5"/><rect x="11" y="33" width="7" height="6" rx="1.5"/><rect x="20.5" y="33" width="7" height="6" rx="1.5"/></g></svg>')}`;
  const iconSrc = (icon, host) => {
    if (icon === 'agenda' || (icon && icon.includes('dynamiclogo'))) return AGENDA_ICON;
    return icon || `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  };
  const defaults = () => (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.snelkoppelingen) || [];
  const current = () => store.get(LINKS_KEY) || defaults();

  // Staand scherm: de links zitten ingeklapt achter één knopje en vouwen bij hover naar links uit (.tb-tray).
  // Overal anders is de tray display: contents, dus gedragen de links zich zoals altijd.
  const tray = h('div', 'tb-tray');
  const handle = h('button', 'tb-link tb-handle');
  handle.type = 'button';
  handle.title = 'Snelkoppelingen';
  handle.setAttribute('aria-label', 'Snelkoppelingen tonen');
  handle.innerHTML = '<span class="tb-icon"><svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="2.2"/><circle cx="12" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="12" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/></svg></span>';
  handle.onclick = () => links.classList.toggle('open');   // voor aanraken: tikken klapt open/dicht
  links.append(handle, tray);

  // Tekst links van de uitgevouwen links vervaagt aan de rand en verdwijnt eronder (masker op de klok/datum)
  const clockEl = bar.querySelector('.tb-clock');
  function fadeEdge() {
    const x = tray.getBoundingClientRect().left - clockEl.getBoundingClientRect().left - 10;
    bar.style.setProperty('--fade-x', `${Math.round(x)}px`);
  }
  links.addEventListener('mouseenter', fadeEdge);
  links.addEventListener('focusin', fadeEdge);
  handle.addEventListener('click', fadeEdge);
  document.addEventListener('click', (e) => { if (!e.target.closest('.tb-links')) links.classList.remove('open'); });

  function renderLinks() {
    tray.replaceChildren();
    for (const { name, url, icon } of current()) {
      let host = '';
      try { host = new URL(url).hostname; } catch { continue; }
      const a = h('a', 'tb-link');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = name;
      // Alleen het logo zelf: geen reserveletter erachter (die schemerde door doorzichtige logo's heen)
      a.append(DASH.img(iconSrc(icon, host), 'tb-icon', null), h('span', 'tb-name', name || host));
      tray.append(a);
    }
    const edit = h('button', 'tb-link tb-edit');
    edit.type = 'button';
    edit.title = 'Snelkoppelingen aanpassen';
    edit.append(h('span', 'tb-icon tb-plus', '+'), h('span', 'tb-name', 'Aanpassen'));
    edit.onclick = openEditor;
    tray.append(edit);
    if (window.DASH_MAIL) mailBadge(window.DASH_MAIL.count);
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
  // Met ?mini=1 (nieuwe-tabpagina) start hij altijd minimaal en wordt je opgeslagen keuze niet aangepast
  function setMinimal(on, save = !DASH.MINI) {
    document.body.classList.toggle('minimal', on);
    minBtn.setAttribute('aria-pressed', on);
    minBtn.title = on ? 'Alles weer tonen (Esc)' : 'Minimale modus';
    if (save) store.set(KEY, on);
    // Volledig dashboard: nu pas de rest laden (doet niets als dat al gebeurd is)
    if (!on) DASH.loadAll();
  }
  setMinimal(DASH.MINI || store.get(KEY) === true, false);
  if (DASH.MINI) setTimeout(() => search.focus(), 0);
  minBtn.onclick = () => setMinimal(!document.body.classList.contains('minimal'));

  // ---------- Ontwerp wisselen (alleen op staande/middelgrote schermen, desk.js doet het werk) ----------
  const DESIGN_KEY = 'dash.design';
  const designBtn = bar.querySelector('.tb-design');
  function designLabel() {
    const old = store.get(DESIGN_KEY) === 'old';
    designBtn.setAttribute('aria-pressed', old);
    designBtn.title = old ? 'Oud ontwerp (klik voor het nieuwe)' : 'Nieuw ontwerp (klik voor het oude)';
  }
  designBtn.onclick = () => {
    store.set(DESIGN_KEY, store.get(DESIGN_KEY) === 'old' ? 'new' : 'old');
    designLabel();
    window.dispatchEvent(new Event('dash:design'));
  };
  designLabel();

  // ---------- Ongelezen mail als rood getal op het Gmail-icoon ----------
  function mailBadge(count) {
    for (const a of links.querySelectorAll('.tb-link[href*="mail.google.com"]')) {
      let b = a.querySelector('.tb-badge');
      if (!count) { if (b) b.remove(); continue; }
      if (!b) { b = h('span', 'tb-badge'); a.append(b); }
      b.textContent = count > 99 ? '99+' : String(count);
      a.title = `Gmail · ${count} ongelezen`;
    }
  }
  window.addEventListener('dash:mail', (e) => mailBadge(e.detail && e.detail.count));

  // ---------- Dagregel: één korte zin over vandaag (AH, regen, eerstvolgende Canvas-deadline) ----------
  // Werkt ook in de minimale modus: dan uit de bewaarde agenda (localStorage), want de agenda zelf laadt pas bij uitklappen.
  const dayLineEl = bar.querySelector('.tb-dayline');
  let rain = null;
  function dayLine() {
    const now = Date.now();
    const today = DASH.startOfDay(now);
    const tomorrow = DASH.addDays(today, 1);
    const cal = window.DASH_CALENDAR && window.DASH_CALENDAR.connected ? window.DASH_CALENDAR.events : ((store.get('google.events') || {}).events || []);
    const parts = [];
    const shift = cal.filter((e) => DASH.isAH(e) && e.end > now && e.start < tomorrow).sort((a, b) => a.start - b.start)[0];
    if (shift) parts.push(shift.start <= now ? `AH tot ${DASH.fmtTime(shift.end)}` : `AH ${DASH.fmtTime(shift.start)}`);
    if (rain && rain.slots.length) {
      const wet = rain.slots.find((s) => s.end > now && s.mmh >= DASH.RAIN_MIN);
      parts.push(!wet ? 'droog' : wet.start <= now ? 'regen' : `regen om ${DASH.fmtTime(wet.start)}`);
    }
    const done = new Set(store.get('canvas.done') || []);
    const canvas = cal.filter((e) => e.canvas);
    const pool = canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
    const due = (e) => (e.allDay ? e.end - 1 : e.end);
    const next = pool.filter((e) => !done.has(e.id) && due(e) > now && due(e) - now < 3 * 86400000).sort((a, b) => due(a) - due(b))[0];
    if (next) {
      const name = next.title.replace(/\s*\[[^\]]+\]\s*$/, '');
      const days = Math.round((DASH.startOfDay(due(next)) - today) / 86400000);
      parts.push(`${name} ${days === 0 ? `vandaag ${DASH.fmtTime(due(next))}` : days === 1 ? 'morgen' : `over ${days} dagen`}`);
    }
    // Verjaardagen (agenda-veld birthday, uit de verjaardagen-agenda van je contacten): komende 7 dagen
    const bdays = cal.filter((e) => e.birthday && e.end > now && e.start < DASH.addDays(today, 8))
      .sort((a, b) => a.start - b.start).filter((e, i, arr) => arr.findIndex((x) => x.birthday === e.birthday) === i);
    let todayBday = null;
    for (const e of bdays.slice(0, 2)) {
      const days = Math.round((DASH.startOfDay(e.start) - today) / 86400000);
      if (days <= 0) todayBday = `🎂 ${e.birthday} is vandaag jarig!`;
      else parts.push(`🎂 ${e.birthday} ${days === 1 ? 'morgen' : `over ${days} dagen`} jarig`);
    }
    const text = parts.join(' · ');
    const key = `${todayBday || ''}|${text}`;
    if (dayLineEl.dataset.key !== key) {
      dayLineEl.dataset.key = key;
      dayLineEl.replaceChildren();
      if (todayBday) dayLineEl.append(h('span', 'tb-bday-today', todayBday), text ? ' · ' : '');
      if (text) dayLineEl.append(text);
    }
    dayLineEl.hidden = !text && !todayBday;
  }
  const loadRain = () => DASH.radar().then((r) => { rain = r; dayLine(); }).catch(() => {});
  window.addEventListener('dash:calendar', dayLine);
  DASH.every(60 * 1000, dayLine);
  DASH.every(5 * 60 * 1000, loadRain);
  dayLine();
  loadRain();

  // ---------- Nachtstand: 23:00–07:00 wordt alles gedimd (minder fel en minder kleur), knop zet hem uit ----------
  const NIGHT_KEY = 'dash.night';
  const nightBtn = bar.querySelector('.tb-night');
  function night() {
    const on = store.get(NIGHT_KEY) !== 'off';
    const hr = new Date().getHours();
    document.documentElement.classList.toggle('night', on && (hr >= 23 || hr < 7));
    nightBtn.setAttribute('aria-pressed', on);
    nightBtn.title = on ? 'Nachtstand (23:00–07:00): aan' : 'Nachtstand: uit';
  }
  nightBtn.onclick = () => { store.set(NIGHT_KEY, store.get(NIGHT_KEY) === 'off' ? 'on' : 'off'); night(); };
  DASH.every(60 * 1000, night);
  night();

  // ---------- Onderzoek: vaste knop met de links uit config.onderzoek ----------
  const research = (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.onderzoek) || [];
  if (research.length) {
    const wrap = h('div', 'tb-research');
    const btn = h('button', 'tb-link tb-research-btn');
    btn.type = 'button';
    btn.title = 'Letterboxd-onderzoek';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="tb-icon tb-research-icon"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 12v2h10v-2H7zm0 4v2h7v-2H7z"/></svg></span>';
    btn.append(h('span', 'tb-name', 'Onderzoek'));
    const menu = h('div', 'tb-research-menu');
    menu.hidden = true;
    menu.append(h('b', null, 'Letterboxd-onderzoek'));
    for (const { name, url } of research) {
      const a = h('a', null, name);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      menu.append(a);
    }
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', !menu.hidden);
    };
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.tb-research')) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    wrap.append(btn, menu);
    links.after(wrap);
  }

  // ---------- Sneltoetsen ----------
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !typing(document.activeElement) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      search.focus();
      search.select();
    } else if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      const rm = bar.querySelector('.tb-research-menu');
      if (rm) rm.hidden = true;
      if (document.activeElement === search) search.blur();
      if (document.body.classList.contains('minimal')) setMinimal(false);
    }
  });
})();
