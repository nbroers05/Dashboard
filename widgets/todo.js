'use strict';

// tasks.exe (Planner v2, since 1.12.0; input and list redone in 1.13.0): the one task list (the old to-do).
// A task is { id, text, done, due: 'YYYY-MM-DD' | undefined, time: 'HH:MM' | undefined }. Without a date it sits under Later; with
// a date it sits under This week (with its weekday) or Later, and it shows in the day/week of day.exe (a task with a time as a
// small block, one without as a chip with a checkbox). Canvas deadlines appear by themselves (read-only, from the agenda).
// Input: one field ("New task, then Enter") with the chips Today, Tomorrow, Pick day (own small picker, day-month-year, Monday
// first) and No date. Ctrl+K adds a task from anywhere. A row can be dragged onto a day or a time in day.exe (DASH_DRAG).
// The same list on every device via Supabase (live within a second or two since 1.10.0), otherwise only in this browser.
// Circle = check off; double-click the text = edit; × = remove. Exposes DASH_TASKS for day.exe.
DASH.widget('w-todo', (card, body, guard) => {
  const { h, store, startOfDay, addDays } = DASH;
  const KEY = 'todo.items';

  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const load = () => store.get(KEY) || [];
  const save = (items) => { store.set(KEY, items); window.dispatchEvent(new CustomEvent('dash:tasks')); };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const addTask = (text, due, time, dur) => save([...load(), { id: newId(), text, done: false, ...(due ? { due } : {}), ...(due && time ? { time } : {}), ...(due && time && dur ? { dur } : {}) }]);
  const update = (id, change) => {
    save(load().map((t) => {
      if (t.id !== id) return t;
      const n = { ...t, ...change };
      Object.keys(n).forEach((k) => { if (n[k] === undefined) delete n[k]; });
      if (!n.due) delete n.time;
      if (!n.time) delete n.dur;
      return n;
    }));
  };
  const remove = (id) => save(load().filter((x) => x.id !== id));
  const weekdayShort = (d) => new Date(`${d}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' });
  const dayLabel = (d, time) => {
    const t = iso(Date.now());
    const at = time ? ` ${time}` : '';
    if (d === t) return `Today${at}`;
    if (d < t) return `Late · ${new Date(`${d}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    const diff = Math.round((new Date(`${d}T12:00`) - new Date(`${t}T12:00`)) / 864e5);
    if (diff === 1) return `Tomorrow${at}`;
    const dt = new Date(`${d}T12:00`);
    return (diff < 7 ? dt.toLocaleDateString('en-GB', { weekday: 'short' }) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + at;
  };

  // ---------- Own date picker (day-month-year, Monday first) ----------
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } document.removeEventListener('pointerdown', outside, true); }
  function outside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-pick-anchor]')) closePop(); }
  function pickDay(anchor, current, cb, allowNone) {
    closePop();
    const base = current ? new Date(`${current}T12:00`) : new Date();
    let year = base.getFullYear(), month = base.getMonth();
    pop = h('div', 'tk-pop');
    const draw = () => {
      const first = new Date(year, month, 1);
      const lead = (first.getDay() + 6) % 7;
      const days = new Date(year, month + 1, 0).getDate();
      const head = h('div', 'tk-pop-head');
      const prev = h('button', 'dx-nav', '‹'), next = h('button', 'dx-nav', '›');
      prev.type = next.type = 'button';
      prev.onclick = () => { month--; if (month < 0) { month = 11; year--; } draw(); };
      next.onclick = () => { month++; if (month > 11) { month = 0; year++; } draw(); };
      head.append(prev, h('b', null, first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })), next);
      const grid = h('div', 'tk-pop-grid');
      ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach((n) => grid.append(h('span', 'tk-pop-dow', n)));
      for (let i = 0; i < lead; i++) grid.append(h('span'));
      const today = iso(Date.now());
      for (let d = 1; d <= days; d++) {
        const key = iso(new Date(year, month, d).getTime());
        const b = h('button', `tk-pop-day${key === today ? ' today' : ''}${key === current ? ' sel' : ''}`, String(d));
        b.type = 'button';
        b.onclick = () => { closePop(); cb(key); };
        grid.append(b);
      }
      pop.replaceChildren(head, grid);
      if (allowNone) {
        const none = h('button', 'text-btn', 'No date');
        none.type = 'button';
        none.onclick = () => { closePop(); cb(undefined); };
        pop.append(none);
      }
    };
    draw();
    (anchor.closest('dialog') || document.body).append(pop);
    const r = anchor.getBoundingClientRect();
    const w = 232, hh = 260;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
    pop.style.top = `${r.bottom + hh + 8 > innerHeight ? Math.max(8, r.top - hh - 6) : r.bottom + 6}px`;
    anchor.setAttribute('data-pick-anchor', '');
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  // ---------- The chips under the input: Today · Tomorrow · Pick day · No date ----------
  function chipsBar() {
    let mode = 'today', picked = null;
    const el = h('div', 'tk-chips');
    const defs = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['pick', 'Pick day'], ['none', 'No date']];
    const btns = {};
    const draw = () => {
      for (const [id, label] of defs) {
        const b = btns[id];
        b.setAttribute('aria-pressed', String(mode === id));
        b.textContent = id === 'pick' && picked ? new Date(`${picked}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : label;
      }
    };
    for (const [id, label] of defs) {
      const b = h('button', 'tk-chip', label);
      b.type = 'button';
      b.onclick = () => {
        if (id === 'pick') pickDay(b, picked, (d) => { picked = d; mode = 'pick'; draw(); });
        else { mode = id; draw(); }
      };
      btns[id] = b;
      el.append(b);
    }
    draw();
    return {
      el,
      get: () => (mode === 'today' ? iso(Date.now()) : mode === 'tomorrow' ? iso(addDays(startOfDay(Date.now()), 1)) : mode === 'pick' ? picked : undefined),
      reset: () => { mode = 'today'; picked = null; draw(); },
    };
  }

  window.DASH_TASKS = { list: load, add: addTask, update, remove, iso, fromIso, pickDay, dayLabel };

  // ---------- Drawing ----------
  const head = h('div', 'td-count');
  let showDone = false;
  const form = h('form', 'td-add');
  const input = h('input');
  input.placeholder = 'New task, then Enter';
  input.setAttribute('aria-label', 'New task');
  input.maxLength = 200;
  form.append(input);
  const chips = chipsBar();
  const list = h('ul', 'td-list');
  const foot = h('div', 'td-foot');
  body.replaceChildren(head, form, chips.el, list, foot);

  form.addEventListener('submit', guard((e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTask(text, chips.get());
    input.value = '';
    chips.reset();
    render();
  }));

  function edit(span, item) {
    span.contentEditable = 'true';
    span.focus();
    document.getSelection().selectAllChildren(span);
    const finish = (keep) => {
      span.contentEditable = 'false';
      const text = span.textContent.trim();
      if (keep && text) update(item.id, { text });
      else render();
    };
    span.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    };
    span.onblur = () => finish(true);
  }

  // Drop on a day (header or chip area: date only) or a time in the day (date + time)
  const dropTask = (id) => (loc) => {
    if (!loc) return;
    update(id, { due: iso(loc.day), time: loc.min != null ? `${String(Math.floor(loc.min / 60)).padStart(2, '0')}:${String(loc.min % 60).padStart(2, '0')}` : undefined });
  };

  function render() {
    const items = load();
    const open = items.filter((t) => !t.done);
    const done = items.filter((t) => t.done);
    head.textContent = `${open.length} open`;

    const todayIso = iso(Date.now());
    const weekEnd = iso(addDays(DASH.startOfWeek(Date.now()), 7) - 1);   // Sunday of this week
    const byDue = (x, y) => `${x.due || '9999'} ${x.time || ''}`.localeCompare(`${y.due || '9999'} ${y.time || ''}`);
    const canvas = ((window.DASH_CANVAS && DASH_CANVAS.items()) || []).filter((c) => !c.done && c.due < Date.now() + 21 * 864e5 && c.due > Date.now() - 2 * 864e5);
    const row = (t) => {
      const li = h('li', `td-item${t.done ? ' done' : ''}`);
      const check = h('button', 'td-check', t.done ? '✓' : '');
      check.setAttribute('aria-label', t.done ? 'Open again' : 'Check off');
      check.onclick = () => update(t.id, { done: !t.done });
      const text = h('span', 'td-text', t.text);
      text.title = 'Double-click to edit · drag onto a day in the planner';
      text.ondblclick = () => edit(text, t);
      const chip = h('button', `td-due${t.due ? '' : ' empty'}`, t.due ? dayLabel(t.due, t.time) : '+ date');
      chip.type = 'button';
      chip.title = 'Set a date';
      chip.onclick = () => pickDay(chip, t.due, (d) => update(t.id, { due: d }), true);
      const del = h('button', 'td-del', '×');
      del.setAttribute('aria-label', `Remove "${t.text}"`);
      del.onclick = () => remove(t.id);
      li.append(check, text, chip, del);
      if (!t.done) {
        li.addEventListener('pointerdown', (e) => {
          if (e.target.closest('button') || text.isContentEditable || !window.DASH_DRAG) return;
          DASH_DRAG.start(e, { label: t.text, onDrop: dropTask(t.id) });
        });
      }
      return li;
    };
    const canvasRow = (c) => {
      const li = h('li', 'td-item td-canvas');
      const dot = h('span', 'td-cdot', '📚');
      const text = h('span', 'td-text', c.name);
      const when = h('span', 'td-due canvas', `${new Date(c.due).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${iso(c.due) === todayIso ? '' : ` · ${dayLabel(iso(c.due)).replace(/^Late · .*/, 'Late')}`}`);
      when.title = 'Canvas deadline';
      li.append(dot, text, when);
      li.onclick = () => window.DASH_CANVAS && DASH_CANVAS.openPage();
      return li;
    };
    const doneToggle = (n) => {
      const li = h('li', 'td-group td-donetoggle');
      const b = h('button', 'text-btn', `${showDone ? '▾' : '▸'} ${n} done`);
      b.type = 'button';
      b.onclick = () => { showDone = !showDone; render(); };
      li.append(b);
      return li;
    };
    const group = (label, rows) => (rows.length ? [h('li', 'td-group', label), ...rows] : []);
    const thisWeek = (t) => t.due && t.due <= weekEnd;
    const weekRows = [...open.filter(thisWeek).sort(byDue).map(row), ...canvas.filter((c) => iso(c.due) <= weekEnd).map(canvasRow)];
    const laterRows = [...open.filter((t) => !thisWeek(t)).sort(byDue).map(row), ...canvas.filter((c) => iso(c.due) > weekEnd).map(canvasRow)];
    list.replaceChildren(...group('This week', weekRows), ...group('Later', laterRows), ...(done.length ? [doneToggle(done.length), ...(showDone ? done.map(row) : [])] : []));
    if (!list.children.length) list.append(h('li', 'w-note', 'Nothing yet. Type a task above and press Enter (Ctrl+K adds one from anywhere).'));

    foot.replaceChildren();
    const where = h('span', 'w-sub', window.DASH_SB && DASH_SB.linked() ? 'On all your devices' : 'Only in this browser');
    if (done.length) {
      const clear = h('button', 'text-btn', `Clear checked (${done.length})`);
      clear.onclick = () => { save(load().filter((t) => !t.done)); };
      foot.append(where, clear);
    } else foot.append(where);
  }

  // A change from elsewhere: redraw, but not in the middle of editing a task here (then right after)
  let waiting = false;
  function fromElsewhere() {
    if (list.querySelector('[contenteditable="true"]')) {
      if (!waiting) { waiting = true; list.addEventListener('focusout', () => { waiting = false; setTimeout(render, 0); }, { once: true }); }
      return;
    }
    render();
  }
  window.addEventListener('dash:tasks', guard(fromElsewhere));   // a change made here or in day.exe
  window.addEventListener('storage', guard((e) => { if (e.key === KEY) fromElsewhere(); }));   // another tab
  window.addEventListener('dash:calendar', guard(() => { if (!list.querySelector('[contenteditable="true"]')) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if (e.detail.key === KEY) fromElsewhere(); }));   // from another device, live (sync.js)

  // ---------- Ctrl+K: quick add from anywhere ----------
  const dlg = h('dialog', 'panel-dialog td-quick');
  dlg.setAttribute('aria-label', 'Add a task');
  const qForm = h('form');
  const qIn = h('input');
  qIn.placeholder = 'New task, then Enter';
  qIn.maxLength = 200;
  const qChips = chipsBar();
  qForm.append(h('b', null, 'New task'), qIn, qChips.el);
  qForm.onsubmit = (e) => { e.preventDefault(); const t = qIn.value.trim(); if (t) addTask(t, qChips.get()); qIn.value = ''; qChips.reset(); dlg.close(); };
  dlg.append(qForm);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', closePop);
  document.body.append(dlg);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!dlg.open && !document.querySelector('dialog[open]')) { dlg.showModal(); qIn.focus(); }
    }
  });
  render();
});
