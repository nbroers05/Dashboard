'use strict';

// day.exe (Planner v2, since 1.12.0; polished in 1.13.0): the day or the week as a timeline with a Today / Week switch. The same tile
// is on the Today tab (instead of the agenda) and on the Planner tab. Everything comes from Google Calendar (DASH_CALENDAR).
// - Short names: AH shifts are "Appie" (bright AH blue), courses get a short name + type (AQM lecture, PPE tutorial) + room; you can
//   change the short name once per course in the details (day.names). F1 is a normal block with its real time ("F1 race"). The full
//   title only shows in the details (click a block).
// - All-day events (birthdays, holidays) are a chip under the day header and tint the whole day; tasks with that date are chips too,
//   with a checkbox. Tasks with a time are small blocks in the timeline.
// - One Up line and one Bed line across the week (labels at the left). The timeline runs from Up to Bed; an early shift or a night
//   F1 session stretches it upward. Today: pill in the header, light tint, red now-line with the time.
// - Gym: goal 4 a week. Calendar events with "gym" in the title count (solid green); the planner suggests extra moments on free time
//   (dashed green: drag it elsewhere, Go = I went, Skip = drop that day). Went/skipped/moved are shared between devices (sync.js:
//   gym.log, gym.skips, gym.pins). Exposes DASH_GYM.
// - Interactions: click an empty slot = new task there; drag a task from tasks.exe (or a task or gym block here) onto a day or a time
//   (DASH_DRAG, works with mouse and with a long press on touch); click a calendar block = details. Calendar items can't be moved.
DASH.widget('w-day', (card, body, guard) => {
  const { h, store, startOfDay, addDays, startOfWeek, fmtTime, isAH } = DASH;
  const MIN = 60000, HOUR = 3600000;
  const VIEW = 'planner.view', LOG = 'gym.log', SKIP = 'gym.skips', PINS = 'gym.pins', NAMES = 'day.names', TASKS = 'todo.items';
  const UP = 8 * 60, BED = 23 * 60, GOAL = 4, GYM_MIN = 75;
  const GYM_RE = /\b(gym|fitness|workout|training)\b/i;
  const F1_RE = /formula 1|\bF1\b/i;
  const SCHOOL_RE = /rooster|timetable|erasmus|\beur\b|college|lecture|werkgroep|tutorial/i;
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

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
  const names = () => store.get(NAMES) || {};
  const tasks = () => store.get(TASKS) || [];
  // Tasks of one day; open tasks without a time that are late show on today too
  const tasksOn = (key, isToday) => tasks().filter((t) => t.due && (t.due === key || (isToday && !t.done && !t.time && t.due < key)));

  // ---------- Short names ----------
  const TYPES = [['lecture', /\b(lecture|hoorcollege|college)\b/i], ['skills', /\b(skills?|vaardigheden)\b/i], ['tutorial', /\b(tutorial|werkgroep|workshop|seminar)\b/i]];
  const SMALL = /^(and|of|the|in|to|for|a|an|on|en|de|het|van|voor|met|&)$/i;
  function course(e) {
    let t = (e.title || '').replace(/\[[^\]]*\]/g, '');
    let type = '';
    for (const [n, re] of TYPES) if (re.test(t)) { type = n; t = t.replace(re, ''); break; }
    t = t.replace(/[-–:|·()]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { key: (t || e.title || '').toLowerCase(), base: t || e.title || '', type };
  }
  function shortOf(c) {
    const saved = names()[c.key];
    if (saved) return saved;
    const words = c.base.split(/\s+/).filter(Boolean), sig = words.filter((w) => !SMALL.test(w));
    if (sig.length >= 2) return sig.map((w) => w[0]).join('').toUpperCase().slice(0, 5);
    const w = sig[0] || words[0] || c.base;
    return w.length > 10 ? `${w.slice(0, 9)}…` : w;
  }
  function f1Label(e) {
    const s = ((e.title.match(/-\s*([^-]+)$/) || [])[1] || '').toLowerCase();
    const what = /sprint/.test(s) ? (/qualif|shootout/.test(s) ? 'sprint quali' : 'sprint') : /qualif/.test(s) ? 'quali' : /race/.test(s) ? 'race' : /practice/.test(s) ? 'practice' : '';
    return what ? `F1 ${what}` : 'F1';
  }
  // The two lines of a calendar block: [name, detail]
  function lines(kind, e, s, en, compact) {
    const range = `${fmtTime(s)}–${fmtTime(en)}`;
    if (kind === 'ah') return ['Appie', range];
    if (kind === 'school') { const c = course(e); return [`${shortOf(c)}${c.type ? ` ${c.type}` : ''}`, `${range}${e.location && !compact ? ` · ${e.location.replace(/^.*\s(?=\S+$)/, '')}` : ''}`]; }
    if (kind === 'f1') return [f1Label(e), range];
    if (kind === 'gym') return ['Gym', en <= Date.now() ? 'done' : `${fmtTime(s)} · fixed`];
    return [e.title, `${range}${e.location && !compact ? ` · ${e.location}` : ''}`];
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
        if (st.touch) { if (d > 8) end(true); return; }
        if (d > 5) begin(); else return;
      }
      place(e.clientX, e.clientY);
    }
    function up(e) {
      if (!st || e.pointerId !== st.id) return;
      const was = st.active, opt = st.opt;
      const loc = was && DRAG.locate ? DRAG.locate(e.clientX, e.clientY) : null;
      end(false);
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

  // Which day / minute is under a point? { day, min } (min = null over a header or chip area)
  DRAG.locate = (x, y) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!card.contains(el)) continue;
      const col = el.closest('.dx-col');
      if (col) {
        const r = col.getBoundingClientRect(), lo = Number(col.dataset.lo), hi = Number(col.dataset.hi), px = Number(col.dataset.px);
        const m = Math.round((lo + ((y - r.top) / px) * 60) / 15) * 15;
        return { day: Number(col.dataset.day), min: Math.max(lo, Math.min(hi - 15, m)) };
      }
      const cell = el.closest('[data-day]');
      if (cell) return { day: Number(cell.dataset.day), min: null };
    }
    return null;
  };

  // ---------- Pop-ups: details and "new task here" ----------
  const detail = h('dialog', 'panel-dialog dx-detail');
  detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });
  card.append(detail);
  function openDetails(e, kind) {
    const rows = [h('b', 'dx-d-title', e.title)];
    rows.push(h('p', 'dx-d-when', e.allDay ? `${fmtDate(e.start)} · all day` : `${fmtDate(e.start)} · ${fmtTime(e.start)}–${fmtTime(e.end)}`));
    if (e.location) rows.push(h('p', null, `Room / place: ${e.location}`));
    if (e.calName) rows.push(h('p', 'w-sub', e.calName));
    if (kind === 'school') {
      const c = course(e);
      const f = h('form', 'dx-d-short');
      const inp = h('input');
      inp.value = shortOf(c);
      inp.maxLength = 12;
      inp.setAttribute('aria-label', 'Short name for this course');
      const sv = h('button', 'w-btn', 'Save');
      f.append(h('span', null, 'Short name'), inp, sv);
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const n = { ...names() }, v = inp.value.trim();
        if (v) n[c.key] = v; else delete n[c.key];
        store.set(NAMES, n);
        detail.close();
        render();
      };
      rows.push(f);
    }
    const foot = h('div', 'dx-d-foot');
    if (e.link) { const a = h('a', 'w-btn', 'Open in Google Calendar'); a.href = e.link; a.target = '_blank'; a.rel = 'noopener'; foot.append(a); }
    const close = h('button', 'w-btn ghost', 'Close');
    close.type = 'button';
    close.onclick = () => detail.close();
    foot.append(close);
    detail.replaceChildren(...rows, foot);
    detail.showModal();
  }

  const quick = h('dialog', 'panel-dialog dx-quick');
  quick.addEventListener('click', (e) => { if (e.target === quick) quick.close(); });
  const qForm = h('form'), qWhen = h('b'), qIn = h('input');
  qIn.placeholder = 'New task, then Enter';
  qIn.maxLength = 200;
  qForm.append(qWhen, qIn);
  quick.append(qForm);
  card.append(quick);
  let qAt = null;
  qForm.onsubmit = (e) => {
    e.preventDefault();
    const t = qIn.value.trim();
    if (t && qAt && window.DASH_TASKS) DASH_TASKS.add(t, iso(qAt.day), hhmm(qAt.min));
    qIn.value = '';
    quick.close();
  };
  function newTaskAt(loc) {
    qAt = loc;
    qWhen.textContent = `New task · ${new Date(loc.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(loc.min)}`;
    quick.showModal();
    qIn.focus();
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
    l.title = t.text;
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
      items.push({ kind: 'task', t, s, e: s + 30 * MIN });
    }
    return items;
  }

  function column(day, ctx, items) {
    const { px, lo, hi, now, compact } = ctx;
    const isToday = day === startOfDay(now);
    const col = h('div', `dx-col${compact ? ' compact' : ''}${isToday && compact ? ' today' : ''}`);   // the tint only in the week (the day view says "today" in its title)
    Object.assign(col.dataset, { day, lo, hi, px });
    col.style.height = `${((hi - lo) / 60) * px}px`;
    col.style.setProperty('--hr', `${px}px`);
    if (ctx.tint) col.style.setProperty('--dxt', ctx.tint);
    const y = (ms) => ((ms - day) / MIN - lo) / 60 * px;
    for (const it of lanes(items)) {
      const top = Math.max(0, y(it.s)), height = Math.max(20, y(it.e) - y(it.s) - 2);
      const b = h('div', `dx-ev dx-${it.kind}`);
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
        b.append(h('b', null, a), h('span', null, d));
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
      t.style.top = `${((up - lo) / 60) * px}px`;
      t.title = `Up ${hhmm(up)} (early shift)`;
      col.append(t);
    }
    if (isToday && y(now) >= 0 && y(now) <= ((hi - lo) / 60) * px) {
      const n = h('div', 'dx-now');
      n.style.top = `${y(now)}px`;
      n.append(h('span', null, fmtTime(now)));
      col.append(n);
    }
    col.addEventListener('click', guard((e) => { if (e.target === col) { const loc = DRAG.locate(e.clientX, e.clientY); if (loc && loc.min != null) newTaskAt(loc); } }));
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

  // The timeline window for these days: from Up (earlier if an event starts earlier) to Bed (later if an event ends later)
  function range(days, sugg) {
    let lo = UP, hi = BED;
    for (const d of days) {
      lo = Math.min(lo, upMin(d));
      for (const it of dayItems(d, sugg)) { lo = Math.min(lo, (it.s - d) / MIN); hi = Math.max(hi, (it.e - d) / MIN); }
    }
    return { lo: Math.max(0, Math.floor(lo / 60) * 60), hi: Math.min(24 * 60, Math.ceil(hi / 60) * 60) };
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
    const { lo, hi } = range(days, sugg);
    const compact = view === 'week';
    // Chips per day: all-day events (also the days in between) and tasks without a time
    const chips = days.map((d) => {
      const key = iso(d), isToday = d === today;
      const ad = allDay().filter((e) => e.start < d + 24 * HOUR && e.end > d);
      const tk = tasksOn(key, isToday).filter((t) => !t.time);
      return { ad, tk };
    });
    const rows = Math.max(0, ...chips.map((x) => (view === 'week' ? x.ad.length + x.tk.length : Math.ceil((x.ad.length + x.tk.length) / 4))));
    const overhead = (compact ? 28 : 0) + (rows ? rows * 24 + 6 : 0) + 24;
    const base = compact ? 30 : 42;
    const px = fills() && scroll.clientHeight ? Math.max(base, Math.min(90, Math.floor((scroll.clientHeight - overhead) / ((hi - lo) / 60)))) : base;
    const ctx = { px, lo, hi, now, compact };
    const sc = scroll.scrollTop;

    const gutter = h('div', 'dx-gutter');
    gutter.style.height = `${((hi - lo) / 60) * px}px`;
    const hourLabel = (m, text, cls) => { const t = h('span', cls, text); t.style.top = `${((m - lo) / 60) * px}px`; gutter.append(t); };
    for (let m = lo; m < hi; m += 60) if (Math.abs(m - UP) >= 30 && Math.abs(m - BED) >= 30) hourLabel(m, hhmm(m));
    hourLabel(UP, `Up ${String(UP / 60).padStart(2, '0')}`, 'dx-gl up');
    hourLabel(BED, `Bed ${BED / 60}`, 'dx-gl bed');

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
        const label = new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
        const hd = cell(h('div'), 'dx-headcell');
        hd.append(isToday ? h('span', 'dx-pill', `${label} today`) : h('span', null, label));
        headRow.append(hd);
      }
      const cc = cell(h('div'), 'dx-chipcell');
      for (const e of chips[i].ad) cc.append(chipFor(e));
      for (const t of chips[i].tk) cc.append(taskBox(t, t.due < iso(d) ? ' late' : ''));
      chipRow.append(cc);
      const items = dayItems(d, sugg);
      const col = column(d, { ...ctx, tint }, items);
      cols.append(col);
    });
    // One Up line and one Bed line across all days
    for (const [m, cls] of [[UP, 'up'], [BED, 'bed']]) {
      const ln = h('div', `dx-line ${cls}`);
      ln.style.top = `${((m - lo) / 60) * px}px`;
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
    const px = Number(col.dataset.px), lo = Number(col.dataset.lo), nowMin = (Date.now() - startOfDay(Date.now())) / MIN;
    scroll.scrollTop = Math.max(0, ((nowMin - lo) / 60 - 1) * px);
  }
  window.addEventListener('dash:calendar', guard(render));
  window.addEventListener('dash:tasks', guard(render));
  window.addEventListener('dash:layout', guard(() => { placed = false; setTimeout(toNow, 300); }));
  window.addEventListener('storage', guard((e) => { if ([LOG, SKIP, PINS, NAMES, TASKS].includes(e.key)) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if ([LOG, SKIP, PINS].includes(e.detail.key)) { window.dispatchEvent(new CustomEvent('dash:gym')); render(); } else if ([NAMES, TASKS].includes(e.detail.key)) render(); }));
  window.addEventListener('resize', guard(() => { if (fills() && Math.abs(scroll.clientHeight - lastH) > 8) { lastH = scroll.clientHeight; render(); } }));
  DASH.every(60 * 1000, guard(render));
  render();
  setTimeout(toNow, 600);
});
