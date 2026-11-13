'use strict';

// Phone (up to 700px wide, since 0.45.0): a fixed tab bar at the bottom with Today, Agenda, Media and Data, each tab
// on one screen as much as possible. desk.js turns this layout on and off (MODES.phone) and afterwards puts the tiles
// back exactly, just like with desk and tall.
// - Today: top bar (clock, greeting, buttons), the day line as chips, and short summaries of weather+rain alarm, AH,
//   Canvas, notifications, to-do and check-in. The real tiles simply load (hidden) and a tap on a summary
//   opens their pop-up/page. Data via DASH_WEATHER, DASH_DAYLINE, DASH_CANVAS, DASH.allAlerts(), DASH_CHECKIN.
// - Agenda: own list per day with a day strip (dots per category), a countdown for a deadline today and
//   a rain check under AH shifts; "Week" shows the normal agenda (calendar.js) in week view.
// - Media: big player + lyrics, filter chips (All/Film/Series/F1, Feeds opens the Feeds page), film with
//   a Last watched tab, Episodes, F1, friends, Spotify month.
// - Data: check-in (fill in only), key numbers (Spotify and PC hours this week, AH this month, outside, steps),
//   a spot for Memory Lane, health, and "All charts" to My data.
// Mini player above the tab bar (not on Media) while Spotify has something. Tab in phone.tab and in the address
// (#today, #agenda, #media, #data), so the back button works; other addresses (#checkin-…, #feeds, #canvas) stay
// with their own script. The old address #vandaag still works.
window.DASH_PHONE = (() => {
  const { h, store, fmtTime, startOfDay, addDays, startOfWeek, isAH, dec } = DASH;
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;
  const ICON = {
    today: '<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 1.4 3h-2.8L12 2zm0 20-1.4-3h2.8L12 22zM2 12l3-1.4v2.8L2 12zm20 0-3 1.4v-2.8l3 1.4z"/></svg>',
    agenda: '<svg viewBox="0 0 24 24"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 9v10h14V9H5zm2 2h4v4H7v-4z"/></svg>',
    media: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>',
    data: '<svg viewBox="0 0 24 24"><path d="M5 13h3v7H5v-7zm5.5-5h3v12h-3V8zM16 3h3v17h-3V3z"/></svg>',
  };
  const TABS = [['today', 'Today'], ['agenda', 'Agenda'], ['media', 'Media'], ['data', 'Data']];
  const isTab = (t) => TABS.some(([id]) => id === t);
  const OLD_TAB = { vandaag: 'today' };   // addresses and saved tabs from before 1.7.0

  let active = false, tab = null, timer = null;
  const panes = {};
  for (const [id] of TABS) {
    panes[id] = h('section', 'ph-pane');
    panes[id].dataset.tab = id;
  }
  const hidden = h('div', 'ph-hidden');   // real tiles that do load but aren't shown
  const bar = h('nav', 'ph-bar');
  bar.setAttribute('aria-label', 'Tabs');
  const barBtns = {};
  for (const [id, label] of TABS) {
    const b = h('button', 'ph-tab');
    b.type = 'button';
    b.innerHTML = `<span class="ph-tab-icon">${ICON[id]}</span>`;
    b.append(h('span', 'ph-tab-label', label));
    b.onclick = () => setTab(id, true);
    barBtns[id] = b;
    bar.append(b);
  }

  // Header of the tabs without a top bar
  function header(title, extra) {
    const head = h('div', 'ph-head');
    head.append(h('h2', null, title));
    if (extra) head.append(extra);
    return head;
  }
  const card = (cls, onTap) => {
    const el = h(onTap ? 'button' : 'div', `ph-card ${cls}`);
    if (onTap) { el.type = 'button'; el.onclick = onTap; }
    return el;
  };
  const clickEl = (id) => () => { const el = $(id); if (el) el.click(); };

  // ---------- Switching tabs ----------
  function setTab(id, push) {
    if (OLD_TAB[id]) id = OLD_TAB[id];
    if (!isTab(id)) id = 'today';
    const changed = id !== tab;
    tab = id;
    store.set('phone.tab', id);
    document.body.dataset.phTab = id;
    for (const [t] of TABS) {
      panes[t].hidden = t !== id;
      barBtns[t].setAttribute('aria-current', t === id ? 'page' : 'false');
    }
    if (push && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    if (changed) window.scrollTo(0, 0);
    render();
    mini();
  }
  window.addEventListener('popstate', () => {
    if (!active) return;
    const t = OLD_TAB[location.hash.slice(1)] || location.hash.slice(1);
    if (isTab(t)) setTab(t, false);
    else if (!location.hash) setTab('today', false);
  });

  // ================= Today =================
  const chips = h('div', 'ph-chips');
  const today = h('div', 'ph-today');
  const DOT = { ah: '#00ADE6', rain: 'var(--c-sky)', canvas: 'var(--c-study)', bday: '#c58bff', f1: 'var(--c-f1)' };

  function chip(kind, text, onTap) {
    const c = h(onTap ? 'button' : 'span', 'ph-chip');
    if (onTap) { c.type = 'button'; c.onclick = onTap; }
    const dot = h('i');
    dot.style.background = DOT[kind] || 'var(--muted)';
    c.append(dot, text);
    return c;
  }
  function f1Chip() {
    // Only on a race weekend: the next session if there's one today or tomorrow
    const s = ((store.get('f1.schedule.v2') || {}).sessions || []).filter((x) => x.end > Date.now()).sort((a, b) => a.start - b.start)[0];
    if (!s || s.start - Date.now() > 2 * DAY) return null;
    const live = s.start <= Date.now();
    return chip('f1', `F1 ${s.name.toLowerCase()} ${live ? 'now' : `${DASH.fmtWeekday ? DASH.fmtWeekday(s.start) : ''} ${fmtTime(s.start)}`.trim()}`, () => setTab('media', true));
  }
  function renderChips() {
    const items = (window.DASH_DAYLINE && window.DASH_DAYLINE.items) || [];
    const wx = window.DASH_WEATHER;
    const list = [];
    for (const it of items) {
      if (it.k === 'rain') list.push(chip('rain', wx ? `${Math.round(wx.current.temperature_2m)}° · ${it.t}` : it.t, clickEl('w-weather')));
      else if (it.k === 'ah') list.push(chip('ah', it.t, clickEl('w-ah')));
      else if (it.k === 'canvas') list.push(chip('canvas', it.t, () => window.DASH_CANVAS && DASH_CANVAS.openPage()));
      else list.push(chip(it.k, it.t));
    }
    if (!items.some((it) => it.k === 'rain') && wx) list.splice(1, 0, chip('rain', `${Math.round(wx.current.temperature_2m)}°`, clickEl('w-weather')));
    const f1 = f1Chip();
    if (f1) list.push(f1);
    chips.replaceChildren(...list);
    chips.hidden = !list.length;
  }

  // Weather + rain alarm in one card
  let radar = null;
  function rainLine() {
    if (!radar || !radar.slots.length) return { text: 'Loading rain alarm…', slots: [] };
    const now = Date.now();
    const slots = radar.slots.filter((s) => s.end > now).slice(0, 24);
    const wet = (s) => s.mmh >= DASH.RAIN_MIN;
    const first = slots.find(wet);
    let text;
    if (!first) text = 'No rain in the next 2 hours';
    else if (first.start <= now) {
      const dry = slots.find((s) => !wet(s));
      text = dry ? `Rain until ${fmtTime(dry.start)}` : 'Rain for the next 2 hours';
    } else {
      const lastDry = slots[slots.indexOf(first) - 1];
      text = `Dry until ${fmtTime(lastDry ? lastDry.end : first.start)}`;
    }
    return { text, slots };
  }
  function weatherCard() {
    const el = card('ph-wx', clickEl('w-weather'));
    const wx = window.DASH_WEATHER;
    const left = h('div', 'ph-wx-now');
    if (wx) {
      const c = wx.current;
      const info = window.DASH_WEATHER_INFO;
      const [desc] = info ? info.code(c.weather_code) : [''];
      left.append(h('div', 'ph-big', `${Math.round(c.temperature_2m)}°`), h('div', 'ph-sub', `${desc}${desc ? ' · ' : ''}feels like ${Math.round(c.apparent_temperature)}°`));
    } else left.append(h('div', 'ph-big', '–'), h('div', 'ph-sub', 'Loading weather…'));
    const right = h('div', 'ph-wx-rain');
    const r = rainLine();
    const bars = h('div', 'ph-rainbars');
    const max = Math.max(2, ...r.slots.map((s) => s.mmh));
    for (const s of r.slots) {
      const b = h('i');
      b.style.height = `${Math.max(8, Math.min(100, (s.mmh / max) * 100))}%`;
      if (s.mmh >= DASH.RAIN_MIN) b.className = 'wet';
      bars.append(b);
    }
    right.append(h('span', 'ph-label', 'Buienalarm'), bars, h('b', null, r.text));
    el.append(left, right);
    return el;
  }

  // AH: next shift and hours this week
  function shifts() {
    const cal = window.DASH_CALENDAR;
    return cal && cal.connected ? cal.events.filter(isAH) : null;
  }
  function hoursIn(list, from, to, now) {
    let worked = 0, all = 0;
    for (const s of list) {
      const a = Math.max(s.start, from), b = Math.min(s.end, to);
      if (b <= a) continue;
      all += b - a;
      worked += Math.max(0, Math.min(b, now) - a);
    }
    return { worked: worked / 3600000, all: all / 3600000 };
  }
  const fmtH = (v) => dec(v, v % 1 ? 1 : 0);
  const dayName = (ms) => {
    const d = Math.round((startOfDay(ms) - startOfDay(Date.now())) / DAY);
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  };
  function ahCard() {
    const el = card('ph-ah', clickEl('w-ah'));
    const list = shifts();
    if (!list) { el.append(h('span', 'ph-label', 'AH'), h('div', 'ph-sub', 'Link your agenda (Agenda tab)')); return el; }
    const now = Date.now();
    const week = startOfWeek(now);
    const wk = hoursIn(list, week, addDays(week, 7), now);
    const next = list.filter((s) => s.end > now).sort((a, b) => a.start - b.start)[0];
    const left = h('div');
    left.append(h('span', 'ph-label', 'AH'));
    if (next) {
      left.append(h('div', 'ph-sub', next.start <= now ? 'Working now' : 'Next shift'),
        h('b', 'ph-ah-next', next.start <= now ? `until ${fmtTime(next.end)}` : `${dayName(next.start)} · ${fmtTime(next.start)}–${fmtTime(next.end)}`));
    } else left.append(h('div', 'ph-sub', 'No shift planned'));
    const right = h('div', 'ph-ah-hours');
    right.append(h('b', 'ph-num', `${fmtH(wk.worked)} h`), h('span', null, wk.all > wk.worked ? `this week · ${fmtH(wk.all)} h planned` : 'this week'));
    const prog = h('div', 'ph-prog');
    const fill = h('i');
    fill.style.width = `${wk.all ? Math.min(100, (wk.worked / wk.all) * 100) : 0}%`;
    prog.append(fill);
    el.append(left, right, prog);
    return el;
  }

  // Canvas: the two most urgent + "+N"
  function canvasCard() {
    const C = window.DASH_CANVAS;
    const el = card('ph-canvas', () => C && C.openPage());
    const title = h('span', 'ph-title', 'Canvas');
    el.append(title);
    const all = C && C.items();
    if (!all) { el.append(h('div', 'ph-sub', C ? 'Link your agenda (Agenda tab)' : 'Loading…')); return el; }
    const now = Date.now();
    const open = all.filter((it) => !it.done);
    if (!open.length) { el.append(h('div', 'ph-sub', 'Nothing open 🎉')); return el; }
    title.append(h('small', null, `${open.length} open`));
    for (const it of open.slice(0, 2)) {
      const row = h('div', 'ph-row');
      const dot = h('i', 'ph-dot');
      dot.style.background = it.due < now || it.due - now < DAY ? '#e5484d' : it.due - now < 3 * DAY ? '#e0a53a' : 'var(--c-study)';
      row.append(dot, h('span', 'ph-row-text', it.name), h('span', 'ph-row-when', C.when(it, now)));
      el.append(row);
    }
    return el;
  }

  // Notifications: the last few + mail; tap = everything in a pop-up
  let mailCount = null;
  window.addEventListener('dash:mail', (e) => { mailCount = e.detail ? e.detail.count : null; if (active && tab === 'today') render(); });
  function alertsCard() {
    const list = DASH.allAlerts();
    const el = card('ph-alerts', openAlerts);
    const head = h('div', 'ph-title');
    head.append('Notifications');
    const n = list.length + (mailCount ? 1 : 0);
    if (n) head.append(h('span', 'ph-badge', String(n)));
    if (n > 2) head.append(h('small', null, 'tap for all'));
    el.append(head);
    const rows = [];
    if (mailCount) rows.push(['✉️', `Mail · ${mailCount} unread`, '']);
    for (const a of list) rows.push([a.icon || '•', a.text, a.sub && a.sub.length < 16 ? a.sub : '']);
    if (!rows.length) el.append(h('div', 'ph-sub', 'All quiet'));
    for (const [icon, text, sub] of rows.slice(0, 2)) {
      const r = h('div', 'ph-row');
      r.append(h('span', 'ph-row-icon', icon), h('span', 'ph-row-text', text), h('span', 'ph-row-when', sub));
      el.append(r);
    }
    return el;
  }
  let alertPop = null;
  function openAlerts() {
    if (!alertPop) alertPop = DASH.panel('Notifications', '#a78bfa');
    const fill = () => {
      const box = h('div', 'ph-alert-list');
      if (mailCount) {
        const m = h('a', 'ph-alert');
        m.href = 'https://mail.google.com/';
        m.target = '_blank';
        m.rel = 'noopener';
        m.append(h('span', 'ph-row-icon', '✉️'), h('b', null, `${mailCount} unread mail`));
        box.append(m);
      }
      for (const a of DASH.allAlerts()) {
        const r = h('div', `ph-alert ${a.level || ''}`);
        const txt = h('div', 'ph-alert-txt');
        txt.append(h('b', null, a.text));
        if (a.sub) txt.append(h('span', 'ph-sub', a.sub));
        r.append(h('span', 'ph-row-icon', a.icon || '•'), txt);
        if (a.onClick) { r.classList.add('tap'); r.onclick = () => { alertPop.close(); a.onClick(); }; }
        if (a.onDismiss) {
          const x = h('button', 'ph-x', '✕');
          x.type = 'button';
          x.setAttribute('aria-label', 'Remove');
          x.onclick = (e) => { e.stopPropagation(); a.onDismiss(); setTimeout(fill, 50); };
          r.append(x);
        }
        box.append(r);
      }
      if (!box.children.length) box.append(h('p', 'w-note', 'All quiet.'));
      alertPop.body.replaceChildren(box);
    };
    fill();
    alertPop.open();
  }

  // To-do: tap = the real to-do tile in a pop-up (add, check off)
  function todoCard() {
    const items = (store.get('todo.items') || []).filter((x) => !x.done);
    const el = card('ph-todo', openTodo);
    el.append(h('span', 'ph-title', 'To-do'), h('b', 'ph-num', items.length ? `${items.length} open` : 'Nothing open'));
    if (items[0]) el.append(h('span', 'ph-sub ph-ellipsis', items[0].text));
    return el;
  }
  let todoPop = null;
  function openTodo() {
    const w = $('w-todo');
    if (!w) return;
    if (!todoPop) {
      todoPop = DASH.panel('To-do', '#7fd1a0');
      todoPop.dialog.classList.add('ph-todo-pop');
      todoPop.dialog.addEventListener('close', () => { if (active) hidden.append($('w-todo')); render(); });
    }
    todoPop.body.replaceChildren(w);
    todoPop.open();
  }

  // Check-in: only how many today + button
  function checkinCard() {
    const C = window.DASH_CHECKIN;
    const el = card('ph-checkin');
    const n = C ? C.today() : 0;
    el.append(h('span', 'ph-title', 'Check-in'), h('span', 'ph-sub', n ? `${n}× filled in today` : 'not done yet'));
    const b = h('button', 'ph-btn', 'Check in');
    b.type = 'button';
    b.onclick = () => C && C.open();
    el.append(b);
    return el;
  }

  function renderToday() {
    renderChips();
    const pair = h('div', 'ph-pair');
    pair.append(todoCard(), checkinCard());
    today.replaceChildren(weatherCard(), ahCard(), canvasCard(), alertsCard(), pair);
  }

  // ================= Agenda =================
  let weekStart = startOfWeek(Date.now()), listFrom = null;
  const agView = () => (store.get('phone.agendaView') === 'week' ? 'week' : 'list');
  const agSeg = h('div', 'seg ph-seg');
  for (const [v, label] of [['list', 'List'], ['week', 'Week']]) {
    const b = h('button', null, label);
    b.type = 'button';
    b.dataset.v = v;
    b.onclick = () => { store.set('phone.agendaView', v); renderAgenda(); };
    agSeg.append(b);
  }
  const agNav = h('div', 'ph-weeknav');
  const agPrev = h('button', 'ph-round', '‹');
  const agNext = h('button', 'ph-round', '›');
  const agLabel = h('button', 'ph-weeklabel');
  [agPrev, agNext, agLabel].forEach((b) => { b.type = 'button'; });
  agPrev.setAttribute('aria-label', 'Previous week');
  agNext.setAttribute('aria-label', 'Next week');
  agLabel.title = 'Back to this week';
  agPrev.onclick = () => { weekStart = addDays(weekStart, -7); listFrom = null; renderAgenda(); };
  agNext.onclick = () => { weekStart = addDays(weekStart, 7); listFrom = null; renderAgenda(); };
  agLabel.onclick = () => { weekStart = startOfWeek(Date.now()); listFrom = null; renderAgenda(); };
  agNav.append(agPrev, agLabel, agNext);
  const strip = h('div', 'ph-strip');
  const agList = h('div', 'ph-aglist');

  // The same colors as the agenda (calendar.js colorOf)
  const IS_F1 = /formula\s*1|(^|\W)f1\b/i;
  function colorOf(ev) {
    if (!ev.allDay && /\bAH\b/.test(ev.title)) return '#00ADE6';
    if (IS_F1.test(ev.title)) return '#e10600';
    if (ev.canvas || /\bESSB\b/.test(ev.title)) return '#2fbf71';
    return ev.color || '#8a8aa0';
  }
  const visible = (ev) => !ev.hidden || ev.birthday || ev.canvas;
  const isDeadline = (ev) => ev.canvas && !ev.allDay && ev.end - ev.start < 60000;
  const cleanTitle = (t) => t.replace(/\s*\[[^\]]+\]\s*$/, '').replace(/^[🏁⏱️🏎️\s]+/u, '');
  const onDay = (ev, day) => ev.start < addDays(day, 1) && (ev.end > day || (ev.start >= day && ev.end === ev.start));

  // Rain at an AH shift: leaving 25 min before, then per hour during the shift (Open-Meteo hourly)
  function shiftRain(ev) {
    const wx = window.DASH_WEATHER;
    if (!wx || !wx.hourly || ev.end < Date.now()) return null;
    const hr = wx.hourly.time.map((t, i) => ({ t: t * 1000, mm: wx.hourly.precipitation[i] || 0 }));
    if (!hr.length || ev.start > hr[hr.length - 1].t) return null;
    const at = (ms) => hr.find((x) => ms >= x.t && ms < x.t + 3600000);
    const leave = at(ev.start - 25 * 60000);
    if (!leave) return null;
    const wet = (x) => x && x.mm >= 0.2;
    const during = hr.find((x) => x.t + 3600000 > ev.start && x.t < ev.end && wet(x));
    const first = wet(leave) ? 'Rain when leaving' : 'Dry when leaving';
    if (during && !wet(leave)) return { text: `${first} · rain from ${fmtTime(Math.max(during.t, ev.start))}`, wet: true };
    return { text: during && wet(leave) ? first : `${first}${during ? '' : ' and during your shift'}`, wet: wet(leave) };
  }
  function countdown(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }

  function evRow(ev, day, now) {
    const a = h(ev.link || ev.canvasUrl ? 'a' : 'div', 'ph-ev');
    if (ev.canvasUrl || ev.link) { a.href = ev.canvasUrl || ev.link; a.target = '_blank'; a.rel = 'noopener'; }
    a.style.setProperty('--c', colorOf(ev));
    if (ev.end < now && !(ev.allDay && onDay(ev, startOfDay(now)))) a.classList.add('past');
    const time = ev.allDay ? 'all day' : isDeadline(ev) ? `${fmtTime(ev.end)} · deadline`
      : `${ev.start < day ? '…' : fmtTime(ev.start)} – ${ev.end > addDays(day, 1) ? '…' : fmtTime(ev.end)}`;
    const txt = h('div', 'ph-ev-txt');
    txt.append(h('span', 'ph-ev-time', time), h('b', null, ev.birthday ? `🎂 ${ev.birthday}'s birthday` : cleanTitle(ev.title)));
    if (isAH(ev)) {
      const r = shiftRain(ev);
      if (r) txt.append(h('span', `ph-ev-rain${r.wet ? ' wet' : ''}`, r.text));
    }
    a.append(txt);
    if (isDeadline(ev) && ev.end > now && startOfDay(ev.end) === startOfDay(now)) a.append(h('span', 'ph-ev-count', countdown(ev.end - now)));
    return a;
  }

  function renderAgenda() {
    const cal = window.DASH_CALENDAR;
    const connected = !!(cal && cal.connected);
    const view = connected ? agView() : 'week';
    [...agSeg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
    agSeg.hidden = !connected;
    const calEl = $('calendar');
    // Week = the normal agenda (it has its own previous/next); not linked = its login screen
    if (calEl) {
      calEl.hidden = view !== 'week';
      if (view === 'week' && connected) {
        const wb = calEl.querySelector('[data-view="week"]');
        if (wb && wb.getAttribute('aria-pressed') !== 'true') wb.click();
      }
    }
    [agNav, strip, agList].forEach((el) => { el.hidden = view !== 'list'; });
    if (view !== 'list') return;

    const now = Date.now();
    const thisWeek = startOfWeek(now);
    const events = cal.events.filter(visible);
    const end = addDays(weekStart, 7);
    agLabel.textContent = `${new Date(weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(end - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`.replace(/\./g, '');
    agLabel.disabled = weekStart === thisWeek;

    // Day strip: Mon–Sun with a dot per category (max 3)
    strip.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const b = h('button', 'ph-day');
      b.type = 'button';
      if (day === startOfDay(now)) b.classList.add('today');
      if (listFrom === day) b.classList.add('sel');
      const d = new Date(day);
      b.append(h('span', 'ph-day-name', d.toLocaleDateString('en-GB', { weekday: 'short' }).replace('.', '')), h('b', null, String(d.getDate())));
      const dots = h('span', 'ph-day-dots');
      const colors = [...new Set(events.filter((e) => onDay(e, day)).map(colorOf))].slice(0, 3);
      for (const c of colors) { const dot = h('i'); dot.style.background = c; dots.append(dot); }
      b.append(dots);
      b.onclick = () => {
        listFrom = day;
        renderAgenda();
        const head = agList.querySelector(`[data-day="${day}"]`);
        if (head) head.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      strip.append(b);
    }

    // List per day: from today (this week) or the start of the chosen week, two weeks long
    const from = listFrom != null && listFrom < weekStart + 7 * DAY ? Math.min(listFrom, weekStart === thisWeek ? startOfDay(now) : weekStart)
      : weekStart === thisWeek ? startOfDay(now) : weekStart;
    agList.replaceChildren();
    for (let day = from; day < addDays(weekStart, 14); day = addDays(day, 1)) {
      const list = events.filter((e) => onDay(e, day)).sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
      if (!list.length) continue;
      const diff = Math.round((day - startOfDay(now)) / DAY);
      const date = new Date(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      const head = h('p', 'ph-dayhead', diff === 0 ? `Today · ${date}` : diff === 1 ? `Tomorrow · ${date}` : date);
      head.dataset.day = day;
      agList.append(head, ...list.map((e) => evRow(e, day, now)));
    }
    if (!agList.children.length) agList.append(h('p', 'w-note', 'Nothing planned in these two weeks.'));
  }

  // ================= Media =================
  const KIND = { 'w-stars': 'film', 'w-letterboxd': 'film', 'w-friends': 'film', 'w-episodes': 'series', 'w-f1': 'f1', 'w-sptop': 'music' };
  const mediaChips = h('div', 'ph-filter');
  const filmTabs = h('div', 'seg ph-seg ph-filmtabs');
  const FILTERS = [['all', 'All'], ['film', 'Film'], ['series', 'Series'], ['f1', 'F1'], ['feeds', 'Feeds']];
  for (const [f, label] of FILTERS) {
    const b = h('button', 'ph-fchip', label);
    b.type = 'button';
    b.dataset.f = f;
    b.onclick = () => {
      if (f === 'feeds') { const fb = document.querySelector('.tb-feeds'); if (fb) fb.click(); return; }
      store.set('phone.mediaFilter', f);
      renderMedia();
    };
    mediaChips.append(b);
  }
  for (const [id, label] of [['w-stars', 'Film tonight'], ['w-letterboxd', 'Last watched']]) {
    const b = h('button', null, label);
    b.type = 'button';
    b.dataset.id = id;
    b.onclick = () => { store.set('phone.filmTab', id); renderMedia(); };
    filmTabs.append(b);
  }
  function renderMedia() {
    const f = { alles: 'all' }[store.get('phone.mediaFilter')] || store.get('phone.mediaFilter') || 'all';
    const film = store.get('phone.filmTab') || 'w-stars';
    [...mediaChips.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    [...filmTabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === film)));
    for (const [id, kind] of Object.entries(KIND)) {
      const el = $(id);
      if (!el) continue;
      let show = f === 'all' ? true : kind === f;
      if (id === 'w-sptop') show = f === 'all';
      if (id === 'w-stars' || id === 'w-letterboxd') show = show && id === film;
      el.hidden = !show;
    }
    filmTabs.hidden = !(f === 'all' || f === 'film');
  }

  // ================= Data =================
  const ciBox = h('div', 'ph-card ph-ci');
  function renderCheckin() {
    const C = window.DASH_CHECKIN;
    const head = h('div', 'ph-ci-head');
    head.append(h('span', 'ph-title', 'Check-in'), h('span', 'ph-sub', C && C.today() ? `${C.today()}× today` : 'fill in only'));
    if (!C) { ciBox.replaceChildren(head, h('p', 'ph-sub', 'Loading…')); return; }
    if (ciBox.querySelector('form') && ciBox.dataset.built) { ciBox.firstChild.replaceWith(head); return; }   // half filled in: leave it
    ciBox.dataset.built = '1';
    ciBox.replaceChildren(head, C.form(() => {
      toast('Check-in saved ✓');
      delete ciBox.dataset.built;
      renderCheckin();
    }));
  }
  window.addEventListener('dash:checkin', () => { if (active) { renderCheckin(); if (tab === 'today') render(); } });

  // Key numbers: from the My data summaries (archive token), AH from the agenda, steps live from Health
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
  }
  const kpiBox = h('div', 'ph-kpis');
  let agg = null, aggAt = 0, aggLoading = false, aggError = null;
  async function loadAgg() {
    const D = window.DASH_DATA;
    if (aggLoading || DASH.DEMO || !D || !D.token() || Date.now() - aggAt < 10 * 60000) return;
    aggLoading = true;
    try {
      const out = {};
      await Promise.all(['spotify', 'places', 'computer', 'body'].map(async (g) => {
        const f = await D.read(`data/aggregates/${g}.json`).catch(() => null);
        out[g] = f ? JSON.parse(f.text).daily || {} : {};
      }));
      agg = out;
      aggAt = Date.now();
      aggError = null;
    } catch (e) {
      aggError = e.message;
    } finally {
      aggLoading = false;
      if (active && tab === 'data') renderKpis();
    }
  }
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const last7 = () => Array.from({ length: 7 }, (_, i) => iso(addDays(startOfDay(Date.now()), i - 6)));
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)} min`);
  function latest(series) {
    const keys = Object.keys(series || {}).sort();
    const k = keys[keys.length - 1];
    return k ? { day: k, v: series[k] } : null;
  }
  function demoAgg() {
    const days = last7();
    const r = (i, a, b) => a + ((i * 37) % (b - a));
    return {
      spotify: { minutes: Object.fromEntries(days.map((d, i) => [d, r(i + 3, 20, 110)])) },
      places: { away_min: Object.fromEntries(days.map((d, i) => [d, r(i + 1, 40, 300)])) },
      computer: { pc_active_min: Object.fromEntries(days.map((d, i) => [d, r(i + 5, 120, 420)])) },
      body: { steps: Object.fromEntries(days.map((d, i) => [d, r(i, 3000, 11000)])) },
    };
  }
  function kpi(cls, label, value, sub, extra) {
    const el = h('div', `ph-card ph-kpi ${cls}`);
    el.append(h('span', 'ph-label', label), h('b', 'ph-num', value));
    if (sub) el.append(h('span', 'ph-sub', sub));
    if (extra) el.append(extra);
    return el;
  }
  function miniBars(values) {
    const box = h('div', 'ph-minibars');
    const max = Math.max(1, ...values);
    values.forEach((v, i) => {
      const b = h('i');
      b.style.height = `${Math.max(6, (v / max) * 100)}%`;
      if (i === values.length - 1) b.className = 'today';
      box.append(b);
    });
    return box;
  }
  function renderKpis() {
    const a = DASH.DEMO ? demoAgg() : agg;
    const days = last7();
    const sum = (series) => days.reduce((t, d) => t + (Number((series || {})[d]) || 0), 0);
    const tiles = [];
    // Spotify this week (last 7 days)
    const sp = a && a.spotify.minutes;
    tiles.push(kpi('ph-kpi-sp', 'Spotify · 7 days', sp ? fmtMin(sum(sp)) : '–', null, sp ? miniBars(days.map((d) => Number(sp[d]) || 0)) : null));
    // AH this month (agenda)
    const list = shifts();
    const now = new Date();
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const ah = list ? hoursIn(list, m0, m1, Date.now()) : null;
    tiles.push(kpi('ph-kpi-ah', `AH ${now.toLocaleDateString('en-GB', { month: 'long' })}`, ah ? `${fmtH(ah.worked)} h` : '–', ah ? (ah.all > ah.worked ? `+${fmtH(ah.all - ah.worked)} h planned` : 'worked') : 'agenda needed'));
    // Out of the house (last day with data)
    const away = a && latest(a.places.away_min);
    tiles.push(kpi('ph-kpi-out', 'Out of the house', away ? fmtMin(Number(away.v) || 0) : '–', away ? dayName(Date.parse(`${away.day}T12:00`)) : null));
    // Steps + sleep (live from Health, otherwise the archive)
    const H = window.DASH_HEALTH;
    const todaySteps = H && (H.steps.find((x) => x.day === startOfDay(Date.now())) || {}).count;
    const st = todaySteps != null ? { v: todaySteps, sub: 'today' } : (a && latest(a.body.steps)) ? { v: latest(a.body.steps).v, sub: dayName(Date.parse(`${latest(a.body.steps).day}T12:00`)) } : null;
    const sleep = H && H.sleep ? (H.sleep.asleep != null ? H.sleep.asleep : (H.sleep.end - H.sleep.start) / 60000) : null;
    tiles.push(kpi('ph-kpi-steps', 'Steps', st ? Math.round(st.v).toLocaleString('en-GB') : '–', st ? `${st.sub}${sleep ? ` · ${fmtMin(sleep)} sleep` : ''}` : null));
    // PC hours this week, with bars per day
    const pc = a && a.computer.pc_active_min;
    tiles.push(kpi('ph-kpi-pc ph-wide', 'PC active · 7 days', pc ? `${fmtH(Math.round(sum(pc) / 6) / 10)} h` : '–', null, pc ? miniBars(days.map((d) => Number(pc[d]) || 0)) : null));
    kpiBox.replaceChildren(...tiles);
    if (!DASH.DEMO && !(window.DASH_DATA && DASH_DATA.token())) {
      const note = h('button', 'ph-note-btn', 'Link the data archive for Spotify, outside and PC hours (Settings › Data)');
      note.type = 'button';
      note.onclick = () => window.DASH_SETTINGS && DASH_SETTINGS.open('data');
      kpiBox.append(note);
    } else if (aggError) kpiBox.append(h('p', 'ph-sub ph-wide', `Archive not read: ${aggError}`));
  }
  const memory = h('div', 'ph-card ph-memory');
  memory.append(h('span', 'ph-title', 'Today in the past'), h('span', 'ph-sub', 'Appears here once Memory Lane is here.'));
  const allCharts = h('button', 'ph-link', 'All charts ›');
  allCharts.type = 'button';
  allCharts.onclick = () => { const b = document.querySelector('.tb-mydata'); if (b) b.click(); };

  // ================= Minispeler =================
  const miniEl = h('div', 'ph-mini');
  miniEl.hidden = true;
  const miniCover = h('img', 'ph-mini-cover');
  miniCover.alt = '';
  const miniText = h('button', 'ph-mini-text');
  miniText.type = 'button';
  miniText.onclick = () => setTab('media', true);
  const miniTitle = h('b'), miniArtist = h('span');
  miniText.append(miniTitle, miniArtist);
  const miniPlay = h('button', 'ph-mini-play');
  miniPlay.type = 'button';
  miniPlay.onclick = () => { const p = $('play'); if (p) p.click(); setTimeout(mini, 300); };
  const miniProg = h('i', 'ph-mini-prog');
  miniEl.append(miniCover, miniText, miniPlay, miniProg);
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  function mini() {
    const sp = $('spotify');
    const on = active && tab !== 'media' && sp && sp.dataset.state === 'player' && !!($('title') || {}).textContent;
    miniEl.hidden = !on;
    document.body.classList.toggle('ph-has-mini', !!on);
    if (!on) return;
    miniTitle.textContent = $('title').textContent;
    miniArtist.textContent = ($('artist') || {}).textContent || '';
    const src = ($('cover') || {}).src || '';
    if (miniCover.getAttribute('src') !== src) miniCover.src = src;
    const playing = sp.classList.contains('playing');
    if (miniPlay.dataset.p !== String(playing)) {
      miniPlay.dataset.p = String(playing);
      miniPlay.innerHTML = playing ? PAUSE : PLAY;
      miniPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    miniProg.style.width = (($('fill') || {}).style || {}).width || '0%';
  }

  // Search button in the top bar: on the phone the search bar itself only shows after a tap
  const searchBtn = h('button', 'tb-btn ph-search-btn');
  searchBtn.type = 'button';
  searchBtn.setAttribute('aria-label', 'Search');
  searchBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
  searchBtn.onclick = () => {
    const tb = $('topbar');
    const open = !tb.classList.contains('ph-search-open');
    tb.classList.toggle('ph-search-open', open);
    if (open) tb.querySelector('.tb-search input').focus();
  };

  // ================= Draw everything =================
  function render() {
    if (!active) return;
    try {
      if (tab === 'today') renderToday();
      else if (tab === 'agenda') renderAgenda();
      else if (tab === 'media') renderMedia();
      else if (tab === 'data') { renderCheckin(); renderKpis(); loadAgg(); }
    } catch (e) { console.warn('[phone]', e); }
  }
  let queued = false;
  const soon = () => { if (queued || !active) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); };
  ['dash:calendar', 'dash:weather', 'dash:dayline', 'dash:canvas', 'dash:alerts', 'dash:health', 'dash:data-token'].forEach((ev) => window.addEventListener(ev, soon));
  const loadRadar = () => DASH.radar().then((r) => { radar = r; soon(); }).catch(() => {});

  // ---------- On and off (from desk.js) ----------
  function enter({ remember, put, dash }) {
    active = true;
    const ids = ['media-stack', 'lyrics', 'calendar', 'version', 'w-weather', 'w-rain', 'w-ah', 'w-canvas', 'w-alerts', 'w-mail', 'w-todo', 'w-checkin', 'w-wishes',
      'w-stars', 'w-letterboxd', 'w-friends', 'w-episodes', 'w-f1', 'w-sptop', 'w-health'];
    remember(ids);
    panes.today.replaceChildren(chips, today);
    panes.agenda.replaceChildren(header('Agenda', agSeg), agNav, strip, agList);
    put(panes.agenda, ['calendar']);
    panes.media.replaceChildren(header('Media'), mediaChips);
    put(panes.media, ['media-stack', 'lyrics']);
    panes.media.append(filmTabs);
    put(panes.media, ['w-stars', 'w-letterboxd', 'w-episodes', 'w-f1', 'w-friends', 'w-sptop']);
    panes.data.replaceChildren(header('Data', allCharts), ciBox, kpiBox, memory);
    put(panes.data, ['w-health', 'version']);
    put(hidden, ['w-weather', 'w-rain', 'w-ah', 'w-canvas', 'w-alerts', 'w-mail', 'w-todo', 'w-checkin', 'w-wishes']);
    dash.append(...TABS.map(([id]) => panes[id]), hidden);
    document.body.append(miniEl, bar);
    const actions = document.querySelector('#topbar .tb-actions');
    if (actions) actions.prepend(searchBtn);
    const fromHash = location.hash.slice(1);
    const start = isTab(fromHash) || OLD_TAB[fromHash] ? fromHash : /^checkin/.test(fromHash) ? 'data' : store.get('phone.tab') || 'today';
    if (!location.hash) history.replaceState(null, '', `#${start}`);
    setTab(start, false);
    loadRadar();
    // Mini player every second; Today/Agenda again every minute (countdown, "working now"), no more often: otherwise
    // everything jumps while you tap
    let ticks = 0;
    timer = setInterval(() => { mini(); if (++ticks % 60 === 0 && (tab === 'today' || tab === 'agenda')) soon(); }, 1000);
  }
  DASH.every(5 * 60 * 1000, () => { if (active) loadRadar(); });
  function leave() {
    active = false;
    clearInterval(timer);
    for (const id of Object.keys(KIND)) if ($(id)) $(id).hidden = false;
    if ($('calendar')) $('calendar').hidden = false;
    if (todoPop && todoPop.dialog.open) todoPop.close();
    [...TABS.map(([id]) => panes[id]), hidden, miniEl, bar, searchBtn].forEach((el) => el.remove());
    if ($('topbar')) $('topbar').classList.remove('ph-search-open');
    delete document.body.dataset.phTab;
    document.body.classList.remove('ph-has-mini');
  }

  return { enter, leave, setTab };
})();
