'use strict';

// Wensen: Noahs wensenlijst (WENSEN.md in zijn Obsidian-map) als lijst, alleen lezen en alleen op de pc.
// Komt van het hulpprogramma (http://127.0.0.1:8765/wensen, helper/wensen.py). Niet bereikbaar (telefoon, andere pc,
// hulpprogramma uit): het vak verdwijnt. Elke minuut opnieuw, zodat een wens die je in Obsidian typt vanzelf verschijnt.
DASH.widget('w-wishes', (card, body, guard) => {
  const { h } = DASH;
  const HELPER = 'http://127.0.0.1:8765';

  const DEMO_DATA = {
    updated: Date.now() / 1000,
    sections: [
      { title: 'Te doen', items: [{ text: 'de klok mag groter', sub: [], image: false }, { text: 'voorbeeldwens met plaatje', sub: [], image: true }], ideas: [] },
      { title: 'Grote ideeën', items: [], ideas: [{ title: 'Voorbeeld-idee', lines: ['Wat: (nog invullen)', 'Mockup: (nog invullen)'] }] },
      { title: 'Vragen', items: [{ text: 'voorbeeldvraag', sub: ['Vraag: welk vak bedoel je?'], image: false }], ideas: [] },
      { title: 'Gedaan', items: [{ text: 'iets dat al klaar is (29-10-2026, 0.40.1)', sub: [], image: false }], ideas: [] },
    ],
  };

  const sec = (data, name) => (data.sections || []).find((s) => s.title.toLowerCase().startsWith(name)) || { items: [], ideas: [] };
  // Wacht een vraag op Noah (laatste regel is nog de vraag van Claude) of op Claude (Noah heeft eronder geantwoord)?
  const waitsOnYou = (it) => !it.sub.length || /^vraag:/i.test(it.sub[it.sub.length - 1]);

  function line(text, cls, extra) {
    const li = h('li', cls);
    li.append(h('span', 'ws-text', text));
    if (extra) li.append(h('span', 'ws-tag', extra));
    return li;
  }

  function render(data) {
    card.hidden = false;
    const todo = sec(data, 'te doen'), ideas = sec(data, 'grote'), questions = sec(data, 'vragen'), done = sec(data, 'gedaan');
    const head = h('div', 'w-big', String(todo.items.length));
    head.append(h('small', null, todo.items.length === 1 ? 'wens te doen' : 'wensen te doen'));
    const parts = [head];
    const list = (title, items) => {
      if (!items.length) return;
      parts.push(h('p', 'ws-head', title));
      const ul = h('ul', 'ws-list');
      ul.append(...items);
      parts.push(ul);
    };
    list('Te doen', todo.items.map((it) => line(it.text, '', it.image ? '📎' : '')));
    list('Vragen', questions.items.map((it) => line(it.text, waitsOnYou(it) ? 'ws-you' : 'ws-claude', waitsOnYou(it) ? 'jij' : 'beantwoord')));
    list('Grote ideeën', ideas.ideas.map((idea) => {
      const open = idea.lines.some((l) => /\(nog invullen\)/i.test(l));
      return line(idea.title, open ? 'ws-you' : '', open ? 'mockup nodig' : 'klaar om te bouwen');
    }));
    if (!todo.items.length && !questions.items.length && !ideas.ideas.length) parts.push(h('p', 'w-note', 'Niets open. Nieuwe wens: zet hem in WENSEN.md in Obsidian.'));
    parts.push(h('p', 'w-sub ws-foot', `${done.items.length} gedaan · zeg "doe de wensen" tegen Claude`));
    body.replaceChildren(...parts);
  }

  async function load() {
    if (DASH.DEMO) return render(DEMO_DATA);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${HELPER}/wensen`, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch {
      card.hidden = true;   // alleen op de pc met het hulpprogramma
    }
  }

  card.hidden = true;
  DASH.every(60 * 1000, guard(load));
  load();
});
