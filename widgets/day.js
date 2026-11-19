'use strict';

// day.exe (Planner v2, since 1.12.0; polished in 1.13.0 and 1.14.0): the day or the week as a timeline with a Today / Week switch. The
// same tile is on the Today tab (instead of the agenda) and on the Planner tab. Everything comes from Google Calendar (DASH_CALENDAR).
// - Names: AH shifts are "Appie" (bright AH blue), school blocks show the full course name (wrapped, no code), F1 is a normal block
//   with its real time ("F1 race"). Click a calendar block: a compact details window (pill, heading, when, where, Google Calendar).
// - All-day events (birthdays, holidays) are a chip under the day header and tint the whole day (softly); tasks with that date are
//   chips with a checkbox. Tasks with a time are small blocks (with a duration: as long as that).
// - One Up line and one Bed line across the week with one label at the left. The timeline runs from Up to Bed. The hours before the
//   first real item (a night F1 session) are squeezed into one thin "night" band, so they don't eat the height. Today: pill in the
//   header, soft tint, red now-line with the time (it sticks to the edge when it is after Bed or before Up); title says WEEK or DAY.
// - Gym: goal 4 a week. Calendar events with "gym" in the title count (solid green); the planner suggests extra moments on free time
//   (dashed green: drag it elsewhere, Go = I went, Skip = drop that day). Went/skipped/moved are shared between devices (sync.js:
//   gym.log, gym.skips, gym.pins). Exposes DASH_GYM.
// - Interactions: click an empty slot = the task window there (Task / Time block, title, day, time, duration); click a task = the same
//   window; drag a task from tasks.exe (or a task or gym block here) onto a day or a time (DASH_DRAG, mouse or long press on touch).
//   Calendar items can't be moved.
DASH.widget('w-day', (card, body, guard) => {
  const { h, store, startOfDay, addDays, startOfWeek, fmtTime, isAH } = DASH;
  const MIN = 60000, HOUR = 3600000;
  const VIEW = 'planner.view', LOG = 'gym.log', SKIP = 'gym.skips', PINS = 'gym.pins', TASKS = 'todo.items';
  const UP = 8 * 60, BED = 23 * 60, GOAL = 4, GYM_MIN = 75, NIGHT_H = 46;
  const GYM_RE = /\b(gym|fitness|workout|training)\b/i;
  const F1_RE = /formula 1|\bF1\b/i;
  const SCHOOL_RE = /rooster|timetable|erasmus|\beur\b|college|lecture|werkgroep|tutorial/i;
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const dmy = (key) => { const [y, m, d] = key.split('-'); return `${d}-${m}-${y}`; };
  const durText = (min) => (min % 60 === 0 ? `${min / 60} h` : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

  let view = store.get(VIEW) === 'week' ? 'week' : 'day';
  let offset = 0;   // days (day view) or weeks (week view) from today

  // ---------- Data ----------
  const cal = () => window.DASH_CALENDAR || { connected: false, events: [] };
  const timed = () => cal().events.filter((e) => !e.canvas && !e.hidden && !e.allDay && e.end > e.start);
  const allDay = () => cal().events.filter((e) => !e.canvas && !e.hidden && e.allDay);
  const isGym = (e) => GYM_RE.test(e.title || '') && !isAH(e);
  const isSchool = (e) => SCHOOL_RE.test(e.calName || '') || SCHOOL_RE.test(e.title || '') || (/\bESSB\b/.test(e.title || '') && !e.canvas);
  const kindOf = (e) => (isAH(e) ? 'ah' : F1_RE.test(e.title) ? 'f1' : isGym(e) ? 'gym' : isSchool(e) ? 'school' : 'ev');
  const log = () => store.get(LOG) || [];
  const skips = () => store.get(SKIP) || {};
  const pins = () => store.get(PINS) || {};
  const tasks = () => store.get(TASKS) || [];
  // Tasks of one day; open tasks without a time that are late show on today too
  const tasksOn = (key, isToday) => tasks().filter((t) => t.due && (t.due === key || (isToday && !t.done && !t.time && t.due < key)));

  // ---------- Names ----------
  const TYPES = [['lecture', /\b(lecture|hoorcollege|college)\b/i], ['skills', /\b(skills?|vaardigheden)\b/i], ['tutorial', /\b(tutorial|werkgroep|workshop|seminar)\b/i]];
  // "ESSB-MP9000 - Advanced Quantitative Methods" -> { code: 'ESSB-MP9000', name: 'Advanced Quantitative Methods', type }
  function course(e) {
    const t = (e.title || '').trim(), m = t.match(/^(\S+(?:\s*\/\s*\S+)*)\s+[-–]\s+(.+)$/);
    const name = m ? m[2] : t;
    let type = '';
    for (const [n, re] of TYPES) if (re.test(name)) { type = n; break; }
    return { code: m ? m[1] : '', name, type };
  }
  function f1Label(e) {
    const s = ((e.title.match(/-\s*([^-]+)$/) || [])[1] || '').toLowerCase();
    const what = /sprint/.test(s) ? (/qualif|shootout/.test(s) ? 'sprint quali' : 'sprint') : /qualif/.test(s) ? 'quali' : /race/.test(s) ? 'race' : /practice/.test(s) ? 'practice' : '';
    return what ? `F1 ${what}` : 'F1';
  }
  const room = (e) => (e.location || '').replace(/\s*\(\d+\s*p\)\s*$/, '').trim();
  // The two lines of a calendar block: [name, detail]
  function lines(kind, e, s, en, compact) {
    const range = `${fmtTime(s)}–${fmtTime(en)}`;
    if (kind === 'ah') return ['Appie', range];
    if (kind === 'school') return [course(e).name, range];
    if (kind === 'f1') return [f1Label(e), range];
    if (kind === 'gym') return ['Gym', en <= Date.now() ? 'done' : `${fmtTime(s)} · fixed`];
    return [e.title, `${range}${room(e) && !compact ? ` · ${room(e)}` : ''}`];
  }

  // First minute of the day's wake line: 08:00, but an early AH shift (cycling 25 min + a bit of time) wins
  function upMin(day) {
    const first = timed().filter((e) => isAH(e) && e.start >= day && e.start < day + 24 * HOUR).sort((a, b) => a.start - b.start)[0];
    if (!first) return UP;
    const m = (first.start - day) / MIN - 60;
    return m < UP ? Math.max(0, Math.round(m / 5) * 5) : UP;
  }

  // Gym this week: { done: days already trained, planned: days with a gym event still to come }
  function week(now) {
    const ws = startOfWeek(now), we = addDays(ws, 7);
    const done = new Set(log().map((l) => l.day).filter((d) => d >= iso(ws) && d < iso(we)));
    const planned = new Set();
    for (const e of timed().filter((x) => isGym(x) && x.start >= ws && x.start < we)) {
      (e.end <= now ? done : planned).add(iso(e.start));
    }
    for (const d of done) planned.delete(d);
    return { ws, we, done, planned };
  }

  // Free slot of GYM_MIN minutes on that day: mornings first, then afternoon, then late evening. null = nothing quiet
  function findSlot(day, now) {
    const dow = (new Date(day).getDay() + 6) % 7;   // Monday = 0
    const weekend = dow >= 5;
    const busy = [];
    for (const e of timed()) {
      if (e.end <= day || e.start >= day + 24 * HOUR) continue;
      const ah = isAH(e);
      busy.push([e.start - (ah ? 25 : 0) * MIN, e.end + (ah ? 30 : 0) * MIN]);
    }
    if (!weekend) busy.push([day + 17 * HOUR, day + 20 * HOUR]);   // busy hours on weekdays
    const lo = Math.max(upMin(day) + 60, weekend ? 10 * 60 : 9 * 60), hi = 22 * 60;
    let best = null;
    for (let m = lo; m + GYM_MIN <= hi; m += 15) {
      const s = day + m * MIN, e = s + GYM_MIN * MIN;
      if (s < now + 20 * MIN) continue;
      if (busy.some(([a, b]) => s < b && e > a)) continue;
      const score = m < 12 * 60 ? 0 : m < 17 * 60 ? 1 : 2;
      if (!best || score < best.score) best = { score, start: s, end: e };
      if (score === 0) break;
    }
    return best;
  }

  // Suggestions for the rest of this week: needed = goal - done - planned; spread over days, never next to a gym day if avoidable.
  // A suggestion you dragged elsewhere (gym.pins, by the day it started on) keeps that moment.
  function suggest(now) {
    const w = week(now);
    const need = GOAL - w.done.size - w.planned.size;
    const out = [];
    if (need <= 0) return { w, list: out };
    const sk = skips(), pn = pins();
    const taken = new Set([...w.done, ...w.planned]);
    const days = [];
    for (let d = startOfDay(now); d < w.we; d = addDays(d, 1)) days.push(d);
    const near = (d) => [-1, 1].some((k) => taken.has(iso(addDays(d, k))));
    for (const strict of [true, false]) {
      for (const d of days) {
        if (out.length >= need) break;
        const key = iso(d);
        if (taken.has(key) || sk[key] || (strict && near(d))) continue;
        const pinned = pn[key] && pn[key] > now ? pn[key] : null;
        const slot = pinned ? { start: pinned, end: pinned + GYM_MIN * MIN } : findSlot(d, now);
        if (!slot) continue;
        out.push({ day: iso(slot.start), origin: key, pinned: !!pinned, ...slot });
        taken.add(key);
        taken.add(iso(slot.start));
      }
    }
    out.sort((a, b) => a.start - b.start);
    out.forEach((s, i) => { s.nth = w.done.size + w.planned.size + i + 1; });
    return { w, list: out };
  }

  const dropPin = (s) => { const p = pins(); if (p[s.origin]) { delete p[s.origin]; store.set(PINS, p); } };
  const go = (s) => { dropPin(s); store.set(LOG, [...log().filter((l) => l.day !== s.day), { day: s.day, at: Date.now(), start: s.start, end: s.end }]); changed(); };
  const skip = (s) => { dropPin(s); store.set(SKIP, { ...skips(), [s.origin || s.day]: Date.now() }); changed(); };
  const movePin = (s, start) => { store.set(PINS, { ...pins(), [s.origin || s.day]: start }); changed(); };
  // Old skips, pins and log entries (older than this week) are dropped when drawing
  function cleanup() {
    const ws = iso(startOfWeek(Date.now()));
    const sk = skips(), keep = Object.fromEntries(Object.entries(sk).filter(([d]) => d >= ws));
    if (Object.keys(keep).length !== Object.keys(sk).length) store.set(SKIP, keep);
    const pn = pins(), keepP = Object.fromEntries(Object.entries(pn).filter(([d]) => d >= ws));
    if (Object.keys(keepP).length !== Object.keys(pn).length) store.set(PINS, keepP);
    const lg = log().filter((l) => l.day >= ws);
    if (lg.length !== log().length) store.set(LOG, lg);
  }
  function changed() { window.dispatchEvent(new CustomEvent('dash:gym')); render(); }
  window.DASH_GYM = { goal: GOAL, suggest: () => suggest(Date.now()), slot: (d) => findSlot(d, Date.now()), week: () => { const w = week(Date.now()); return { done: w.done.size, planned: w.planned.size }; } };

  // ---------- Dragging (also used by tasks.exe): mouse = move a few pixels, touch = long press ----------
  const DRAG = (() => {
    let st = null, ghost = null, marked = [];
    const mark = (loc) => {
      marked.forEach((el) => el.classList.remove('dx-drop'));
      marked = loc ? [...document.querySelectorAll(`[data-day="${loc.day}"]`)] : [];
      marked.forEach((el) => el.classList.add('dx-drop'));
    };
    const nope = (e) => { if (st && st.active) e.preventDefault(); };
    function begin() {
      st.active = true;
      ghost = h('div', 'dx-ghost');
      document.body.append(ghost);
      document.body.classList.add('dx-dragging');
      place(st.x, st.y);
    }
    function place(x, y) {
      st.x = x; st.y = y;
      const loc = DRAG.locate ? DRAG.locate(x, y) : null;
      ghost.textContent = `${st.opt.label}${loc ? ` → ${new Date(loc.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}${loc.min != null ? ` ${hhmm(loc.min)}` : ''}` : ''}`;
      ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
      mark(loc);
    }
    function move(e) {
      if (!st || e.pointerId !== st.id) return;
      if (!st.active) {
        const d = Math.hypot(e.clientX - st.x0, e.clientY - st.y0);
        if (st.touch) { if (d > 8) end(); return; }
        if (d > 5) begin(); else return;
      }
      place(e.clientX, e.clientY);
    }
    function up(e) {
      if (!st || e.pointerId !== st.id) return;
      const was = st.active, opt = st.opt;
      const loc = was && DRAG.locate ? DRAG.locate(e.clientX, e.clientY) : null;
      end();
      if (was) {
        const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', stop, true), 80);
        if (loc) opt.onDrop(loc);
      }
    }
    function end() {
      if (!st) return;
      clearTimeout(st.timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', nope);
      if (ghost) ghost.remove();
      ghost = null;
      mark(null);
      document.body.classList.remove('dx-dragging');
      st = null;
    }
    return {
      locate: null,
      start(e, opt) {
        if (st || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const touch = e.pointerType !== 'mouse';
        st = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, opt, active: false, touch, timer: null };
        if (touch) st.timer = setTimeout(() => { if (st) begin(); }, 350);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('touchmove', nope, { passive: false });
      },
    };
  })();
  window.DASH_DRAG = DRAG;

  // Which day / minute is under a point? { day, min } (min = null over a header or chip area). The night band is squeezed: inverse map.
  DRAG.locate = (x, y) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!card.contains(el)) continue;
      const col = el.closest('.dx-col');
      if (col) {
        const r = col.getBoundingClientRect(), d = col.dataset, lo = Number(d.lo), lo2 = Number(d.lo2), hi = Number(d.hi), px = Number(d.px), nh = Number(d.nh);
        const yr = y - r.top;
        const raw = nh && yr < nh ? lo + (yr / nh) * (lo2 - lo) : lo2 + ((yr - nh) / px) * 60;
        return { day: Number(d.day), min: Math.max(lo, Math.min(hi - 15, Math.round(raw / 15) * 15)) };
      }
      const cell = el.closest('[data-day]');
      if (cell) return { day: Number(cell.dataset.day), min: null };
    }
    return null;
  };

  // ---------- Pop-ups: calendar details, and the task window ----------
  const detail = h('dialog', 'panel-dialog dx-pop dx-detail');
  detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });
  card.append(detail);
  function openDetails(e, kind) {
    const c = kind === 'school' ? course(e) : null;
    const heading = kind === 'ah' ? 'Appie' : kind === 'school' ? c.name : kind === 'f1' ? f1Label(e) : e.title;
    const sub = kind === 'school' ? [c.type ? c.type[0].toUpperCase() + c.type.slice(1) : '', c.code].filter(Boolean).join(' · ') : (heading !== e.title ? e.title : '');
    const pillText = kind === 'school' ? 'School' : kind === 'f1' ? 'F1' : kind === 'gym' ? 'Gym' : (e.calName && e.calName.length <= 24 ? e.calName : '');
    const rows = [];
    if (pillText) {
      const pill = h('span', 'dx-d-pill', pillText);
      pill.prepend(h('i'));
      pill.style.setProperty('--ec', kind === 'ah' ? 'var(--ah-c, #00ADE6)' : kind === 'school' ? '#8f86d8' : kind === 'f1' ? '#d9b46a' : kind === 'gym' ? '#3fae74' : e.color || '#8a8aa0');
      rows.push(pill);
    }
    rows.push(h('b', 'dx-d-title', heading));
    if (sub) rows.push(h('p', 'dx-d-sub', sub));
    const grid = h('div', 'dx-d-grid');
    const when = e.allDay ? `${fmtDate(e.start)} · all day` : `${fmtDate(e.start)} · ${fmtTime(e.start)}–${fmtTime(e.end)} (${durText(Math.round((e.end - e.start) / MIN))})`;
    grid.append(h('span', null, 'When'), h('span', null, when));
    if (room(e)) grid.append(h('span', null, 'Where'), h('span', null, room(e)));
    rows.push(h('hr'), grid);
    const foot = h('div', 'dx-d-foot');
    if (e.link) { const a = h('a', 'dx-btn', 'Open in Google Calendar'); a.href = e.link; a.target = '_blank'; a.rel = 'noopener'; foot.append(a); }
    const close = h('button', 'dx-btn', 'Close');
    close.type = 'button';
    close.onclick = () => detail.close();
    foot.append(close);
    detail.replaceChildren(...rows, foot);
    detail.showModal();
  }

  // The task window (the old planner's window as the model): Task / Time block, Title, Day (+ quick chips), Time, Duration
  const tdlg = h('dialog', 'panel-dialog dx-pop dx-taskwin');
  tdlg.addEventListener('click', (e) => { if (e.target === tdlg) tdlg.close(); });
  card.append(tdlg);
  const DURS = [15, 30, 45, 60, 90, 120, 180, 240];
  function openTask(t, def) {
    let mode = t && t.time && t.dur ? 'block' : 'task';
    let day = t ? t.due : def ? iso(def.day) : iso(Date.now());
    const f = h('form', 'dx-tf');
    const seg = h('div', 'dx-tseg');
    const mkSeg = (id, label) => { const b = h('button', null, label); b.type = 'button'; b.onclick = () => { mode = id; draw(); }; return b; };
    const sTask = mkSeg('task', 'Task'), sBlock = mkSeg('block', 'Time block');
    seg.append(sTask, sBlock);
    const title = h('input');
    title.value = t ? t.text : '';
    title.maxLength = 200;
    title.placeholder = 'New task';
    title.setAttribute('aria-label', 'Title');
    const dateIn = h('input', 'dx-date');
    dateIn.placeholder = 'dd-mm-yyyy';
    dateIn.inputMode = 'numeric';
    dateIn.maxLength = 10;
    dateIn.setAttribute('aria-label', 'Day (dd-mm-yyyy)');
    const pick = h('button', 'dx-btn dx-pickb', '▾');
    pick.type = 'button';
    pick.title = 'Pick a day';
    pick.onclick = () => window.DASH_TASKS && DASH_TASKS.pickDay(pick, day, (d) => { day = d; draw(); }, true);
    const chips = h('div', 'tk-chips');
    const today = iso(Date.now()), tomorrow = iso(addDays(startOfDay(Date.now()), 1));
    const chipBtns = [['Today', today], ['Tomorrow', tomorrow], ['No day', undefined]].map(([label, val]) => {
      const b = h('button', 'tk-chip', label);
      b.type = 'button';
      b.onclick = () => { day = val; draw(); };
      b.dataset.val = val || '';
      return b;
    });
    chips.append(...chipBtns);
    const timeIn = h('input', 'dx-time');
    timeIn.placeholder = '--:--';
    timeIn.inputMode = 'numeric';
    timeIn.maxLength = 5;
    timeIn.value = t && t.time ? t.time : def && def.min != null ? hhmm(def.min) : '';
    timeIn.setAttribute('aria-label', 'Time (24 h)');
    const dur = h('select');
    for (const m of DURS) { const o = h('option', null, durText(m)); o.value = String(m); dur.append(o); }
    dur.value = String(t && t.dur ? t.dur : 60);
    const hint = h('p', 'dx-hint');
    const err = h('p', 'dx-err');
    const label = (txt, el, cls) => { const l = h('label', cls); l.append(h('span', null, txt), el); return l; };
    function draw() {
      sTask.setAttribute('aria-pressed', String(mode === 'task'));
      sBlock.setAttribute('aria-pressed', String(mode === 'block'));
      dateIn.value = day ? dmy(day) : '';
      chipBtns.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.val || undefined) === day)));
      dur.disabled = mode !== 'block';
      hint.textContent = mode === 'block' ? 'A time block needs a day and a time; it shows in the timeline as long as the duration.' : 'No day = Later. No time = only in that day\'s chip row.';
    }
    const dayBox = h('span', 'dx-dayin');
    dayBox.append(dateIn, pick);
    const when = h('div', 'dx-trow');
    when.append(label('Day', dayBox), label('Time', timeIn), label('Duration', dur));
    const foot = h('div', 'dx-d-foot dx-tfoot');
    if (t) { const del = h('button', 'dx-btn dx-del', 'Delete'); del.type = 'button'; del.onclick = () => { DASH_TASKS.remove(t.id); tdlg.close(); }; foot.append(del); }
    const cancel = h('button', 'dx-btn', 'Cancel'), save = h('button', 'dx-btn dx-primary', 'Save');
    cancel.type = 'button';
    cancel.onclick = () => tdlg.close();
    foot.append(h('span', 'dx-grow'), cancel, save);
    f.append(h('b', 'dx-d-title', t ? 'Edit task' : 'New task'), seg, label('Title', title), chips, when, hint, err, foot);
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const text = title.value.trim();
      if (!text) { err.textContent = 'Give it a title.'; return; }
      let due = day;
      const typed = dateIn.value.trim();
      if (typed && typed !== (day ? dmy(day) : '')) {
        const m = typed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        const d = m && new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        if (!d || d.getMonth() !== Number(m[2]) - 1) { err.textContent = 'Day as dd-mm-yyyy, for example 20-11-2026.'; return; }
        due = iso(d.getTime());
      } else if (!typed) due = undefined;
      let time = timeIn.value.trim();
      if (time) {
        const m = time.match(/^(\d{1,2})[:.](\d{2})$/);
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) { err.textContent = 'Time as 24 h, for example 14:30.'; return; }
        time = `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
      } else time = undefined;
      if (mode === 'block' && (!due || !time)) { err.textContent = 'A time block needs a day and a time.'; return; }
      if (time && !due) { err.textContent = 'A time needs a day.'; return; }
      const durMin = mode === 'block' ? Number(dur.value) : undefined;
      if (t) DASH_TASKS.update(t.id, { text, due, time, dur: durMin });
      else DASH_TASKS.add(text, due, time, durMin);
      tdlg.close();
    };
    tdlg.replaceChildren(f);
    draw();
    tdlg.showModal();
    title.focus();
  }

  // ---------- Drawing ----------
  const head = h('div', 'dx-head');
  const seg = h('div', 'dx-seg');
  const segBtns = [['day', 'Today'], ['week', 'Week']].map(([id, label]) => {
    const b = h('button', null, label);
    b.type = 'button';
    b.onclick = () => { view = id; offset = 0; store.set(VIEW, id); placed = false; render(); setTimeout(toNow, 50); };
    return b;
  });
  seg.append(...segBtns);
  const title = h('span', 'dx-title');
  const prev = h('button', 'dx-nav', '‹'), next = h('button', 'dx-nav', '›');
  [prev, next].forEach((b, i) => { b.type = 'button'; b.setAttribute('aria-label', i ? 'Next' : 'Previous'); b.onclick = () => { offset += i ? 1 : -1; if (view === 'week') offset = Math.max(offset, -4); render(); }; });
  const meta = h('span', 'dx-meta');
  head.append(prev, next, meta, title, seg);
  const scroll = h('div', 'dx-scroll');
  body.replaceChildren(head, scroll);
  const eyebrow = card.querySelector(':scope > .eyebrow');
  card.dataset.nhDyn = '1';   // housestyle.js leaves the window title to us (WEEK / DAY)
  function setWindowTitle() {
    const [name, kanji] = view === 'week' ? ['week', '週'] : ['day', '日'];
    Object.assign(card.dataset, { nhExe: `${name}.exe`, nhName: name, nhKanji: kanji });
    if (eyebrow) { Object.assign(eyebrow.dataset, { nhExe: `${name}.exe`, nhName: name, nhKanji: kanji }); eyebrow.textContent = name[0].toUpperCase() + name.slice(1); }
  }

  // Overlapping items side by side
  function lanes(list) {
    const sorted = [...list].sort((a, b) => a.s - b.s || b.e - a.e);
    const cols = [];
    for (const it of sorted) {
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.e;
      it.col = c;
    }
    for (const it of sorted) {
      const over = sorted.filter((o) => o.s < it.e && o.e > it.s);
      it.n = Math.max(...over.map((o) => o.col)) + 1;
    }
    return sorted;
  }

  const taskBox = (t, extra) => {
    const l = h('div', `dx-tk${t.done ? ' done' : ''}${extra || ''}`);
    const c = h('input');
    c.type = 'checkbox';
    c.checked = !!t.done;
    c.setAttribute('aria-label', `Check off "${t.text}"`);
    c.onchange = () => window.DASH_TASKS && DASH_TASKS.update(t.id, { done: c.checked });
    l.append(c, h('span', null, t.text));
    l.title = `${t.text}${t.time ? ` · ${t.time}` : ''} (click to edit, drag to move)`;
    l.addEventListener('click', (e) => { if (e.target !== c) openTask(t); });
    l.addEventListener('pointerdown', (e) => {
      if (e.target === c) return;
      DRAG.start(e, { label: t.text, onDrop: (loc) => window.DASH_TASKS && DASH_TASKS.update(t.id, { due: iso(loc.day), time: loc.min != null ? hhmm(loc.min) : undefined }) });
    });
    return l;
  };

  // Everything with a time on one day: { kind, s, e, ev|g|t }
  function dayItems(day, sugg) {
    const items = [];
    const gymCal = new Set();
    for (const ev of timed()) {
      if (ev.end <= day || ev.start >= day + 24 * HOUR) continue;
      const s = Math.max(ev.start, day), en = Math.min(ev.end, day + 24 * HOUR), kind = kindOf(ev);
      if (kind === 'gym') gymCal.add(iso(day));
      items.push({ kind, s, e: en, ev });
    }
    for (const l of log()) if (l.day === iso(day) && l.start && !gymCal.has(l.day)) items.push({ kind: 'gym', s: l.start, e: l.end || l.start + GYM_MIN * MIN, done: true });
    for (const g of sugg.filter((x) => x.day === iso(day))) items.push({ kind: 'sug', g, s: g.start, e: g.end });
    for (const t of tasksOn(iso(day), false)) {
      if (!t.time) continue;
      const [hh, mm] = t.time.split(':').map(Number), s = day + (hh * 60 + mm) * MIN;
      items.push({ kind: 'task', t, s, e: s + (t.dur || 30) * MIN });
    }
    return items;
  }

  function column(day, ctx, items) {
    const { px, lo, lo2, hi, now, compact, nh } = ctx;
    const isToday = day === startOfDay(now);
    const col = h('div', `dx-col${compact ? ' compact' : ''}${isToday && compact ? ' today' : ''}`);   // the tint only in the week (the day view says "today" in its title)
    Object.assign(col.dataset, { day, lo, lo2, hi, px, nh });
    const H = nh + ((hi - lo2) / 60) * px;
    col.style.height = `${H}px`;
    col.style.setProperty('--hr', `${px}px`);
    col.style.setProperty('--off', `${nh}px`);
    if (ctx.tint) col.style.setProperty('--dxt', ctx.tint);
    const yMin = (m) => (m < lo2 ? (nh ? ((m - lo) / (lo2 - lo)) * nh : 0) : nh + ((m - lo2) / 60) * px);
    const y = (ms) => yMin((ms - day) / MIN);
    for (const it of lanes(items)) {
      const night = nh && (it.s - day) / MIN < lo2 && (it.e - day) / MIN <= lo2 + 60;   // lives in the squeezed band
      const top = Math.max(0, y(it.s));
      const minH = it.kind === 'sug' ? 46 : night ? 15 : 22;
      const height = Math.max(minH, y(it.e) - y(it.s) - 2);
      const b = h('div', `dx-ev dx-${it.kind}${night ? ' dx-nightev' : ''}${it.kind === 'task' && it.t.dur ? ' dx-tblock' : ''}`);
      b.style.top = `${top}px`;
      b.style.height = `${height}px`;
      b.style.left = `calc(${(it.col / it.n) * 100}% + 1px)`;
      b.style.width = `calc(${100 / it.n}% - 3px)`;
      if (it.kind === 'sug') {
        const g = it.g;
        b.append(h('b', null, `Gym? ${fmtTime(g.start)}`));
        const act = h('span', 'dx-act');
        const goB = h('button', 'dx-go', 'Go'), skB = h('button', 'dx-skip', 'Skip');
        goB.type = skB.type = 'button';
        goB.title = `I went (${ORD(g.nth)} this week)`;
        skB.title = 'Drop this day, move to the next quiet moment';
        goB.onclick = guard(() => go(g));
        skB.onclick = guard(() => skip(g));
        act.append(h('i', null, 'drag ·'), goB, skB);
        b.append(act);
        b.title = `Gym? ${fmtTime(g.start)}–${fmtTime(g.end)} · ${ORD(g.nth)} this week · drag to move`;
        b.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; DRAG.start(e, { label: 'Gym', onDrop: (loc) => { const m = loc.min != null ? loc.min : (g.start - startOfDay(g.start)) / MIN; if (loc.day + m * MIN > Date.now()) movePin(g, loc.day + m * MIN); } }); });
      } else if (it.kind === 'task') {
        b.append(taskBox(it.t));
      } else if (it.kind === 'gym' && it.done) {
        b.append(h('b', null, 'Gym'), h('span', null, `${fmtTime(it.s)} · done`));
      } else {
        const [a, d] = lines(it.kind, it.ev, it.s, it.e, compact);
        if (night) b.append(h('b', null, `${a} ${fmtTime(it.s)}`));
        else b.append(h('b', null, a), h('span', null, d));
        b.title = `${it.ev.title} · ${fmtTime(it.s)}–${fmtTime(it.e)}`;
        if (it.kind === 'ev' && it.ev.color) b.style.setProperty('--ec', it.ev.color);
        b.onclick = () => openDetails(it.ev, it.kind);
      }
      col.append(b);
    }
    // An earlier Up (early shift) than the week's line: a short mark in this column
    const up = upMin(day);
    if (up < UP) {
      const t = h('div', 'dx-uptick');
      t.style.top = `${yMin(up)}px`;
      t.title = `Up ${hhmm(up)} (early shift)`;
      col.append(t);
    }
    if (isToday) {   // after Bed or before Up the line sticks to the edge, with the time in a small label
      const n = h('div', 'dx-now');
      n.style.top = `${Math.max(0, Math.min(H - 3, y(now)))}px`;
      n.append(h('span', null, fmtTime(now)));
      col.append(n);
    }
    col.addEventListener('click', guard((e) => { if (e.target === col) { const loc = DRAG.locate(e.clientX, e.clientY); if (loc && loc.min != null) openTask(null, loc); } }));
    return col;
  }
  const ORD = (n) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][n - 1] || `${n}th`;

  const chipFor = (e) => {
    const c = h('button', 'dx-chip', e.birthday ? `${e.birthday} 🎂` : e.title);
    c.type = 'button';
    c.title = e.title;
    if (e.color) c.style.setProperty('--ec', e.color);
    c.onclick = () => openDetails(e, 'ev');
    return c;
  };

  // The timeline window for these days: lo = earliest start (a night F1 session), lo2 = where the real day starts (Up, or an earlier
  // real item); the hours lo..lo2 are squeezed into the night band when that is 2 hours or more. hi = Bed or the latest end.
  function range(days, sugg) {
    let lo = UP, lo2 = UP, hi = BED;
    for (const d of days) {
      lo2 = Math.min(lo2, upMin(d));
      for (const it of dayItems(d, sugg)) {
        const s = (it.s - d) / MIN;
        lo = Math.min(lo, s);
        if (it.kind !== 'f1') lo2 = Math.min(lo2, s);
        hi = Math.max(hi, (it.e - d) / MIN);
      }
    }
    lo = Math.max(0, Math.floor(Math.min(lo, lo2) / 60) * 60);
    lo2 = Math.max(lo, Math.floor(lo2 / 60) * 60);
    if (lo2 - lo < 120) lo2 = lo;   // not worth a band
    return { lo, lo2, hi: Math.min(24 * 60, Math.ceil(hi / 60) * 60) };
  }

  const fills = () => !!card.closest('.ag-layer, .desk');
  let lastH = 0;
  function render() {
    cleanup();
    setWindowTitle();
    const now = Date.now(), today = startOfDay(now);
    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (view === 'day'))));
    const c = cal();
    if (!c.connected) {
      title.textContent = '';
      prev.hidden = next.hidden = true;
      meta.textContent = '';
      scroll.replaceChildren(h('p', 'w-note', 'Link your agenda to see your day here (Settings › Log in).'));
      return;
    }
    prev.hidden = next.hidden = false;
    const s = suggest(now), w = s.w;
    meta.textContent = `Gym ${w.done.size} of ${GOAL}${w.planned.size ? ` · ${w.planned.size} planned` : ''}`;
    const days = view === 'day' ? [addDays(today, offset)] : Array.from({ length: 7 }, (_, i) => addDays(addDays(startOfWeek(now), offset * 7), i));
    const sugg = offset === 0 || view === 'day' ? s.list : [];
    const { lo, lo2, hi } = range(days, sugg);
    const nh = lo2 > lo ? NIGHT_H : 0;
    const compact = view === 'week';
    // Chips per day: all-day events (also the days in between) and tasks without a time
    const chips = days.map((d) => {
      const key = iso(d), isToday = d === today;
      const ad = allDay().filter((e) => e.start < d + 24 * HOUR && e.end > d);
      const tk = tasksOn(key, isToday).filter((t) => !t.time);
      return { ad, tk };
    });
    const rows = Math.max(0, ...chips.map((x) => (view === 'week' ? x.ad.length + x.tk.length : Math.ceil((x.ad.length + x.tk.length) / 4))));
    const overhead = (compact ? 28 : 0) + (rows ? rows * 24 + 6 : 0) + 24 + nh;
    const base = compact ? 30 : 42;
    const hours = (hi - lo2) / 60;
    const px = fills() && scroll.clientHeight ? Math.max(base, Math.min(90, Math.floor((scroll.clientHeight - overhead) / hours))) : base;
    const ctx = { px, lo, lo2, hi, now, compact, nh };
    const sc = scroll.scrollTop;
    const yMin = (m) => (m < lo2 ? (nh ? ((m - lo) / (lo2 - lo)) * nh : 0) : nh + ((m - lo2) / 60) * px);
    const H = nh + hours * px;

    const gutter = h('div', 'dx-gutter');
    gutter.style.height = `${H}px`;
    const label = (m, text, cls) => { const t = h('span', cls, text); t.style.top = `${yMin(m)}px`; gutter.append(t); };
    for (let m = Math.ceil(lo2 / 60) * 60; m < hi; m += 60) if (Math.abs(m - UP) >= 30 && Math.abs(m - BED) >= 30) label(m, hhmm(m));
    if (nh) { const t = h('span', 'dx-gl night', 'night'); t.style.top = `${nh / 2}px`; gutter.append(t); }
    label(UP, `Up ${String(UP / 60).padStart(2, '0')}`, 'dx-gl up');
    label(BED, `Bed ${BED / 60}`, 'dx-gl bed');

    const topRow = h('div', 'dx-top');
    const headRow = h('div', 'dx-row dx-headrow');
    const chipRow = h('div', 'dx-row dx-chiprow');
    const cols = h('div', 'dx-cols');
    const spacer = () => h('div', 'dx-gutter-pad');
    if (compact) headRow.append(spacer());
    chipRow.append(spacer());
    days.forEach((d, i) => {
      const isToday = d === today, tint = chips[i].ad[0] && (chips[i].ad[0].color || '#8a8aa0');
      const cell = (el, cls) => { el.dataset.day = d; el.classList.add(...cls.split(' ')); if (tint) el.style.setProperty('--dxt', tint); if (isToday) el.classList.add('today'); return el; };
      if (compact) {
        const lab = new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
        const hd = cell(h('div'), 'dx-headcell');
        hd.append(isToday ? h('span', 'dx-pill', `${lab} today`) : h('span', null, lab));
        headRow.append(hd);
      }
      const cc = cell(h('div'), 'dx-chipcell');
      for (const e of chips[i].ad) cc.append(chipFor(e));
      for (const t of chips[i].tk) cc.append(taskBox(t, t.due < iso(d) ? ' late' : ''));
      chipRow.append(cc);
      cols.append(column(d, { ...ctx, tint }, dayItems(d, sugg)));
    });
    if (nh) { const band = h('div', 'dx-night'); band.style.height = `${nh}px`; cols.append(band); }
    // One Up line and one Bed line across all days
    for (const [m, cls] of [[UP, 'up'], [BED, 'bed']]) {
      const ln = h('div', `dx-line ${cls}`);
      ln.style.top = `${yMin(m)}px`;
      cols.append(ln);
    }
    if (compact) topRow.append(headRow);
    if (rows) topRow.append(chipRow);
    const bodyRow = h('div', 'dx-row dx-bodyrow');
    bodyRow.append(gutter, cols);
    if (view === 'day') {
      title.replaceChildren(document.createTextNode(fmtDate(days[0])), ...(days[0] === today ? [h('span', 'dx-pill', 'today')] : []));
      topRow.classList.add('dx-single');
    } else {
      const ws = days[0];
      title.textContent = `${new Date(ws).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(addDays(ws, 6)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    }
    scroll.replaceChildren(...(topRow.childElementCount ? [topRow] : []), bodyRow);
    scroll.classList.toggle('dx-weekview', compact);
    scroll.scrollTop = sc;
  }

  let placed = false;
  function toNow() {
    if (placed || !scroll.clientHeight) return;
    placed = true;
    if (scroll.scrollHeight <= scroll.clientHeight + 6) return;   // everything fits: no need to scroll
    const col = scroll.querySelector('.dx-col.today') || scroll.querySelector('.dx-col');
    if (!col) return;
    const px = Number(col.dataset.px), lo2 = Number(col.dataset.lo2), nh = Number(col.dataset.nh), nowMin = (Date.now() - startOfDay(Date.now())) / MIN;
    scroll.scrollTop = Math.max(0, nh + ((nowMin - lo2) / 60 - 1) * px);
  }
  window.addEventListener('dash:calendar', guard(render));
  window.addEventListener('dash:tasks', guard(render));
  window.addEventListener('dash:layout', guard(() => { placed = false; setTimeout(toNow, 300); }));
  window.addEventListener('storage', guard((e) => { if ([LOG, SKIP, PINS, TASKS].includes(e.key)) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if ([LOG, SKIP, PINS].includes(e.detail.key)) { window.dispatchEvent(new CustomEvent('dash:gym')); render(); } else if (e.detail.key === TASKS) render(); }));
  window.addEventListener('resize', guard(() => { if (fills() && Math.abs(scroll.clientHeight - lastH) > 8) { lastH = scroll.clientHeight; render(); } }));
  DASH.every(60 * 1000, guard(render));
  render();
  setTimeout(toNow, 600);
});
