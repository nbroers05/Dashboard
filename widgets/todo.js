'use strict';

// tasks.exe (Planner v2, since 1.12.0): the one task list (the old to-do). A task has at most a date: it shows under Today when it is
// due (or late), otherwise under Later. Canvas deadlines appear by themselves (read-only, from the agenda). Ctrl+K adds a task from
// anywhere. Items are { id, text, done, due: 'YYYY-MM-DD' | undefined }; the same list on every device via Supabase.
// A simple to-do list (shared between devices via Supabase since 1.1.0, live within a second or two since 1.10.0;
// otherwise only in this browser). On the portrait screen since 1.10.0, between Notifications and Steps.
// Type and press Enter to add; circle = check off; double-click the text = edit; × = remove.
DASH.widget('w-todo', (card, body, guard) => {
  const { h, store } = DASH;
  const KEY = 'todo.items';

  const load = () => store.get(KEY) || [];
  const save = (items) => store.set(KEY, items);

  const head = h('div', 'w-big');
  const form = h('form', 'td-add');
  const input = h('input');
  input.placeholder = 'New task…';
  input.setAttribute('aria-label', 'New task');
  input.maxLength = 200;
  const dateIn = h('input', 'td-adddate');
  dateIn.type = 'date';
  dateIn.title = 'Date (optional)';
  dateIn.setAttribute('aria-label', 'Date (optional)');
  const add = h('button', 'w-btn', '+');
  add.type = 'submit';
  add.setAttribute('aria-label', 'Add');
  form.append(input, dateIn, add);
  const list = h('ul', 'td-list');
  const foot = h('div', 'td-foot');
  body.replaceChildren(head, form, list, foot);

  form.addEventListener('submit', guard((e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTask(text, dateIn.value);
    input.value = '';
    dateIn.value = '';
    render();
  }));

  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const addTask = (text, due) => save([...load(), { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false, ...(due ? { due } : {}) }]);
  const dayLabel = (d) => {
    const t = iso(Date.now());
    if (d === t) return 'Today';
    if (d < t) return `Late · ${new Date(`${d}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    const diff = Math.round((new Date(`${d}T12:00`) - new Date(`${t}T12:00`)) / 864e5);
    if (diff === 1) return 'Tomorrow';
    const dt = new Date(`${d}T12:00`);
    return diff < 7 ? dt.toLocaleDateString('en-GB', { weekday: 'short' }) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const update = (id, change) => { save(load().map((t) => (t.id === id ? { ...t, ...change } : t))); render(); };

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

  function render() {
    const items = load();
    const open = items.filter((t) => !t.done);
    const done = items.filter((t) => t.done);
    head.textContent = String(open.length);
    head.append(h('small', null, open.length === 1 ? 'task open' : 'tasks open'));

    const todayIso = iso(Date.now());
    const byDue = (x, y) => (x.due || '9999').localeCompare(y.due || '9999');
    const canvas = ((window.DASH_CANVAS && DASH_CANVAS.items()) || []).filter((c) => !c.done && c.due < Date.now() + 21 * 864e5 && c.due > Date.now() - 2 * 864e5);
    const row = (t) => {
      const li = h('li', `td-item${t.done ? ' done' : ''}`);
      const check = h('button', 'td-check', t.done ? '✓' : '');
      check.setAttribute('aria-label', t.done ? 'Open again' : 'Check off');
      check.onclick = () => update(t.id, { done: !t.done });
      const text = h('span', 'td-text', t.text);
      text.title = 'Double-click to edit';
      text.ondblclick = () => edit(text, t);
      const chip = h('button', `td-due${t.due ? '' : ' empty'}`, t.due ? dayLabel(t.due) : '+ date');
      chip.type = 'button';
      chip.title = 'Set a date';
      const pick = h('input', 'td-pick');
      pick.type = 'date';
      pick.value = t.due || '';
      pick.tabIndex = -1;
      pick.onchange = () => update(t.id, { due: pick.value || undefined });
      chip.onclick = () => { try { pick.showPicker(); } catch { pick.focus(); pick.click(); } };
      const del = h('button', 'td-del', '×');
      del.setAttribute('aria-label', `Remove "${t.text}"`);
      del.onclick = () => { save(load().filter((x) => x.id !== t.id)); render(); };
      li.append(check, text, chip, pick, del);
      return li;
    };
    const canvasRow = (c) => {
      const li = h('li', 'td-item td-canvas');
      const dot = h('span', 'td-cdot', '📚');
      const text = h('span', 'td-text', c.name);
      const when = h('span', 'td-due canvas', `Canvas · ${new Date(c.due).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${iso(c.due) === todayIso ? '' : ` · ${dayLabel(iso(c.due))}`}`);
      li.append(dot, text, when);
      li.onclick = () => window.DASH_CANVAS && DASH_CANVAS.openPage();
      return li;
    };
    const group = (label, rows) => (rows.length ? [h('li', 'td-group', label), ...rows] : []);
    const dueNow = (t) => t.due && t.due <= todayIso;
    const todayRows = [...open.filter(dueNow).sort(byDue).map(row), ...canvas.filter((c) => iso(c.due) <= todayIso).map(canvasRow)];
    const laterRows = [...open.filter((t) => !dueNow(t)).sort(byDue).map(row), ...canvas.filter((c) => iso(c.due) > todayIso).map(canvasRow)];
    list.replaceChildren(...group('Today', todayRows), ...group('Later', laterRows), ...group('Done', done.map(row)));
    if (!list.children.length) list.append(h('li', 'w-note', 'Nothing yet. Type a task above and press Enter (Ctrl+K adds one from anywhere).'));

    foot.replaceChildren();
    if (done.length) {
      const clear = h('button', 'text-btn', `Clear checked (${done.length})`);
      clear.onclick = () => { save(load().filter((t) => !t.done)); render(); };
      foot.append(h('span', 'w-sub', window.DASH_SB && DASH_SB.linked() ? 'On all your devices' : 'Only in this browser'), clear);
    } else {
      foot.append(h('span', 'w-sub', window.DASH_SB && DASH_SB.linked() ? 'On all your devices' : 'Only in this browser'));
    }
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
  // Another tab with the dashboard? Then update here too
  window.addEventListener('storage', guard((e) => { if (e.key === KEY) fromElsewhere(); }));
  window.addEventListener('dash:calendar', guard(() => { if (!list.querySelector('[contenteditable="true"]')) render(); }));
  // Ctrl+K: quick add from anywhere
  const dlg = h('dialog', 'panel-dialog td-quick');
  dlg.setAttribute('aria-label', 'Add a task');
  const qForm = h('form');
  const qIn = h('input');
  qIn.placeholder = 'New task… (Enter to add)';
  qIn.maxLength = 200;
  const qDate = h('input', 'td-adddate');
  qDate.type = 'date';
  qForm.append(h('b', null, 'New task'), qIn, qDate);
  qForm.onsubmit = (e) => { e.preventDefault(); const t = qIn.value.trim(); if (t) { addTask(t, qDate.value); render(); } qIn.value = ''; qDate.value = ''; dlg.close(); };
  dlg.append(qForm);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!dlg.open && !document.querySelector('dialog[open]')) { dlg.showModal(); qIn.focus(); }
    }
  });
  window.addEventListener('dash:synced', guard((e) => { if (e.detail.key === KEY) fromElsewhere(); }));   // from another device, live (sync.js)
  render();
});
