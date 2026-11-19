'use strict';

// day.exe (Planner v2, since 1.12.0): the day as a timeline with a Today / Week switch. Same tile on the Today tab (instead of
// the agenda) and on the Planner tab. Everything comes from Google Calendar (DASH_CALENDAR): school, AH (bright AH blue),
// birthdays and other appointments. Fixed lines: "Up 08:00" (an early AH shift wins) and "Bed 23:00" (goal: sleep 23:00-08:00).
// Gym: goal 4 times a week. Calendar events with "gym" in the title count (Tuesday and Thursday are already in the week); the
// planner suggests extra moments on free time (around AH and school, not weekdays 17:00-20:00, mornings first). A suggestion is
// dashed with Go (= I went, one tap) and Skip (the whole day is dropped, the next quiet moment comes up). Nothing else is
// scheduled automatically. Went/skipped are shared between devices (gym.log, gym.skips in sync.js). Exposes DASH_GYM.
DASH.widget('w-day', (card, body, guard) => {
  const { h, store, startOfDay, addDays, startOfWeek, fmtTime, isAH } = DASH;
  const MIN = 60000, HOUR = 3600000;
  const VIEW = 'planner.view', LOG = 'gym.log', SKIP = 'gym.skips';
  const UP = 8 * 60, BED = 23 * 60, GOAL = 4, GYM_MIN = 75;
  const GYM_RE = /\b(gym|fitness|workout|training)\b/i;
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

  let view = store.get(VIEW) === 'week' ? 'week' : 'day';
  let offset = 0;   // days from today (day view)

  // ---------- Data ----------
  const cal = () => window.DASH_CALENDAR || { connected: false, events: [] };
  const timed = () => cal().events.filter((e) => !e.canvas && !e.hidden && !e.allDay && e.end > e.start);
  const allDay = () => cal().events.filter((e) => !e.canvas && !e.hidden && e.allDay);
  const isGym = (e) => GYM_RE.test(e.title || '') && !isAH(e);
  const log = () => store.get(LOG) || [];
  const skips = () => store.get(SKIP) || {};

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

  // Suggestions for the rest of this week: needed = goal - done - planned; spread over days, never next to a gym day if avoidable
  function suggest(now) {
    const w = week(now);
    const need = GOAL - w.done.size - w.planned.size;
    const out = [];
    if (need <= 0) return { w, list: out };
    const sk = skips();
    const taken = new Set([...w.done, ...w.planned]);
    const days = [];
    for (let d = startOfDay(now); d < w.we; d = addDays(d, 1)) days.push(d);
    const near = (d) => [-1, 1].some((k) => taken.has(iso(addDays(d, k))));
    for (const strict of [true, false]) {
      for (const d of days) {
        if (out.length >= need) break;
        const key = iso(d);
        if (taken.has(key) || sk[key] || (strict && near(d))) continue;
        const slot = findSlot(d, now);
        if (!slot) continue;
        out.push({ day: key, ...slot });
        taken.add(key);
      }
    }
    out.sort((a, b) => a.start - b.start);
    out.forEach((s, i) => { s.nth = w.done.size + w.planned.size + i + 1; });
    return { w, list: out };
  }

  const go = (s) => { store.set(LOG, [...log().filter((l) => l.day !== s.day), { day: s.day, at: Date.now() }]); changed(); };
  const skip = (s) => { store.set(SKIP, { ...skips(), [s.day]: Date.now() }); changed(); };
  // Old skips (older than this week) are dropped when drawing
  function cleanup() {
    const ws = iso(startOfWeek(Date.now()));
    const sk = skips(), keep = Object.fromEntries(Object.entries(sk).filter(([d]) => d >= ws));
    if (Object.keys(keep).length !== Object.keys(sk).length) store.set(SKIP, keep);
    const lg = log().filter((l) => l.day >= ws);
    if (lg.length !== log().length) store.set(LOG, lg);
  }
  function changed() { window.dispatchEvent(new CustomEvent('dash:gym')); render(); }
  window.DASH_GYM = { goal: GOAL, suggest: () => suggest(Date.now()), slot: (d) => findSlot(d, Date.now()), week: () => { const w = week(Date.now()); return { done: w.done.size, planned: w.planned.size }; } };

  // ---------- Drawing ----------
  const head = h('div', 'dx-head');
  const seg = h('div', 'dx-seg');
  const segBtns = [['day', 'Today'], ['week', 'Week']].map(([id, label]) => {
    const b = h('button', null, label);
    b.type = 'button';
    b.onclick = () => { view = id; offset = 0; store.set(VIEW, id); render(); };
    return b;
  });
  seg.append(...segBtns);
  const title = h('span', 'dx-title');
  const prev = h('button', 'dx-nav', '‹'), next = h('button', 'dx-nav', '›');
  [prev, next].forEach((b, i) => { b.type = 'button'; b.setAttribute('aria-label', i ? 'Next' : 'Previous'); b.onclick = () => { offset += i ? 1 : -1; if (view === 'week') offset = Math.max(offset, -4); render(); }; });
  head.append(prev, title, next, seg);
  const meta = h('p', 'dx-meta');
  const scroll = h('div', 'dx-scroll');
  body.replaceChildren(head, meta, scroll);

  // Overlapping events side by side
  function lanes(list) {
    const sorted = [...list].sort((a, b) => a.s - b.s || b.e - a.e);
    const cols = [];
    for (const it of sorted) {
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.e;
      it.col = c;
    }
    // width: the number of lanes that overlap it
    for (const it of sorted) {
      const over = sorted.filter((o) => o.s < it.e && o.e > it.s);
      it.n = Math.max(...over.map((o) => o.col)) + 1;
    }
    return sorted;
  }

  function column(day, now, px, startMin, endMin, sugg, compact) {
    const col = h('div', `dx-col${compact ? ' compact' : ''}`);
    col.style.height = `${((endMin - startMin) / 60) * px}px`;
    col.style.setProperty('--hr', `${px}px`);
    const y = (ms) => ((ms - day) / MIN - startMin) / 60 * px;
    const items = [];
    for (const e of timed()) {
      if (e.end <= day || e.start >= day + 24 * HOUR) continue;
      const s = Math.max(e.start, day), en = Math.min(e.end, day + 24 * HOUR);
      items.push({ kind: isAH(e) ? 'ah' : isGym(e) ? 'gym' : 'ev', e, s, en: en, e2: en, ev: e });
    }
    for (const g of sugg.filter((x) => x.day === iso(day))) items.push({ kind: 'sug', g, s: g.start, en: g.end, ev: null });
    const laid = lanes(items.map((it) => ({ ...it, e: it.en })));
    for (const it of laid) {
      const top = Math.max(0, y(it.s)), height = Math.max(compact ? 16 : 22, y(it.en) - y(it.s) - 2);
      const b = h('div', `dx-ev dx-${it.kind}`);
      b.style.top = `${top}px`;
      b.style.height = `${height}px`;
      b.style.left = `calc(${(it.col / it.n) * 100}% + 1px)`;
      b.style.width = `calc(${100 / it.n}% - 3px)`;
      if (it.kind === 'ev' && it.ev.color) b.style.setProperty('--ec', it.ev.color);
      if (it.kind === 'sug') {
        const g = it.g;
        b.append(h('b', null, 'Gym?'), h('span', null, `${fmtTime(g.start)}–${fmtTime(g.end)} · ${ORD[g.nth - 1] || `${g.nth}th`} this week`));
        const act = h('span', 'dx-act');
        const goB = h('button', 'dx-go', 'Go'), skB = h('button', 'dx-skip', 'Skip');
        goB.type = skB.type = 'button';
        goB.title = 'I went';
        skB.title = 'Move to the next quiet moment';
        goB.onclick = guard(() => go(g));
        skB.onclick = guard(() => skip(g));
        act.append(goB, skB);
        b.append(act);
      } else {
        const t = it.ev.title;
        b.append(h('b', null, t), h('span', null, `${fmtTime(it.s)}–${fmtTime(it.en)}${!compact && it.ev.location ? ` · ${it.ev.location}` : ''}`));
        b.title = `${t} ${fmtTime(it.s)}–${fmtTime(it.en)}`;
      }
      col.append(b);
    }
    // Fixed lines
    const up = upMin(day), up_ = h('div', 'dx-line dx-up');
    up_.style.top = `${((up - startMin) / 60) * px}px`;
    up_.append(h('span', null, `Up ${hhmm(up)}`));
    const bed = h('div', 'dx-line dx-bed');
    bed.style.top = `${((BED - startMin) / 60) * px}px`;
    bed.append(h('span', null, compact ? `Bed ${hhmm(BED)}` : `Bed ${hhmm(BED)} · phone away`));
    col.append(up_, bed);
    if (day === startOfDay(now)) {
      const n = h('div', 'dx-now');
      n.style.top = `${y(now)}px`;
      col.append(n);
    }
    return col;
  }

  // Hour height: fixed on the Today tab of tall (the tile scrolls), but filled up in the Planner layer and on desk
  const fills = () => !!card.closest('.ag-layer, .desk');
  function pxNow() {
    const base = view === 'week' ? 30 : 42;
    if (!fills() || !scroll.clientHeight) return base;
    return Math.max(base, Math.min(90, Math.floor((scroll.clientHeight - (view === 'week' ? 24 : 4)) / 17)));
  }
  let lastH = 0;
  function render() {
    cleanup();
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
    meta.textContent = `Gym ${w.done.size} of ${GOAL} this week${w.planned.size ? ` · ${w.planned.size} planned` : ''}`;
    const px = pxNow();
    const sc = scroll.scrollTop;
    if (view === 'day') {
      const day = addDays(today, offset);
      title.textContent = new Date(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const strip = allDay().filter((e) => e.start < day + 24 * HOUR && e.end > day);
      const adBox = h('div', 'dx-allday');
      adBox.append(...strip.map((e) => h('span', 'dx-chip', e.title)));
      const grid = h('div', 'dx-grid');
      const startMin = 7 * 60, endMin = 24 * 60;
      const gut = h('div', 'dx-gutter');
      for (let m = startMin; m < endMin; m += 60) { const t = h('span', null, hhmm(m)); t.style.top = `${((m - startMin) / 60) * px}px`; gut.append(t); }
      gut.style.height = `${((endMin - startMin) / 60) * px}px`;
      grid.append(gut, column(day, now, px, startMin, endMin, s.list, false));
      scroll.replaceChildren(...(strip.length ? [adBox] : []), grid);
    } else {
      const ws = addDays(startOfWeek(now), offset * 7);
      title.textContent = `${new Date(ws).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(addDays(ws, 6)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      const startMin = 7 * 60, endMin = 24 * 60;
      const grid = h('div', 'dx-grid dx-weekgrid');
      const gut = h('div', 'dx-gutter');
      for (let m = startMin; m < endMin; m += 60) { const t = h('span', null, hhmm(m)); t.style.top = `${((m - startMin) / 60) * px + 22}px`; gut.append(t); }
      grid.append(gut);
      for (let i = 0; i < 7; i++) {
        const day = addDays(ws, i);
        const wrap = h('div', `dx-daycol${day === today ? ' today' : ''}`);
        wrap.append(h('div', 'dx-dayhead', new Date(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })));
        wrap.append(column(day, now, px, startMin, endMin, offset === 0 ? s.list : [], true));
        grid.append(wrap);
      }
      scroll.replaceChildren(grid);
    }
    scroll.scrollTop = sc;
  }

  let placed = false;
  function toNow() {
    if (placed || !scroll.clientHeight) return;
    placed = true;
    const px = pxNow(), nowMin = (Date.now() - startOfDay(Date.now())) / MIN;
    scroll.scrollTop = Math.max(0, ((nowMin - 7 * 60) / 60 - 1) * px);
  }
  window.addEventListener('dash:calendar', guard(render));
  window.addEventListener('dash:layout', guard(() => { placed = false; setTimeout(toNow, 300); }));
  window.addEventListener('storage', guard((e) => { if (e.key === LOG || e.key === SKIP) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if (e.detail.key === LOG || e.detail.key === SKIP) { window.dispatchEvent(new CustomEvent('dash:gym')); render(); } }));
  window.addEventListener('resize', guard(() => { if (fills() && Math.abs(scroll.clientHeight - lastH) > 8) { lastH = scroll.clientHeight; render(); } }));
  DASH.every(60 * 1000, guard(render));
  render();
  setTimeout(toNow, 600);
});
