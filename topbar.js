'use strict';

// Top bar: clock, date, week number, shortcuts (from config.js), Google search bar and the minimal-mode button.
// Minimal mode: only a big clock, date and search bar. Esc or the same button turns it back. The choice is remembered.
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

  // ---------- Clock and date ----------
  // ISO week number (the week starts on Monday, week 1 contains the first Thursday)
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  function tick() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const week = `week ${isoWeek(now)}`;
    if (timeEl.textContent !== time) {
      timeEl.textContent = time;
      timeEl.dateTime = now.toISOString();
    }
    if (dateEl.textContent !== date) dateEl.textContent = date;
    if (weekEl.textContent !== week) weekEl.textContent = week;
    // Again exactly at the next second, so the minute flips on time
    setTimeout(tick, 1000 - now.getMilliseconds() + 5);
  }
  tick();

  // ---------- Snelkoppelingen ----------
  // Own list (changed on the dashboard, in localStorage) goes before the default list from config.js
  const LINKS_KEY = 'dash.links';
  // Built-in calendar icon without a date in it (the Google Calendar logo always shows today's number)
  const AGENDA_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="5" y="8" width="38" height="35" rx="6" fill="#fff"/><path d="M5 14a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v5H5z" fill="#4285f4"/><rect x="13" y="3" width="4" height="10" rx="2" fill="#1a73e8"/><rect x="31" y="3" width="4" height="10" rx="2" fill="#1a73e8"/><g fill="#4285f4"><rect x="11" y="24" width="7" height="6" rx="1.5"/><rect x="20.5" y="24" width="7" height="6" rx="1.5"/><rect x="30" y="24" width="7" height="6" rx="1.5"/><rect x="11" y="33" width="7" height="6" rx="1.5"/><rect x="20.5" y="33" width="7" height="6" rx="1.5"/></g></svg>')}`;
  const iconSrc = (icon, host) => {
    if (icon === 'agenda' || (icon && icon.includes('dynamiclogo'))) return AGENDA_ICON;
    return icon || `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  };
  const defaults = () => (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.shortcuts) || [];
  const current = () => store.get(LINKS_KEY) || defaults();

  // Portrait screen: the links are folded behind one button and unfold to the left on hover (.tb-tray).
  // Everywhere else the tray is display: contents, so the links behave as always.
  const tray = h('div', 'tb-tray');
  const handle = h('button', 'tb-link tb-handle');
  handle.type = 'button';
  handle.title = 'Shortcuts';
  handle.setAttribute('aria-label', 'Show shortcuts');
  handle.innerHTML = '<span class="tb-icon"><svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="2.2"/><circle cx="12" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="12" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/></svg></span>';
  handle.onclick = () => links.classList.toggle('open');   // for touch: tapping folds open/closed
  links.append(handle, tray);

  // Text to the left of the unfolded links fades at the edge and disappears below them (mask on the clock/date)
  const clockEl = bar.querySelector('.tb-clock');
  function fadeEdge() {
    const x = tray.getBoundingClientRect().left - clockEl.getBoundingClientRect().left - 10;
    bar.style.setProperty('--fade-x', `${Math.round(x)}px`);
  }
  links.addEventListener('mouseenter', fadeEdge);
  links.addEventListener('focusin', fadeEdge);
  handle.addEventListener('click', fadeEdge);
  document.addEventListener('click', (e) => { if (!e.target.closest('.tb-links')) links.classList.remove('open'); });

  // Own list from another device arrived (sync.js, since 1.1.0)
  window.addEventListener('dash:synced', (e) => { if (e.detail.key === LINKS_KEY) renderLinks(); });
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
      // Only the logo itself: no fallback letter behind it (it showed through transparent logos)
      a.append(DASH.img(iconSrc(icon, host), 'tb-icon', null), h('span', 'tb-name', name || host));
      tray.append(a);
    }
    const edit = h('button', 'tb-link tb-edit');
    edit.type = 'button';
    edit.title = 'Edit shortcuts';
    edit.append(h('span', 'tb-icon tb-plus', '+'), h('span', 'tb-name', 'Edit'));
    edit.onclick = openEditor;
    tray.append(edit);
    if (window.DASH_MAIL) mailBadge(window.DASH_MAIL.count);
  }

  // Panel to add, change, move and remove links
  let editor = null;
  function openEditor() {
    if (!editor) editor = DASH.panel('Shortcuts', 'var(--accent)');
    editor.dialog.classList.add('links-dialog');
    const rows = h('div', 'lk-rows');
    const addRow = (item = { name: '', url: '' }) => {
      const row = h('div', 'lk-row');
      row._icon = item.icon;
      row._url = item.url;
      const name = h('input');
      name.placeholder = 'Name';
      name.value = item.name || '';
      const url = h('input');
      url.type = 'url';
      url.placeholder = 'https://…';
      url.value = item.url || '';
      const btn = (label, title, fn) => { const b = h('button', 'w-btn ghost', label); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
      row.append(name, url,
        btn('↑', 'Up', () => row.previousElementSibling && rows.insertBefore(row, row.previousElementSibling)),
        btn('✕', 'Remove', () => row.remove()));
      rows.append(row);
      return name;
    };
    current().forEach((x) => addRow(x));

    const add = h('button', 'w-btn ghost', '+ Add link');
    add.type = 'button';
    add.onclick = () => addRow().focus();
    const reset = h('button', 'text-btn', 'Restore the default list');
    reset.type = 'button';
    reset.onclick = () => { try { localStorage.removeItem(LINKS_KEY); } catch {} renderLinks(); editor.close(); };
    const save = h('button', 'w-btn', 'Save');
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
        // Keep an own icon (Gmail, Calendar) only as long as the link stays the same
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
    const note = h('p', 'w-note', 'Shared between your devices via Supabase; without Supabase only in this browser.');
    editor.body.replaceChildren(rows, foot, note);
    editor.open();
  }

  renderLinks();

  // Phone: shortcuts in a drop-down menu
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

  // ---------- Minimal mode ----------
  const KEY = 'dash.minimal';
  // With ?mini=1 (new-tab page) it always starts minimal and your saved choice isn't changed
  function setMinimal(on, save = !DASH.MINI) {
    document.body.classList.toggle('minimal', on);
    minBtn.setAttribute('aria-pressed', on);
    minBtn.title = on ? 'Show everything again (Esc)' : 'Minimal mode';
    if (save) store.set(KEY, on);
    // Full dashboard: only now load the rest (does nothing if that already happened)
    if (!on) DASH.loadAll();
  }
  setMinimal(DASH.MINI || store.get(KEY) === true, false);
  if (DASH.MINI) setTimeout(() => search.focus(), 0);

  // ---------- Search bar: a link or web address goes straight to that page (no Google search) ----------
  function asUrl(q) {
    if (/\s/.test(q)) return null;
    if (/^https?:\/\/\S+$/i.test(q)) return q;
    // nu.nl, www.example.com/path, github.com/x?y=1 (a domain with an extension of at least 2 letters)
    if (/^([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(q)) return `https://${q}`;
    return null;
  }
  bar.querySelector('.tb-search').addEventListener('submit', (e) => {
    const url = asUrl(search.value.trim());
    if (!url) return;
    e.preventDefault();
    location.href = url;
  });
  minBtn.onclick = () => setMinimal(!document.body.classList.contains('minimal'));

  // ---------- Unread mail as a red number on the Gmail icon ----------
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

  // ---------- Day line: one short sentence about today (AH, rain, next Canvas deadline) ----------
  // Also works in minimal mode: then from the saved agenda (localStorage), because the agenda itself only loads when expanded.
  const dayLineEl = bar.querySelector('.tb-dayline');
  let rain = null;
  function dayLine() {
    const now = Date.now();
    const today = DASH.startOfDay(now);
    const tomorrow = DASH.addDays(today, 1);
    const cal = window.DASH_CALENDAR && window.DASH_CALENDAR.connected ? window.DASH_CALENDAR.events : ((store.get('google.events') || {}).events || []);
    const parts = [];
    // The same parts as separate pieces for the phone (phone.js turns them into chips): { k: kind, t: text }
    const items = [];
    const add = (k, t) => { parts.push(t); items.push({ k, t }); };
    const shift = cal.filter((e) => DASH.isAH(e) && e.end > now && e.start < tomorrow).sort((a, b) => a.start - b.start)[0];
    if (shift) add('ah', shift.start <= now ? `AH until ${DASH.fmtTime(shift.end)}` : `AH ${DASH.fmtTime(shift.start)}`);
    if (rain && rain.slots.length) {
      const wet = rain.slots.find((s) => s.end > now && s.mmh >= DASH.RAIN_MIN);
      add('rain', !wet ? 'dry' : wet.start <= now ? 'rain' : `rain at ${DASH.fmtTime(wet.start)}`);
    }
    const done = new Set(store.get('canvas.done') || []);
    const canvas = cal.filter((e) => e.canvas);
    const pool = canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
    const due = (e) => (e.allDay ? e.end - 1 : e.end);
    const next = pool.filter((e) => !done.has(e.id) && due(e) > now && due(e) - now < 3 * 86400000).sort((a, b) => due(a) - due(b))[0];
    if (next) {
      const name = next.title.replace(/\s*\[[^\]]+\]\s*$/, '');
      const days = Math.round((DASH.startOfDay(due(next)) - today) / 86400000);
      add('canvas', `${name} ${days === 0 ? `today ${DASH.fmtTime(due(next))}` : days === 1 ? 'tomorrow' : `in ${days} days`}`);
    }
    // Birthdays (agenda field birthday, from your contacts' birthday calendar): the next 7 days
    const bdays = cal.filter((e) => e.birthday && e.end > now && e.start < DASH.addDays(today, 8))
      .sort((a, b) => a.start - b.start).filter((e, i, arr) => arr.findIndex((x) => x.birthday === e.birthday) === i);
    let todayBday = null;
    for (const e of bdays.slice(0, 2)) {
      const days = Math.round((DASH.startOfDay(e.start) - today) / 86400000);
      // Your own birthday (Google's "Happy birthday!" event): count down; on the day itself themes.js does the greeting
      const own = /gefeliciteerd|happy birthday/i.test(e.birthday);
      if (own) { if (days > 0) add('bday', `🎂 ${days === 1 ? '1 day' : `${days} days`} to your birthday`); continue; }
      if (days <= 0) todayBday = `🎂 It's ${e.birthday}'s birthday today!`;
      else add('bday', `🎂 ${e.birthday}'s birthday ${days === 1 ? 'tomorrow' : `in ${days} days`}`);
    }
    window.DASH_DAYLINE = { items: todayBday ? [{ k: 'bday', t: todayBday, today: true }, ...items] : items, rain };
    window.dispatchEvent(new CustomEvent('dash:dayline'));
    // House style: no emoji in the top bar (the phone gets DASH_DAYLINE above unchanged)
    const plain = (t) => (window.DASH_HOUSESTYLE ? DASH_HOUSESTYLE.plain(t) : t);
    const text = plain(parts.join(' · '));
    if (todayBday) todayBday = plain(todayBday);
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
  window.addEventListener('dash:mood', dayLine);
  DASH.every(60 * 1000, dayLine);
  DASH.every(5 * 60 * 1000, loadRain);
  dayLine();
  loadRain();

  // ---------- Research: a fixed button with the links from config.research ----------
  const research = (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.research) || [];
  if (research.length) {
    const wrap = h('div', 'tb-research');
    const btn = h('button', 'tb-link tb-research-btn');
    btn.type = 'button';
    btn.title = 'Letterboxd research';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="tb-icon tb-research-icon"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 12v2h10v-2H7zm0 4v2h7v-2H7z"/></svg></span>';
    btn.append(h('span', 'tb-name', 'Research'));
    const menu = h('div', 'tb-research-menu');
    menu.hidden = true;
    menu.append(h('b', null, 'Letterboxd research'));
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

  // ---------- Keyboard shortcuts ----------
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
