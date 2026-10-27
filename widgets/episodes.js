'use strict';

// Afleveringen die je nog moet kijken, doorgegeven door de Episodes Left-extensie (v0.1.2+).
// Covers komen van AniList (gratis, geen sleutel nodig) en worden een maand bewaard.
DASH.widget('w-episodes', (card, body, guard) => {
  const { h, store, img } = DASH;
  const KEY = 'episodes.data';
  const COVERS = 'anilist.covers.v2';   // v2: de oude cache kon mislukte pogingen een maand onthouden
  const MONTH = 30 * 86400000;
  const DAY = 86400000;

  let current = null;
  let lastJson = null;
  let inflight = null;
  let retryTimer = null;

  function emptyState() {
    const box = h('div', 'w-empty');
    box.append(h('p', null, 'Nog geen gegevens van Episodes Left.'));
    const a = h('a', 'w-btn', 'Open LiveChart');
    a.href = 'https://www.livechart.me/library';
    a.target = '_blank';
    a.rel = 'noopener';
    box.append(a);
    body.replaceChildren(box);
  }

  // Een gevonden cover blijft een maand bewaard; "niet gevonden" maar een dag, zodat het vanzelf opnieuw geprobeerd wordt
  const fresh = (c) => c && Date.now() - c.at < (c.img ? MONTH : DAY);

  // Zonder "Season 2", "3rd Season", "(2024)" enz. vindt AniList een titel vaak wel
  const simplify = (t) => t.replace(/\(\d{4}\)|\b(\d+(st|nd|rd|th)\s+season|season\s+\d+|part\s+\d+|cour\s+\d+)\b/gi, '').replace(/\s+/g, ' ').trim();

  // Let op: met Media(search) maakt één onbekende titel het héle verzoek leeg (404).
  // Page(...){ media(...) } geeft dan alleen voor die ene titel een lege lijst.
  async function anilist(titles) {
    const query = `{ ${titles.map((t, i) => `a${i}: Page(perPage: 1) { media(search: ${JSON.stringify(t)}, type: ANIME) { coverImage { large color } siteUrl } }`).join(' ')} }`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await res.json().catch(() => ({}));
    // Geen data = echt mislukt (bijv. te veel verzoeken): dan niets onthouden
    if (!res.ok || !json.data) throw new Error(`AniList ${res.status}`);
    return titles.map((t, i) => (json.data[`a${i}`] && json.data[`a${i}`].media[0]) || null);
  }

  // Covers voor alle titels in één verzoek ophalen (alleen wat we nog niet hebben); nooit twee verzoeken tegelijk
  function loadCovers(titles) {
    if (inflight) return inflight;
    inflight = (async () => {
      const cache = store.get(COVERS) || {};
      const missing = titles.filter((t) => !fresh(cache[t])).slice(0, 20);
      if (!missing.length) return cache;
      let found = await anilist(missing);
      // Niet gevonden: nog één keer met een kortere titel
      const retry = missing.filter((t, i) => !found[i] && simplify(t) !== t);
      if (retry.length) {
        const second = await anilist(retry.map(simplify)).catch(() => []);
        found = found.map((m, i) => m || second[retry.indexOf(missing[i])] || null);
      }
      missing.forEach((t, i) => {
        const m = found[i];
        cache[t] = { at: Date.now(), img: m && m.coverImage.large, color: m && m.coverImage.color, url: m && m.siteUrl };
      });
      store.set(COVERS, cache);
      return cache;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  function render(data, covers = store.get(COVERS) || {}) {
    current = data;
    if (!data || !data.rows) return emptyState();
    const rows = data.rows.filter((r) => r.left > 0).sort((a, b) => b.left - a.left || a.title.localeCompare(b.title));
    if (!rows.length) {
      const box = h('div', 'w-empty');
      box.append(h('div', 'w-big', '✓'), h('p', null, 'Alles bijgekeken.'));
      body.replaceChildren(box);
      return;
    }
    const total = rows.reduce((a, r) => a + r.left, 0);
    const head = h('div', 'w-big', String(total));
    head.append(h('small', null, total === 1 ? 'aflevering te gaan' : 'afleveringen te gaan'));

    const strip = h('div', 'ep-covers');
    for (const r of rows) {
      const c = covers[r.title] || {};
      const a = h('a', 'ep-cover');
      a.href = r.url || c.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${r.title}: nog ${r.left}`;
      a.append(img(c.img, '', r.title, c.color), h('span', 'ep-badge', `+${r.left}`), h('span', 'ep-name', r.title));
      strip.append(a);
    }
    body.replaceChildren(head, strip);

    const missing = rows.some((r) => !fresh(covers[r.title]));
    if (missing) {
      loadCovers(rows.map((r) => r.title))
        .then((cv) => { if (current === data) render(data, cv); })
        // Mislukt (bijv. AniList druk)? Over 2 minuten nog eens
        .catch(() => { clearTimeout(retryTimer); retryTimer = setTimeout(() => current && render(current), 120000); });
    }
  }

  window.addEventListener('message', guard((e) => {
    if (e.source !== window || !e.data || e.data.source !== 'episodes-left') return;
    const data = { rows: e.data.rows, updatedAt: e.data.updatedAt };
    // De extensie stuurt vaak dezelfde lijst meerdere keren: alleen opnieuw tekenen als er iets veranderd is
    const json = JSON.stringify(data.rows);
    if (json === lastJson) return;
    lastJson = json;
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
      ],
    });
  }

  render(store.get(KEY));
  window.postMessage({ type: 'episodes-left:request' }, location.origin);
});
