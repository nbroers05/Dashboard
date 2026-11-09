'use strict';

// Het scherm van de planner: dagweergave, weekstrip, lijsten, slepen en de dialogen.
(() => {
  const P = window.PlannerStore;
  const A = window.PlannerAgenda;
  const SNAP = 15;
  const COLORS = ['#7F77DD', '#1D9E75', '#378ADD', '#D4537E', '#D98A1F', '#E24B4A', '#6B6A66'];
  // Kleuren voor wat geen vak is. Ze staan als rij in planner_subjects met een naam die met @ begint, zodat ze meesyncen
  // en er geen nieuwe tabel nodig is. Die rijen tellen nergens als vak mee.
  const CATS = [
    { key: 'agenda', label: 'Google Agenda', color: '#378ADD' },
    { key: 'ah', label: 'AH-dienst', color: '#00ADE6' },
    { key: 'deadline', label: 'Canvas-deadline', color: '#E24B4A' },
    { key: 'bday', label: 'Verjaardag', color: '#D4537E' },
    { key: 'f1', label: 'F1', color: '#E10600' },
    { key: 'block', label: 'Tijdblok zonder vak', color: '#7F77DD' },
    { key: 'task', label: 'Taak zonder vak', color: '#7F77DD' },
    { key: 'now', label: 'Lijn voor nu', color: '#378ADD' },
  ];

  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter((x) => x != null));
    return n;
  }

  // ---------- Datums (dag = 'JJJJ-MM-DD', lokale tijd) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const today = () => keyOf(new Date());
  const mondayOf = (k) => shift(k, -((fromKey(k).getDay() + 6) % 7));
  const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtTime = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const weekday = (k) => fromKey(k).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
  const longDay = (k) => fromKey(k).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDay = (k) => fromKey(k).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dayStart = (k) => fromKey(k).getTime();

  let sel = today();
  let week = mondayOf(sel);
  let lastToday = sel;
  let tlStart = 7;
  let wantScroll = true;
  let dirty = false;

  const tasks = () => P.data.tasks;
  const task = (id) => tasks().find((t) => t.id === id);
  const subject = (id) => P.data.subjects.find((s) => s.id === id);
  const vakken = () => P.data.subjects.filter((s) => !s.name.startsWith('@'));
  const cleanName = (s) => s.trim().replace(/^@+\s*/, '');
  const phone = () => matchMedia('(max-width: 700px)').matches;
  const hourPx = () => parseFloat(document.documentElement.style.getPropertyValue('--hour')) || 48;

  function agendaRange() {
    // Ruim: vakken uit Canvas moeten er ook staan als de eerstvolgende deadline nog ver weg is
    const t = today();
    return [Math.min(dayStart(week), dayStart(shift(t, -35))), Math.max(dayStart(shift(week, 7)), dayStart(shift(t, 90)))];
  }

  // ---------- Kleuren ----------
  const catRow = (key) => P.data.subjects.find((s) => s.name === `@${key}`);
  const catColor = (c) => { const r = catRow(c.key); return r ? r.color : c.color; };
  function setCat(c, color) {
    const r = catRow(c.key);
    if (r) P.updateSubject(r.id, { color }); else P.addSubject(`@${c.key}`, color);
  }
  function inkOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.62 ? '#111' : '#fff';
  }
  function applyColors() {
    const root = document.documentElement.style;
    for (const c of CATS) root.setProperty(`--c-${c.key}`, catColor(c));
    root.setProperty('--c-ah-ink', inkOn(catColor(CATS[1])));
  }

  // ---------- Vakken uit Canvas ----------
  // Elke vakcode wordt één keer een vak. De rij @canvas:<code> onthoudt dat, zodat een hernoemd of verwijderd vak niet terugkomt.
  let importing = false;
  function importCourses() {
    if (importing || !P.ready || A.state !== 'ok') return;
    importing = true;
    for (const code of A.courses()) {
      const mark = `@canvas:${code}`.slice(0, 40);
      if (P.data.subjects.some((s) => s.name === mark)) continue;
      P.addSubject(mark, '#6B6A66');
      P.addSubject(code.slice(0, 40), COLORS[vakken().length % COLORS.length]);
    }
    importing = false;
  }

  // ---------- Licht of donker (per apparaat) ----------
  const THEMES = { auto: 'automatisch', dark: 'donker', light: 'licht' };
  const NEXT_THEME = { auto: 'dark', dark: 'light', light: 'auto' };
  const darkMedia = matchMedia('(prefers-color-scheme: dark)');
  function themeChoice() {
    try { const t = localStorage.getItem('planner.theme'); return THEMES[t] ? t : 'auto'; } catch { return 'auto'; }
  }
  function applyTheme() {
    const t = themeChoice();
    document.documentElement.dataset.theme = t === 'dark' || (t === 'auto' && darkMedia.matches) ? 'dark' : 'light';
    $('theme-btn').textContent = `Thema: ${THEMES[t]}`;
  }

  // ---------- Wat er op een dag staat ----------
  function timedFor(k) {
    const a = dayStart(k), b = dayStart(shift(k, 1));
    return A.normal().filter((e) => !e.allDay && e.start < b && e.end > a).map((ev) => {
      const s = Math.round((Math.max(ev.start, a) - a) / 60000);
      const e = Math.round((Math.min(ev.end, b) - a) / 60000);
      return { ev, s, e };
    });
  }
  function alldayFor(k) {
    const a = dayStart(k), b = dayStart(shift(k, 1));
    const over = (e) => e.start < b && e.end > a;
    return [...A.birthdays().filter(over), ...A.normal().filter((e) => e.allDay && over(e))];
  }
  function deadlinesFor(k) {
    const a = dayStart(k), b = dayStart(shift(k, 1));
    return A.deadlines().filter((d) => d.due >= a && d.due < b);
  }
  const scheduledFor = (k) => tasks().filter((t) => t.day === k && t.start_min != null);
  const looseFor = (k) => tasks().filter((t) => t.day === k && t.start_min == null && t.kind === 'task');
  const overdue = () => tasks().filter((t) => t.kind === 'task' && !t.done && t.day && t.day < today());
  const inbox = () => tasks().filter((t) => t.day == null && t.kind === 'task');

  // ---------- Tekenen ----------
  function render() {
    if (drag) { dirty = true; return; }
    importCourses();
    applyColors();
    fit();
    renderHead();
    renderStrip();
    renderNote();
    renderAllday();
    renderTimeline();
    renderToday();
    renderInbox();
    renderSoon();
  }

  function renderHead() {
    $('title').textContent = longDay(sel);
    document.title = `${capital(longDay(sel))} · Planner`;
    let open = tasks().filter((t) => t.day === sel && t.kind === 'task' && !t.done).length;
    if (sel === today()) open += overdue().length;
    const parts = [open === 0 ? 'geen open taken' : open === 1 ? '1 taak open' : `${open} taken open`];
    const shift0 = timedFor(sel).filter((x) => A.isAH(x.ev)).sort((a, b) => a.s - b.s)[0];
    if (shift0) parts.push(`dienst om ${fmtMin(shift0.s)}`);
    $('subtitle').textContent = capital(parts.join(' · '));
  }

  function renderStrip() {
    const t = today();
    const frag = [];
    for (let i = 0; i < 7; i++) {
      const k = shift(week, i);
      const open = tasks().some((x) => x.day === k && !x.done);
      frag.push(h('button', {
        type: 'button',
        class: `day-btn${k === sel ? ' sel' : ''}${k === t ? ' is-today' : ''}${open ? ' has' : ''}`,
        'data-day': k, 'data-drop': `day:${k}`,
        'aria-current': k === sel ? 'date' : null,
        'aria-label': longDay(k),
      }, h('span', null, weekday(k)), h('span', null, String(fromKey(k).getDate()))));
    }
    $('strip-days').replaceChildren(...frag);
    $('go-today').hidden = sel === t;
  }

  let noteState = null;
  function renderNote() {
    const note = $('agenda-note');
    const state = A.state;
    if (state === noteState) return;
    noteState = state;
    if (state === 'locked') {
      const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Wachtzin van het dashboard', 'aria-label': 'Wachtzin van het dashboard', required: true });
      const err = h('span', { class: 'err', role: 'alert' });
      const form = h('form', null, input, h('button', { class: 'btn', type: 'submit' }, 'Koppelen'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = 'Bezig…';
        try {
          await A.unlock(input.value);
        } catch (x) {
          err.textContent = x.message || 'Koppelen lukt niet';
        }
      });
      note.replaceChildren(h('span', null, 'Agenda niet gekoppeld in deze browser.'), form, err);
      note.hidden = false;
    } else if (state === 'error') {
      note.replaceChildren(h('span', null, 'Agenda kon niet worden bijgewerkt. De planner probeert het zo opnieuw.'));
      note.hidden = false;
    } else {
      note.hidden = true;
      note.replaceChildren();
    }
  }

  function renderAllday() {
    const box = $('tl-allday');
    const items = alldayFor(sel);
    box.hidden = !items.length;
    box.replaceChildren(...items.map((e) => e.birthday
      ? h('span', { class: 'chip-day bday' }, `Verjaardag ${e.birthday}`)
      : h(e.link ? 'a' : 'span', { class: 'chip-day', href: e.link, target: e.link && '_blank', rel: e.link && 'noopener' }, A.label(e))));
  }

  // Overlappende blokken naast elkaar (zelfde aanpak als de weekweergave van het dashboard)
  function lanes(items) {
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    let cluster = [], ends = [], clusterEnd = 0;
    const flush = () => { cluster.forEach((t) => { t.lanes = ends.length; }); cluster = []; ends = []; };
    for (const t of items) {
      const vs = t.s, ve = Math.max(t.e, t.s + 30);
      if (cluster.length && vs >= clusterEnd) flush();
      let lane = ends.findIndex((end) => end <= vs);
      if (lane < 0) { lane = ends.length; ends.push(0); }
      ends[lane] = ve;
      t.lane = lane;
      cluster.push(t);
      clusterEnd = Math.max(clusterEnd, ve);
    }
    flush();
    return items;
  }

  const topCalc = (min) => `calc(var(--hour) * ${(min / 60 - tlStart).toFixed(4)})`;
  const heightCalc = (dur) => `max(20px, calc(var(--hour) * ${(dur / 60).toFixed(4)} - 2px))`;
  const place = (t) => `top:${topCalc(t.s)};height:${heightCalc(t.e - t.s)};left:${(t.lane / t.lanes) * 100}%;width:calc(${100 / t.lanes}% - 3px);`;
  const isSmall = (dur) => (dur / 60) * hourPx() < 40;

  function firstHour() {
    const mins = [...timedFor(sel).map((x) => x.s), ...scheduledFor(sel).map((t) => t.start_min)];
    return Math.min(7, ...mins.map((m) => Math.floor(m / 60)));
  }

  function fit() {
    tlStart = firstHour();
    const root = document.documentElement.style;
    const tl = document.querySelector('.tl');
    if (!phone()) {
      const top = tl.getBoundingClientRect().top + scrollY;
      root.setProperty('--tl-h', `${Math.max(460, Math.floor(innerHeight - top - 66))}px`);
    }
    const scroller = $('tl-scroll');
    const px = Math.max(phone() ? 46 : 36, Math.floor((scroller.clientHeight - 3) / (24 - tlStart)));
    root.setProperty('--hour', `${px}px`);
  }

  function renderTimeline() {
    const grid = $('tl-grid');
    const hours = 24 - tlStart;
    grid.style.height = `calc(var(--hour) * ${hours} + 2px)`;
    const nodes = [];
    for (let i = 0; i < hours; i++) {
      nodes.push(h('div', { class: 'hour', style: `top:calc(var(--hour) * ${i})` }, h('b', null, pad(tlStart + i))));
    }

    const items = [
      ...timedFor(sel).map((x) => ({ ...x, google: true })),
      ...scheduledFor(sel).map((t) => ({ task: t, s: t.start_min, e: Math.min(1440, t.start_min + t.duration_min) })),
    ];
    const box = h('div', { class: 'lanes' });
    const nowMs = Date.now();
    const nowMin = sel === today() ? new Date().getHours() * 60 + new Date().getMinutes() : null;
    for (const it of lanes(items)) box.append(it.google ? googleEl(it, nowMs) : mineEl(it));
    nodes.push(box);

    // Deadlines op dezelfde minuut samen op één lijn
    const lines = new Map();
    for (const d of deadlinesFor(sel)) {
      const dd = new Date(d.due);
      const m = dd.getHours() * 60 + dd.getMinutes();
      if (!lines.has(m)) lines.set(m, []);
      lines.get(m).push(d);
    }
    for (const [m, list] of lines) {
      const text = `${fmtMin(m)} deadline Canvas · ${list.map((d) => d.title).join(', ')}`;
      const label = list.length === 1 && list[0].url
        ? h('a', { href: list[0].url, target: '_blank', rel: 'noopener' }, text)
        : h('span', null, text);
      nodes.push(h('div', { class: 'deadline', style: `top:${topCalc(Math.max(m, 14))}` }, label));
    }

    if (nowMin != null) nodes.push(h('div', { class: 'now', id: 'tl-now', style: `top:${topCalc(nowMin)}` }));
    grid.replaceChildren(...nodes);

    if (wantScroll) {
      wantScroll = false;
      const scroller = $('tl-scroll');
      let target = 8 * 60;
      if (nowMin != null) target = nowMin;
      else if (items.length) target = items[0].s;
      scroller.scrollTop = Math.max(0, (target / 60 - tlStart) * hourPx() - scroller.clientHeight * 0.25);
    }
  }

  function googleEl(it, nowMs) {
    const ev = it.ev;
    const ah = A.isAH(ev);
    const dur = it.e - it.s;
    let sub = `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
    if (!ah) sub += ' · Google Agenda (alleen lezen)';
    else if (ev.start > nowMs && ev.start - nowMs <= 2 * 3600000) {
      const way = A.commute(ev.start);
      if (way) sub += ` · ${way} onderweg`;
    }
    return h(ev.link ? 'a' : 'div', {
      class: `ev${ah ? ' ah' : ''}${A.isF1(ev) ? ' f1' : ''}${ev.end <= nowMs ? ' past' : ''}${isSmall(dur) ? ' small' : ''}`,
      style: place(it), href: ev.link, target: ev.link && '_blank', rel: ev.link && 'noopener',
      title: `${ev.title} (${fmtTime(ev.start)} – ${fmtTime(ev.end)})`,
    }, h('span', { class: 't' }, ah ? 'Appie dienst' : A.label(ev)), h('span', { class: 's' }, sub));
  }

  function mineEl(it) {
    const t = it.task;
    const s = subject(t.subject_id);
    const dur = it.e - it.s;
    const what = t.kind === 'block' ? 'tijdblok' : 'taak ingepland';
    const sub = [`${fmtMin(it.s)} – ${fmtMin(it.e)}`, what, s && s.name].filter(Boolean).join(' · ');
    return h('div', {
      class: `ev mine${t.kind === 'block' ? ' block' : ''}${t.done ? ' done' : ''}${isSmall(dur) ? ' small' : ''}`,
      style: `${place(it)}${s ? `--c:${s.color};` : ''}`, 'data-task': t.id, 'data-edit': t.id,
    },
    h('div', { class: 'ev-row' },
      t.kind === 'task' ? h('input', { type: 'checkbox', 'data-check': t.id, checked: t.done, 'aria-label': `${t.title} afvinken` }) : null,
      h('div', { class: 'ev-text' }, h('span', { class: 't' }, t.title), h('span', { class: 's' }, sub))),
    h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'),
    h('div', { class: 'resize', 'aria-hidden': 'true' }));
  }

  function taskRow(t, extra) {
    const s = subject(t.subject_id);
    return h('li', { class: `task${t.done ? ' done' : ''}`, 'data-task': t.id },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'),
      extra.check ? h('input', { type: 'checkbox', 'data-check': t.id, checked: t.done, 'aria-label': `${t.title} afvinken` }) : null,
      h('button', { class: 'task-title', type: 'button', 'data-edit': t.id, title: t.title }, t.title),
      extra.note ? h('span', { class: extra.noteClass || 'time' }, extra.note) : null,
      s ? h('span', { class: 'tag', style: `--c:${s.color}` }, s.name) : null);
  }

  function renderToday() {
    const isToday = sel === today();
    $('today-title').textContent = isToday ? 'Vandaag' : capital(shortDay(sel));
    const list = $('today-list');
    const rows = [];
    if (isToday) {
      for (const t of overdue().sort((a, b) => a.day.localeCompare(b.day))) {
        rows.push(taskRow(t, { check: true, note: t.day === shift(sel, -1) ? 'gisteren' : `${weekday(t.day)} ${fromKey(t.day).getDate()}`, noteClass: 'late' }));
      }
    }
    const loose = looseFor(sel).sort((a, b) => a.done - b.done);
    for (const t of loose) rows.push(taskRow(t, { check: true }));
    list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'empty' }, 'Nog niets voor deze dag.')]));
    const open = loose.filter((t) => !t.done).length;
    $('today-count').textContent = loose.length ? `${open} open` : '';
  }

  function renderInbox() {
    const rows = inbox().map((t) => taskRow(t, { check: false }));
    $('inbox-list').replaceChildren(...(rows.length ? rows : [h('li', { class: 'empty' }, 'Inbox is leeg.')]));
  }

  function renderSoon() {
    const list = $('soon-list');
    const now = Date.now();
    const a = dayStart(today()), b = dayStart(shift(today(), 7));
    const within = (ms) => ms >= a && ms < b;
    const rows = [];
    for (const d of A.deadlines()) {
      if (d.due >= now && d.due < b) {
        const t = fmtTime(d.due);
        rows.push({ at: d.due, kind: 'deadline-mark', text: `${d.title} (Canvas${t === '23:59' ? '' : ` ${t}`})`, url: d.url });
      }
    }
    for (const e of A.birthdays()) if (within(e.start)) rows.push({ at: e.start, kind: 'bday', text: `verjaardag ${e.birthday}` });
    for (const e of A.normal()) {
      if (e.allDay || e.start < now || e.start >= b) continue;
      if (A.isAH(e)) rows.push({ at: e.start, kind: 'ah', text: `dienst ${fmtTime(e.start)} - ${fmtTime(e.end)}` });
      else if (A.isF1(e)) {
        const name = A.label(e);
        if (!/- FP\d/.test(name)) rows.push({ at: e.start, kind: 'f1', text: `${name} ${fmtTime(e.start)}` });
      }
    }
    rows.sort((x, y) => x.at - y.at);
    if (!rows.length) {
      list.replaceChildren(h('li', { class: 'empty' }, A.state === 'ok' ? 'Niks de komende 7 dagen.' : 'Nog geen agenda.'));
      return;
    }
    list.replaceChildren(...rows.map((r) => {
      const k = keyOf(new Date(r.at));
      return h('li', null,
        h('span', { class: `mark ${r.kind}` }),
        h('span', { class: 'd' }, weekday(k)),
        r.url ? h('a', { class: 'x', href: r.url, target: '_blank', rel: 'noopener', title: r.text }, r.text) : h('span', { class: 'x', title: r.text }, r.text));
    }));
  }

  function tick() {
    const t = today();
    if (t !== lastToday) {
      if (sel === lastToday) { sel = t; week = mondayOf(t); wantScroll = true; }
      lastToday = t;
      A.range(...agendaRange());
    }
    render();   // lijn voor nu, afgelopen blokken, Binnenkort en "droog onderweg" blijven zo kloppen
  }

  // ---------- Dag kiezen ----------
  function goTo(k) {
    sel = k;
    week = mondayOf(k);
    wantScroll = true;
    P.needFrom(week);
    A.range(...agendaRange());
    render();
  }

  // ---------- Slepen (eigen pointer-code: HTML-slepen werkt niet in Firefox op Android) ----------
  let press = null;
  let drag = null;
  let suppressClick = false;

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    const row = e.target.closest('[data-task]');
    if (!row || e.target.closest('input, select, textarea, a')) return;
    const grip = e.target.closest('.grip, .resize');
    if (e.pointerType !== 'mouse' && !grip) return;
    const t = task(row.dataset.task);
    if (!t) return;
    press = { t, row, x: e.clientX, y: e.clientY, id: e.pointerId, resize: !!e.target.closest('.resize') };
  });

  document.addEventListener('pointermove', (e) => {
    if (press && !drag && e.pointerId === press.id) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
      beginDrag(e);
    }
    if (drag && e.pointerId === drag.id) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      updateDrag();
    }
  });

  function beginDrag(e) {
    const { t, row } = press;
    let grab = 0;
    if (row.classList.contains('ev') && !press.resize) grab = ((press.y - row.getBoundingClientRect().top) / hourPx()) * 60;
    drag = {
      ...press, grab, x: e.clientX, y: e.clientY, value: null, minute: null, dur: t.duration_min,
      ghost: h('div', { class: 'ghost' }, t.title),
      preview: h('div', { class: 'ev preview' }, h('span', { class: 't' }, t.title), h('span', { class: 's' })),
    };
    press = null;
    row.classList.add('lifted');
    document.body.classList.add('dragging');
    document.body.append(drag.ghost);
    requestAnimationFrame(autoscroll);
  }

  function clearHighlight() { document.querySelectorAll('.drop-on').forEach((n) => n.classList.remove('drop-on')); }

  function updateDrag() {
    const { x, y, t, ghost, preview } = drag;
    ghost.style.transform = `translate(${x + 12}px, ${y + 10}px)`;
    const under = document.elementFromPoint(x, y);
    let target = under ? under.closest('[data-drop]') : null;
    let value = target ? target.dataset.drop : null;
    if (t.kind === 'block' && (value === 'today' || value === 'inbox')) { target = null; value = null; }
    if (drag.resize) value = 'timeline';
    clearHighlight();
    if (target && value !== 'timeline') target.classList.add('drop-on');
    drag.value = value;

    if (value === 'timeline') {
      const rect = $('tl-grid').getBoundingClientRect();
      const raw = tlStart * 60 + ((y - rect.top) / hourPx()) * 60;
      const snapped = Math.round((raw - drag.grab) / SNAP) * SNAP;
      let start, dur;
      if (drag.resize) {
        start = t.start_min;
        dur = Math.min(1440 - start, Math.max(SNAP, snapped - start));
        drag.dur = dur;
      } else {
        dur = t.duration_min;
        start = Math.max(0, Math.min(1440 - dur, snapped));
        drag.minute = start;
      }
      preview.style.cssText = `top:${topCalc(Math.max(start, tlStart * 60))};height:${heightCalc(dur)};left:0;width:100%;`;
      preview.lastChild.textContent = `${fmtMin(start)} – ${fmtMin(start + dur)}`;
      if (!preview.isConnected) document.querySelector('.lanes').append(preview);
      ghost.hidden = true;
    } else {
      preview.remove();
      ghost.hidden = false;
    }
  }

  function autoscroll() {
    if (!drag) return;
    const { x, y } = drag;
    const scroller = $('tl-scroll');
    const r = scroller.getBoundingClientRect();
    if (x >= r.left && x <= r.right) {
      if (y < r.top + 36 && y > r.top - 30) scroller.scrollTop -= 7;
      else if (y > r.bottom - 36 && y < r.bottom + 30) scroller.scrollTop += 7;
    }
    if (y < 50) scrollBy(0, -10);
    else if (y > innerHeight - 50) scrollBy(0, 10);
    updateDrag();
    requestAnimationFrame(autoscroll);
  }

  function endDrag() {
    const d = drag;
    drag = null;
    press = null;
    d.row.classList.remove('lifted');
    document.body.classList.remove('dragging');
    d.ghost.remove();
    d.preview.remove();
    clearHighlight();
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    return d;
  }

  function dropDrag() {
    const d = endDrag();
    const { t, value } = d;
    let patch = null;
    if (d.resize) { if (d.dur !== t.duration_min) patch = { duration_min: d.dur }; }
    else if (value === 'timeline' && d.minute != null) patch = { day: sel, start_min: d.minute };
    else if (value === 'today') patch = { day: sel, start_min: null };
    else if (value === 'inbox') patch = { day: null, start_min: null, done: false };
    else if (value && value.startsWith('day:')) patch = { day: value.slice(4) };
    if (patch) P.updateTask(t.id, patch);
    else if (dirty) render();
    dirty = false;
  }

  document.addEventListener('pointerup', (e) => {
    if (press && e.pointerId === press.id) press = null;
    if (drag && e.pointerId === drag.id) dropDrag();
  });
  document.addEventListener('pointercancel', (e) => {
    if (press && e.pointerId === press.id) press = null;
    if (drag && e.pointerId === drag.id) { endDrag(); render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) { endDrag(); render(); }
  });
  document.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ---------- Dialoog: taak of tijdblok ----------
  let editing = null;
  let formSubject = null;
  let formColor = COLORS[0];

  function kindValue() { return document.querySelector('input[name="kind"]:checked').value; }

  function renderFormSubjects() {
    const chips = [h('button', { type: 'button', class: `chip${formSubject == null ? ' sel' : ''}`, 'data-subject': '' }, 'Geen')];
    for (const s of vakken()) {
      chips.push(h('button', { type: 'button', class: `chip${formSubject === s.id ? ' sel' : ''}`, 'data-subject': s.id, style: `--c:${s.color}` }, h('span', { class: 'dot' }), s.name));
    }
    chips.push(h('button', { type: 'button', class: 'chip', 'data-subject-new': '' }, '+ Nieuw vak'));
    $('f-subjects').replaceChildren(...chips);
  }

  // Vaste kleuren plus een eigen kleur naar keuze. standard = de oorspronkelijke kleur, als die niet in het rijtje staat.
  function swatches(box, current, onPick, standard) {
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const list = standard && !COLORS.some((c) => same(c, standard)) ? [standard, ...COLORS] : COLORS;
    const buttons = list.map((c) => {
      const on = same(c, current);
      const b = h('button', { type: 'button', class: `swatch${on ? ' sel' : ''}`, style: `--c:${c}`, 'aria-label': `Kleur ${c}`, 'aria-pressed': String(on) });
      b.addEventListener('click', () => onPick(c));
      return b;
    });
    const picker = h('input', { type: 'color', class: 'picker', value: current.toLowerCase(), title: 'Eigen kleur kiezen', 'aria-label': 'Eigen kleur kiezen' });
    picker.addEventListener('change', () => onPick(picker.value));
    box.replaceChildren(...buttons, picker);
  }
  function renderFormSwatches() {
    swatches($('f-swatches'), formColor, (c) => { formColor = c; renderFormSwatches(); });
  }

  function openEdit(t, defaults) {
    editing = t ? t.id : null;
    const v = t || { kind: 'task', title: '', day: sel, start_min: null, duration_min: 60, subject_id: null, ...defaults };
    $('edit-title').textContent = t ? (t.kind === 'block' ? 'Tijdblok' : 'Taak') : 'Nieuw';
    document.querySelector(`input[name="kind"][value="${v.kind}"]`).checked = true;
    $('f-title').value = v.title;
    $('f-day').value = v.day || '';
    $('f-time').value = v.start_min != null ? fmtMin(v.start_min) : '';
    const dur = $('f-dur');
    if (![...dur.options].some((o) => Number(o.value) === v.duration_min)) dur.append(h('option', { value: v.duration_min }, `${v.duration_min} min`));
    dur.value = String(v.duration_min);
    formSubject = v.subject_id;
    formColor = COLORS[vakken().length % COLORS.length];
    $('f-new-subject').hidden = true;
    $('f-subject-name').value = '';
    renderFormSubjects();
    renderFormSwatches();
    $('f-err').textContent = '';
    const del = $('f-delete');
    del.hidden = !t;
    del.textContent = 'Verwijderen';
    delete del.dataset.sure;
    $('edit').showModal();
    if (!t) $('f-title').focus();
  }

  function addFormSubject() {
    const name = cleanName($('f-subject-name').value);
    if (!name) return;
    const s = P.addSubject(name, formColor);
    formSubject = s.id;
    $('f-new-subject').hidden = true;
    $('f-subject-name').value = '';
    renderFormSubjects();
  }

  function saveEdit(e) {
    e.preventDefault();
    const kind = kindValue();
    const title = $('f-title').value.trim();
    const day = $('f-day').value || null;
    const time = $('f-time').value;
    const err = $('f-err');
    if (!title) { err.textContent = 'Geef het een titel.'; return; }
    if (kind === 'block' && (!day || !time)) { err.textContent = 'Een tijdblok heeft een dag en een tijd nodig.'; return; }
    if (time && !day) { err.textContent = 'Kies ook een dag bij de tijd.'; return; }
    const [hh, mm] = time ? time.split(':').map(Number) : [0, 0];
    const fields = {
      kind, title, day,
      start_min: time ? hh * 60 + mm : null,
      duration_min: Number($('f-dur').value),
      subject_id: formSubject,
    };
    if (kind === 'block') fields.done = false;
    if (editing) P.updateTask(editing, fields); else P.addTask(fields);
    $('edit').close();
  }

  // ---------- Dialoog: vakken ----------
  function renderSubjects() {
    $('colors-list').replaceChildren(...CATS.map((c) => {
      const box = h('div', { class: 'swatches' });
      swatches(box, catColor(c), (color) => { setCat(c, color); renderSubjects(); }, c.color);
      return h('li', null, h('span', { class: 'cat-name' }, c.label), box);
    }));
    const list = $('subjects-list');
    if (!vakken().length) { list.replaceChildren(h('li', { class: 'empty' }, 'Nog geen vakken. Ze komen vanzelf uit Canvas zodra je agenda gekoppeld is.')); return; }
    list.replaceChildren(...vakken().map((s) => {
      const name = h('input', { type: 'text', value: s.name, maxlength: 40, 'aria-label': `Naam van ${s.name}` });
      name.addEventListener('change', () => { const v = cleanName(name.value); if (v) P.updateSubject(s.id, { name: v }); else name.value = s.name; });
      const box = h('div', { class: 'swatches' });
      swatches(box, s.color, (c) => { P.updateSubject(s.id, { color: c }); renderSubjects(); });
      const del = h('button', { class: 'x', type: 'button', 'aria-label': `${s.name} verwijderen` }, '×');
      del.addEventListener('click', () => {
        if (confirm(`Vak "${s.name}" verwijderen? De taken blijven staan, alleen zonder vak.`)) { P.deleteSubject(s.id); renderSubjects(); }
      });
      return h('li', null, name, box, del);
    }));
  }
  let subjectColor = COLORS[0];
  function renderSubjectSwatches() {
    swatches($('s-swatches'), subjectColor, (c) => { subjectColor = c; renderSubjectSwatches(); });
  }

  // ---------- Meldingen en status ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }
  function showStatus(s) {
    const n = $('sync');
    n.classList.toggle('offline', s === 'offline');
    n.textContent = s === 'saving' ? 'Opslaan…' : s === 'offline' ? 'Geen verbinding, probeert opnieuw' : P.DEMO ? '' : 'Opgeslagen';
  }

  // ---------- Knoppen ----------
  function wire() {
    $('strip-days').addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]');
      if (b) goTo(b.dataset.day);
    });
    $('week-prev').onclick = () => goTo(shift(sel, -7));
    $('week-next').onclick = () => goTo(shift(sel, 7));
    $('go-today').onclick = () => goTo(today());
    $('new-btn').onclick = () => openEdit(null);

    $('inbox-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('inbox-input');
      const title = input.value.trim();
      if (!title) return;
      P.addTask({ title });
      input.value = '';
    });

    document.addEventListener('change', (e) => {
      const id = e.target.dataset && e.target.dataset.check;
      if (id) P.updateTask(id, { done: e.target.checked });
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('input, a')) return;
      const n = e.target.closest('[data-edit]');
      if (n) { const t = task(n.dataset.edit); if (t) openEdit(t); }
    });

    $('edit-form').addEventListener('submit', saveEdit);
    $('f-cancel').onclick = () => $('edit').close();
    $('f-subjects').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if ('subjectNew' in b.dataset) {
        $('f-new-subject').hidden = false;
        $('f-subject-name').focus();
        return;
      }
      formSubject = b.dataset.subject || null;
      renderFormSubjects();
    });
    $('f-subject-add').onclick = addFormSubject;
    $('f-subject-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addFormSubject(); }
    });
    $('f-delete').onclick = (e) => {
      const b = e.currentTarget;
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Zeker weten?'; return; }
      P.deleteTask(editing);
      $('edit').close();
    };

    $('subjects-btn').onclick = () => {
      subjectColor = COLORS[vakken().length % COLORS.length];
      renderSubjects();
      renderSubjectSwatches();
      $('subjects').showModal();
    };
    $('subjects-close').onclick = () => $('subjects').close();
    $('subjects-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('s-name');
      const name = cleanName(input.value);
      if (!name) return;
      P.addSubject(name, subjectColor);
      input.value = '';
      subjectColor = COLORS[vakken().length % COLORS.length];
      renderSubjects();
      renderSubjectSwatches();
    });

    applyTheme();
    darkMedia.addEventListener('change', applyTheme);
    $('theme-btn').onclick = () => {
      try { localStorage.setItem('planner.theme', NEXT_THEME[themeChoice()]); } catch {}
      applyTheme();
    };

    $('logout-btn').hidden = P.DEMO;
    $('logout-btn').onclick = async () => {
      await P.signOut();
      A.forget();
      location.reload();
    };

    new ResizeObserver(() => { if (!drag) render(); }).observe(document.body);
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); render(); } });
  }

  // ---------- Start ----------
  function boot() {
    $('login').hidden = true;
    $('app').hidden = false;
    $('demo-bar').hidden = !P.DEMO;
    wire();
    P.on('change', render);
    P.on('status', showStatus);
    P.on('error', toast);
    render();
    A.start(...agendaRange(), render);
    P.start(shift(mondayOf(today()), -14));
  }

  function showLogin(message) {
    $('login').hidden = false;
    if (message) $('login-err').textContent = message;
    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      $('login-err').textContent = '';
      try {
        await P.signIn($('login-mail').value.trim(), $('login-pass').value);
        $('login-pass').value = '';
        boot();
      } catch (x) {
        $('login-err').textContent = x.message;
        btn.disabled = false;
      }
    });
  }

  (async () => {
    if (!P.DEMO && !P.configured) { $('setup').hidden = false; return; }
    try {
      await P.init();
    } catch (e) {
      showLogin(e.message);
      return;
    }
    if (await P.session()) boot(); else showLogin();
  })();
})();
