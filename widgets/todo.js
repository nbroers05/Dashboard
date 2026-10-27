'use strict';

// Eenvoudige to-do-lijst, alleen in deze browser bewaard (geen koppeling).
// Typ en druk Enter om toe te voegen; rondje = afvinken; dubbelklik op de tekst = aanpassen; × = weg.
DASH.widget('w-todo', (card, body, guard) => {
  const { h, store } = DASH;
  const KEY = 'todo.items';

  const load = () => store.get(KEY) || [];
  const save = (items) => store.set(KEY, items);

  const head = h('div', 'w-big');
  const form = h('form', 'td-add');
  const input = h('input');
  input.placeholder = 'Nieuwe taak…';
  input.setAttribute('aria-label', 'Nieuwe taak');
  input.maxLength = 200;
  const add = h('button', 'w-btn', '+');
  add.type = 'submit';
  add.setAttribute('aria-label', 'Toevoegen');
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
    head.append(h('small', null, open.length === 1 ? 'taak open' : 'taken open'));

    list.replaceChildren(...[...open, ...done].map((t) => {
      const li = h('li', `td-item${t.done ? ' done' : ''}`);
      const check = h('button', 'td-check', t.done ? '✓' : '');
      check.setAttribute('aria-label', t.done ? 'Weer open zetten' : 'Afvinken');
      check.onclick = () => update(t.id, { done: !t.done });
      const text = h('span', 'td-text', t.text);
      text.title = 'Dubbelklik om aan te passen';
      text.ondblclick = () => edit(text, t);
      const del = h('button', 'td-del', '×');
      del.setAttribute('aria-label', `Verwijder "${t.text}"`);
      del.onclick = () => { save(load().filter((x) => x.id !== t.id)); render(); };
      li.append(check, text, del);
      return li;
    }));
    if (!items.length) list.append(h('li', 'w-note', 'Nog niks. Typ hierboven een taak en druk op Enter.'));

    foot.replaceChildren();
    if (done.length) {
      const clear = h('button', 'text-btn', `Wis afgevinkt (${done.length})`);
      clear.onclick = () => { save(load().filter((t) => !t.done)); render(); };
      foot.append(h('span', 'w-sub', 'Alleen in deze browser'), clear);
    } else {
      foot.append(h('span', 'w-sub', 'Alleen in deze browser'));
    }
  }

  // Ander tabblad met het dashboard? Dan ook hier bijwerken
  window.addEventListener('storage', guard((e) => { if (e.key === KEY) render(); }));
  render();
});
