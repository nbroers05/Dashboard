'use strict';

// Canvas deadlines by urgency: what's due first is at the top.
// Tile: the 3 most urgent. The "All deadlines" button (or #canvas in the address bar) opens the full page.
// The Canvas calendar doesn't say whether you handed something in: you check that off yourself (shared between devices since 0.59.0).
DASH.widget('w-canvas', (card, body, guard) => {
  const { h, fmtTime, startOfDay, startOfWeek, addDays, store } = DASH;
  const PALETTE = ['#2fbf71', '#4fc3f7', '#ffb74d', '#ba68c8', '#f06292', '#aed581', '#4db6ac', '#ffd54f'];
  const DONE_KEY = 'canvas.done';
  const SHOW_KEY = 'canvas.showDone';
  const HOUR = 3600000, DAY = 24 * HOUR;
  let calendar = null;

  // "Essay week 6 [ESSB-MP6020]" → title + course
  function split(title) {
    const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    return m ? { name: m[1], course: m[2] } : { name: title, course: '' };
  }
  // A fixed color per course (same course = always the same color)
  function courseColor(course) {
    let n = 0;
    for (const ch of course) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[n % PALETTE.length];
  }

  // ---------- Handed in, shared between devices (since 0.59.0) ----------
  // Per assignment { id: [1 = handed in / 0 = not, time of checking off] } in this browser (canvas.doneMap) and in the private
  // archive (state/canvas-done.json, via the archive token). On a difference the last change wins. Without a token or
  // offline it simply stays in this browser and goes along the next time it works.
  const MAP_KEY = 'canvas.doneMap';
  const SYNC_PATH = 'state/canvas-done.json';
  function doneMap() {
    let m = store.get(MAP_KEY);
    if (!m) {   // take over the old list (before 0.59.0)
      m = {};
      for (const id of store.get(DONE_KEY) || []) m[id] = [1, 0];
      store.set(MAP_KEY, m);
    }
    return m;
  }
  function saveMap(m) {
    store.set(MAP_KEY, m);
    store.set(DONE_KEY, Object.keys(m).filter((id) => m[id][0] === 1));
  }
  const doneSet = () => { const m = doneMap(); return new Set(Object.keys(m).filter((id) => m[id][0] === 1)); };
  function setDone(id, on) {
    const m = doneMap();
    m[id] = [on ? 1 : 0, Date.now()];
    saveMap(m);
    render();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 1500);
  }
  // Newest per id wins; returns true if `into` changed
  function merge(into, from) {
    let changed = false;
    for (const [id, v] of Object.entries(from || {})) {
      if (!Array.isArray(v)) continue;
      if (!into[id] || v[1] > into[id][1]) { into[id] = v; changed = true; }
    }
    return changed;
  }
  let syncTimer = null, syncing = false;
  // Since 1.1.0: if this browser is linked to Supabase (sync.js), it only reads and writes the table
  // dashboard_canvas_done (one row per assignment). The archive makes the daily copy to state/canvas-done.json itself
  // (dashboard-data, scripts/canvas_copy.py). The check marks from the archive are copied once (flag _canvas.imported).
  // Not linked or Supabase not set up yet: via the archive, like before 1.1.0.
  const SB = () => window.DASH_SB && DASH_SB.linked() ? DASH_SB : null;
  let imported = false;
  async function syncSupabase(sb) {
    const local = doneMap();
    if (!imported && !(imported = !!(await sb.flag('_canvas.imported')))) {
      const D = window.DASH_DATA;
      if (D && D.token()) {
        const f = await D.read(SYNC_PATH).catch(() => null);
        if (f) merge(local, JSON.parse(f.text).items || {});
      }
      const all = Object.entries(local).map(([id, v]) => ({ item_id: id, done: v[0] === 1, changed_at: v[1] }));
      for (let i = 0; i < all.length; i += 200) await sb.upsert('dashboard_canvas_done', all.slice(i, i + 200), 'user_id,item_id');
      await sb.flag('_canvas.imported', new Date().toISOString());
      imported = true;
      saveMap(local);
    }
    const rows = await sb.rest('dashboard_canvas_done?select=item_id,done,changed_at');
    const remote = Object.fromEntries((rows || []).map((r) => [r.item_id, [r.done ? 1 : 0, Number(r.changed_at)]]));
    if (merge(local, remote)) { saveMap(local); render(); }
    const newer = Object.entries(local).filter(([id, v]) => !remote[id] || v[1] > remote[id][1])
      .map(([id, v]) => ({ item_id: id, done: v[0] === 1, changed_at: v[1] }));
    if (newer.length) await sb.upsert('dashboard_canvas_done', newer, 'user_id,item_id');
  }
  async function sync() {
    const D = window.DASH_DATA;
    if (DASH.DEMO || syncing) return;
    const sb = SB();
    if (sb) {
      syncing = true;
      try { await syncSupabase(sb); } catch (e) { sb.fail(e); } finally { syncing = false; }
      return;
    }
    if (!D || !D.token()) return;
    syncing = true;
    try {
      const f = await D.read(SYNC_PATH);
      const remote = (f && JSON.parse(f.text).items) || {};
      const local = doneMap();
      if (merge(local, remote)) { saveMap(local); render(); }
      // Does this browser have something the archive doesn't have yet? Then write it
      const probe = { ...remote };
      if (merge(probe, local)) {
        await D.updateJson(SYNC_PATH, (data) => { data.items = data.items || {}; merge(data.items, local); }, 'Canvas: handed-in marks updated');
      }
    } catch (e) {
      console.warn('[canvas] synchroniseren', e);
    } finally {
      syncing = false;
    }
  }
  window.addEventListener('dash:data-token', () => sync());
  window.addEventListener('dash:sb-linked', () => sync());
  setTimeout(sync, 3000);   // datarepo.js loads after this file
  DASH.every(5 * 60 * 1000, () => sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  // ---------- Model ----------
  function items() {
    const canvas = calendar.events.filter((e) => e.canvas);
    const pool = canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
    const done = doneSet();
    const due = (e) => (e.allDay ? e.end - 1 : e.end);
    return pool.map((e) => ({ id: e.id, due: due(e), allDay: e.allDay, url: e.canvasUrl || null, done: done.has(e.id), ...split(e.title) }))
      .sort((a, b) => a.due - b.due);
  }

  // Group and urgency
  function group(it, now) {
    if (it.done) return 'done';
    if (it.due < now) return 'late';
    const day = startOfDay(it.due), today = startOfDay(now);
    if (day === today) return 'today';
    if (day === addDays(today, 1)) return 'tomorrow';
    if (it.due < addDays(startOfWeek(now), 7)) return 'week';
    return 'later';
  }
  const GROUPS = [['late', 'Late'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['later', 'Later'], ['done', 'Handed in']];
  function urgency(it, now) {
    if (it.done) return 'done';
    const left = it.due - now;
    return left < 0 ? 'late' : left < DAY ? 'red' : left < 3 * DAY ? 'orange' : 'calm';
  }

  // "5 hours left", "tomorrow 23:59", "2 days late"
  function when(it, now) {
    const left = it.due - now;
    const time = it.allDay ? '' : ` ${fmtTime(it.due)}`;
    if (left < 0) {
      const ago = -left;
      if (ago < HOUR) return `${Math.max(1, Math.round(ago / 60000))} min late`;
      if (ago < DAY) return `${Math.round(ago / HOUR)} ${Math.round(ago / HOUR) === 1 ? 'hour' : 'hours'} late`;
      const d = Math.round(ago / DAY);
      return `${d} ${d === 1 ? 'day' : 'days'} late`;
    }
    if (!it.allDay && left < HOUR) return `${Math.max(1, Math.round(left / 60000))} min left`;
    if (!it.allDay && left < 12 * HOUR) return `${Math.round(left / HOUR)} ${Math.round(left / HOUR) === 1 ? 'hour' : 'hours'} left`;
    const diff = Math.round((startOfDay(it.due) - startOfDay(now)) / DAY);
    if (diff === 0) return `today${time}`;
    if (diff === 1) return `tomorrow${time}`;
    if (diff < 7) return `${new Date(it.due).toLocaleDateString('en-GB', { weekday: 'short' })}${time}`;
    return `${new Date(it.due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${time}`;
  }
  const fullDate = (it) => new Date(it.due).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + (it.allDay ? '' : ` ${fmtTime(it.due)}`);

  // One deadline as a row (compact in the tile, with a check mark and link on the page)
  function row(it, now, full) {
    const r = h('div', `cv-item u-${urgency(it, now)}`);
    r.style.setProperty('--dot', courseColor(it.course || it.name));
    const check = h('button', 'cv-check');
    check.type = 'button';
    check.setAttribute('aria-pressed', it.done);
    check.setAttribute('aria-label', it.done ? `${it.name}: not handed in` : `${it.name}: handed in`);
    check.title = it.done ? 'Not handed in after all' : 'Mark as handed in';
    check.onclick = (e) => { e.stopPropagation(); setDone(it.id, !it.done); };
    const txt = h('div', 'cv-txt');
    const name = h(it.url && full ? 'a' : 'b', 'cv-name', it.name);
    if (it.url && full) { name.href = it.url; name.target = '_blank'; name.rel = 'noopener'; }
    name.title = it.name;
    const meta = h('div', 'cv-meta');
    const whenEl = h('span', 'cv-when', it.done ? 'handed in' : when(it, now));
    // In the narrow tile the time is below the name, on the page on the right
    if (!full) meta.append(whenEl);
    if (it.course) meta.append(h('span', 'cv-course', it.course));
    if (full) meta.append(h('span', null, fullDate(it)));
    txt.append(name, meta);
    r.append(check, txt);
    if (full) r.append(whenEl);
    else r.classList.add('compact');
    return r;
  }

  function empty(text) {
    DASH.alert('canvas', null);
    const box = h('div', 'w-empty');
    box.append(h('p', null, text));
    body.replaceChildren(box);
  }

  // ---------- The tile: only the 3 most urgent ----------
  function render() {
    if (!calendar) return;
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('dash:canvas')));
    if (!calendar.connected) { DASH.alert('canvas', null); body.replaceChildren(DASH.problem('Link your Google Calendar to see your deadlines.', 'Link agenda', DASH.connectGoogle)); return; }
    if (!calendar.events.some((e) => e.canvas)) return empty('No Canvas calendar found yet (see README, step 4).');
    const now = Date.now();
    const all = items();
    const open = all.filter((it) => !it.done);
    const late = open.filter((it) => it.due < now);
    const upcoming = open.filter((it) => it.due >= now);
    const top = [...late, ...upcoming].slice(0, 3);

    card.classList.toggle('has-late', late.length > 0);
    card.classList.toggle('cv-none', open.length === 0);   // tall: the tile then drops out (since 0.59.0)

    // Notifications: late, or within 24 hours
    const soon = upcoming.filter((it) => it.due - now < DAY);
    DASH.alert('canvas', [
      ...(late.length ? [{ level: 'urgent', icon: '📚', text: late.length === 1 ? `Late: ${late[0].name}` : `${late.length} Canvas deadlines late`, sub: late.length === 1 ? when(late[0], now) : late.map((x) => x.name).join(', '), onClick: openPage }] : []),
      ...soon.map((it) => ({ level: it.due - now < 6 * HOUR ? 'urgent' : 'warn', icon: '📚', text: it.name, sub: `Canvas · ${when(it, now)}${it.course ? ` · ${it.course}` : ''}`, onClick: openPage })),
    ]);
    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(open.length));
    big.append(h('small', null, open.length === 1 ? 'deadline open' : 'deadlines open'));
    head.append(big);
    if (late.length) head.append(h('span', 'w-pill cv-late-pill', `${late.length} late`));

    const list = h('div', 'cv-list');
    if (top.length) top.forEach((it) => list.append(row(it, now, false)));
    else list.append(h('p', 'w-note', 'Nothing left to hand in 🎉'));

    const more = h('button', 'w-btn ghost cv-more', open.length > 3 ? `All deadlines (${open.length}) →` : 'All deadlines →');
    more.type = 'button';
    more.onclick = openPage;
    body.replaceChildren(head, list, more);
    if (page && page.dialog.open) fillPage();
  }

  // ---------- The page with everything ----------
  let page = null;
  function fillPage() {
    const now = Date.now();
    const all = items();
    const showDone = store.get(SHOW_KEY) === true;
    const doneCount = all.filter((it) => it.done).length;

    const toolbar = h('div', 'cvp-bar');
    const intro = h('p', 'w-note', 'Sorted by what\'s due first. Canvas doesn\'t pass on whether you handed something in: check it off yourself with the circle.');
    const toggle = h('button', 'w-btn ghost', showDone ? `Hide handed in (${doneCount})` : `Show handed in (${doneCount})`);
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', showDone);
    toggle.onclick = () => { store.set(SHOW_KEY, !showDone); fillPage(); };
    toolbar.append(intro, toggle);

    const wrap = h('div', 'cvp-groups');
    for (const [key, label] of GROUPS) {
      if (key === 'done' && !showDone) continue;
      const list = all.filter((it) => group(it, now) === key);
      if (key === 'done') list.reverse();
      if (!list.length) continue;
      const sec = h('section', `cvp-group g-${key}`);
      const title = h('h3', 'cvp-title', label);
      title.append(h('span', 'cvp-count', String(list.length)));
      sec.append(title);
      list.forEach((it) => sec.append(row(it, now, true)));
      wrap.append(sec);
    }
    if (!wrap.children.length) wrap.append(h('p', 'w-note', 'Nothing left to hand in 🎉'));

    const inner = h('div', 'cvp-inner');
    inner.append(toolbar, wrap);
    const scroll = page.body.scrollTop;
    page.body.replaceChildren(inner);
    page.body.scrollTop = scroll;
  }

  // For the phone (phone.js): open deadlines (null = no agenda), text like "4 days late", and the page
  window.DASH_CANVAS = { items: () => (calendar && calendar.connected ? items() : null), when, openPage: () => openPage() };

  function openPage() {
    if (!calendar || !calendar.connected) return;
    if (!page) {
      page = DASH.panel('Canvas-deadlines', 'var(--c-study)');
      page.dialog.classList.add('page-dialog', 'cv-page');
      // Address bar: #canvas while the page is open (the back button closes it)
      page.dialog.addEventListener('close', () => {
        if (location.hash !== '#canvas') return;
        if (pushed) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
        pushed = false;
      });
    }
    fillPage();
    if (!page.dialog.open) page.open();
    if (location.hash !== '#canvas') { history.pushState(null, '', '#canvas'); pushed = true; }
  }
  let pushed = false;
  window.addEventListener('popstate', () => {
    if (page && page.dialog.open && location.hash !== '#canvas') { pushed = false; page.close(); }
  });

  DASH.onCalendar(guard((detail) => {
    calendar = detail;
    render();
    if (location.hash === '#canvas' && !(page && page.dialog.open)) openPage();
  }));
  // Every minute update the times ("5 hours left") and groups
  DASH.every(60 * 1000, guard(render));
});
