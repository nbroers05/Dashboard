'use strict';

// Wishes: Noah's wish list (WISHES.md in his Obsidian vault) as a list, read-only and only on the PC.
// Comes from the helper (http://127.0.0.1:8765/wishes, helper/wishes.py). Not reachable (phone, other PC,
// helper off): the tile disappears. Reloaded every minute, so a wish typed in Obsidian shows up by itself.
DASH.widget('w-wishes', (card, body, guard) => {
  const { h } = DASH;
  const HELPER = 'http://127.0.0.1:8765';

  const DEMO_DATA = {
    updated: Date.now() / 1000,
    sections: [
      { title: 'To do', items: [{ text: 'the clock can be bigger', sub: [], image: false }, { text: 'example wish with a picture', sub: [], image: true }], ideas: [] },
      { title: 'Big ideas', items: [], ideas: [{ title: 'Example idea', lines: ['What: (to fill in)', 'Mockup: (to fill in)'] }] },
      { title: 'Questions', items: [{ text: 'example question', sub: ['Question: which tile do you mean?'], image: false }], ideas: [] },
      { title: 'Done', items: [{ text: 'something already finished (29-10-2026, 1.7.1)', sub: [], image: false }], ideas: [] },
    ],
  };

  const sec = (data, name) => (data.sections || []).find((s) => s.title.toLowerCase().startsWith(name)) || { items: [], ideas: [] };
  // Does a question wait on Noah (the last line is still Claude's question) or on Claude (Noah answered below it)?
  const waitsOnYou = (it) => !it.sub.length || /^(question|vraag):/i.test(it.sub[it.sub.length - 1]);

  function line(text, cls, extra) {
    const li = h('li', cls);
    li.append(h('span', 'ws-text', text));
    if (extra) li.append(h('span', 'ws-tag', extra));
    return li;
  }

  function render(data) {
    card.hidden = false;
    const todo = sec(data, 'to do'), ideas = sec(data, 'big ideas'), questions = sec(data, 'questions'), done = sec(data, 'done');
    const head = h('div', 'w-big', String(todo.items.length));
    head.append(h('small', null, todo.items.length === 1 ? 'wish to do' : 'wishes to do'));
    const parts = [head];
    const list = (title, items) => {
      if (!items.length) return;
      parts.push(h('p', 'ws-head', title));
      const ul = h('ul', 'ws-list');
      ul.append(...items);
      parts.push(ul);
    };
    list('To do', todo.items.map((it) => line(it.text, '', it.image ? '📎' : '')));
    list('Questions', questions.items.map((it) => line(it.text, waitsOnYou(it) ? 'ws-you' : 'ws-claude', waitsOnYou(it) ? 'you' : 'answered')));
    list('Big ideas', ideas.ideas.map((idea) => {
      const open = idea.lines.some((l) => /\((to fill in|nog invullen)\)/i.test(l));
      return line(idea.title, open ? 'ws-you' : '', open ? 'needs a mockup' : 'ready to build');
    }));
    if (!todo.items.length && !questions.items.length && !ideas.ideas.length) parts.push(h('p', 'w-note', 'Nothing open. New wish: add it to WISHES.md in Obsidian.'));
    parts.push(h('p', 'w-sub ws-foot', `${done.items.length} done · tell Claude "do the wishes"`));
    body.replaceChildren(...parts);
  }

  async function load() {
    if (DASH.DEMO) return render(DEMO_DATA);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${HELPER}/wishes`, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch {
      card.hidden = true;   // only on the PC with the helper
    }
  }

  card.hidden = true;
  DASH.every(60 * 1000, guard(load));
  load();
});
