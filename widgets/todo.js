'use strict';

// A simple to-do list (shared between devices via Supabase since 1.1.0, otherwise only in this browser).
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
  const add = h('button', 'w-btn', '+');
  add.type = 'submit';
  add.setAttribute('aria-label', 'Add');
  form.append(input, add);
  const list = h('ul', 'td-list');
  const foot = h('div', 'td-foot');
  body.replaceChildren(head, form, list, foot);

  form.addEventListener('submit', guard((e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    save([...load(), { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false }]);
    input.value = '';
    render();
  }));

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

    list.replaceChildren(...[...open, ...done].map((t) => {
      const li = h('li', `td-item${t.done ? ' done' : ''}`);
      const check = h('button', 'td-check', t.done ? '✓' : '');
      check.setAttribute('aria-label', t.done ? 'Open again' : 'Check off');
      check.onclick = () => update(t.id, { done: !t.done });
      const text = h('span', 'td-text', t.text);
      text.title = 'Double-click to edit';
      text.ondblclick = () => edit(text, t);
      const del = h('button', 'td-del', '×');
      del.setAttribute('aria-label', `Verwijder "${t.text}"`);
      del.onclick = () => { save(load().filter((x) => x.id !== t.id)); render(); };
      li.append(check, text, del);
      return li;
    }));
    if (!items.length) list.append(h('li', 'w-note', 'Nothing yet. Type a task above and press Enter.'));

    foot.replaceChildren();
    if (done.length) {
      const clear = h('button', 'text-btn', `Clear checked (${done.length})`);
      clear.onclick = () => { save(load().filter((t) => !t.done)); render(); };
      foot.append(h('span', 'w-sub', window.DASH_SB && DASH_SB.linked() ? 'On all your devices' : 'Only in this browser'), clear);
    } else {
      foot.append(h('span', 'w-sub', window.DASH_SB && DASH_SB.linked() ? 'On all your devices' : 'Only in this browser'));
    }
  }

  // Another tab with the dashboard? Then update here too
  window.addEventListener('storage', guard((e) => { if (e.key === KEY) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if (e.detail.key === KEY) render(); }));   // from another device (sync.js)
  render();
});
