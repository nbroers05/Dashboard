'use strict';

// Afleveringen die je nog moet kijken, doorgegeven door de Episodes Left-extensie (v0.1.2+).
// De extensie stuurt een bericht naar deze pagina; we bewaren het laatste zodat het ook na herladen blijft staan.
DASH.widget('w-episodes', (card, body, guard) => {
  const { h, store, fmtDay, fmtTime } = DASH;
  const KEY = 'episodes.data';
  const MAX = 5;

  function render(data) {
    if (!data || !data.rows) {
      body.replaceChildren(h('p', 'w-note', 'Geen gegevens. Dit werkt in Firefox met Episodes Left 0.1.2 (met dashboard-koppeling). Open daarna één keer livechart.me.'));
      return;
    }
    const rows = data.rows.filter((r) => r.left > 0).sort((a, b) => b.left - a.left || a.title.localeCompare(b.title));
    const total = rows.reduce((a, r) => a + r.left, 0);
    if (!rows.length) {
      body.replaceChildren(h('div', 'w-mid', 'Alles bijgekeken ✓'));
      return;
    }
    const head = h('div', 'w-row');
    head.append(h('div', 'w-big', String(total)), h('span', 'w-sub', total === 1 ? 'aflevering te gaan' : 'afleveringen te gaan'));
    const list = h('ul', 'w-list');
    for (const r of rows.slice(0, MAX)) {
      const li = h('li');
      li.append(h('span', 'n', `+${r.left}`));
      const t = h(r.url ? 'a' : 'span', 't', r.title);
      if (r.url) { t.href = r.url; t.target = '_blank'; t.rel = 'noopener'; }
      li.append(t);
      list.append(li);
    }
    body.replaceChildren(head, list);
    if (rows.length > MAX) body.append(h('span', 'w-more', `+${rows.length - MAX} series meer`));
    if (data.updatedAt) {
      const u = new Date(data.updatedAt).getTime();
      body.append(h('span', 'w-more', `LiveChart ${fmtDay(u)} ${fmtTime(u)}`));
    }
  }

  window.addEventListener('message', guard((e) => {
    if (e.source !== window || !e.data || e.data.source !== 'episodes-left') return;
    const data = { rows: e.data.rows, updatedAt: e.data.updatedAt };
    store.set(KEY, data);
    render(data);
  }));

  if (DASH.DEMO) {
    return render({
      updatedAt: new Date().toISOString(),
      rows: [
        { title: 'Frieren: Beyond Journey\'s End Season 2', left: 4 },
        { title: 'Dandadan', left: 3 },
        { title: 'The Apothecary Diaries', left: 2 },
        { title: 'Spy x Family', left: 1 },
        { title: 'Kaiju No. 8', left: 1 },
        { title: 'Blue Lock', left: 1 },
      ],
    });
  }

  render(store.get(KEY));
  // Vraag de extensie om verse gegevens (als die al geladen is)
  window.postMessage({ type: 'episodes-left:request' }, location.origin);
});
