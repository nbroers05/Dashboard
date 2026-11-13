'use strict';

// Episodes you still have to watch, passed on by the Episodes Left extension (v0.1.2+).
// Covers come from AniList (free, no key needed) and are kept for a month.
DASH.widget('w-episodes', (card, body, guard) => {
  const { h, store, img } = DASH;
  const KEY = 'episodes.data';
  const COVERS = 'anilist.covers.v3';   // v3: search again after the fix for curly apostrophes (0.46.4)
  const MONTH = 30 * 86400000;
  const DAY = 86400000;

  let current = null;
  let lastJson = null;
  let inflight = null;
  let retryTimer = null;

  function emptyState() {
    const box = h('div', 'w-empty');
    box.append(h('p', null, 'No data from Episodes Left yet.'));
    const a = h('a', 'w-btn', 'Open LiveChart');
    a.href = 'https://www.livechart.me/users/library';
    a.target = '_blank';
    a.rel = 'noopener';
    box.append(a);
    body.replaceChildren(box);
  }

  // A found cover is kept for a month; "not found" only for a day, so it's tried again by itself
  const fresh = (c) => c && Date.now() - c.at < (c.img ? MONTH : DAY);

  // Without "Season 2", "3rd Season", "(2024)" etc. AniList often does find a title
  const simplify = (t) => t.replace(/\(\d{4}\)|\b(\d+(st|nd|rd|th)\s+season|season\s+\d+|part\s+\d+|cour\s+\d+)\b/gi, '').replace(/\s+/g, ' ').trim();

  // Note: with Media(search) one unknown title empties the WHOLE request (404).
  // Page(...){ media(...) } then only gives an empty list for that one title.
  // AniList doesn't find curly apostrophes ("JoJo’s"), straight ones it does: so we search for those with '.
  async function anilist(titles) {
    const term = (t) => JSON.stringify(t.replace(/[‘’]/g, "'"));
    const query = `{ ${titles.map((t, i) => `a${i}: Page(perPage: 1) { media(search: ${term(t)}, type: ANIME) { coverImage { large color } siteUrl } }`).join(' ')} }`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await res.json().catch(() => ({}));
    // No data = really failed (e.g. too many requests): then remember nothing
    if (!res.ok || !json.data) throw new Error(`AniList ${res.status}`);
    return titles.map((t, i) => (json.data[`a${i}`] && json.data[`a${i}`].media[0]) || null);
  }

  // Fetch covers for all titles in one request (only what we don't have yet); never two requests at the same time
  function loadCovers(titles) {
    if (inflight) return inflight;
    inflight = (async () => {
      const cache = store.get(COVERS) || {};
      const missing = titles.filter((t) => !fresh(cache[t])).slice(0, 20);
      if (!missing.length) return cache;
      let found = await anilist(missing);
      // Not found: once more with a shorter title
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

  // Notification for a new episode: more are open than the last time you looked.
  // The first time is only remembered. ✕ (seen) or watching yourself moves the counter along.
  const SEEN = 'episodes.seen';
  function newEpisodeAlerts(all) {
    const now = Object.fromEntries(all.map((r) => [r.title, r.left]));
    let seen = store.get(SEEN);
    if (!seen) { store.set(SEEN, now); seen = now; }
    // Watched (fewer left): update right away, that's not a notification
    let changed = false;
    for (const [t, left] of Object.entries(now)) if (seen[t] != null && left < seen[t]) { seen[t] = left; changed = true; }
    if (changed) store.set(SEEN, seen);
    const fresh = all.filter((r) => r.left > (seen[r.title] ?? 0));
    DASH.alert('episodes', fresh.map((r) => {
      const extra = r.left - (seen[r.title] ?? 0);
      return {
        level: 'info',
        icon: '📺',
        text: extra === 1 ? `New episode: ${r.title}` : `${extra} new episodes: ${r.title}`,
        sub: `Episodes Left · ${r.left} still to watch`,
        onDismiss: () => { const s = store.get(SEEN) || {}; s[r.title] = r.left; store.set(SEEN, s); newEpisodeAlerts(current.rows); },
      };
    }));
  }

  function render(data, covers = store.get(COVERS) || {}) {
    current = data;
    if (!data || !data.rows) return emptyState();
    const rows = data.rows.filter((r) => r.left > 0).sort((a, b) => b.left - a.left || a.title.localeCompare(b.title));
    if (!rows.length) {
      const box = h('div', 'w-empty');
      box.append(h('div', 'w-big', '✓'), h('p', null, 'All caught up.'));
      body.replaceChildren(box);
      return;
    }
    newEpisodeAlerts(data.rows);
    const total = rows.reduce((a, r) => a + r.left, 0);
    const head = h('div', 'w-big', String(total));
    head.append(h('small', null, total === 1 ? 'episode to go' : 'episodes to go'));

    const strip = h('div', 'ep-covers');
    for (const r of rows) {
      const c = covers[r.title] || {};
      const a = h('a', 'ep-cover');
      a.href = r.url || c.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${r.title}: ${r.left} left`;
      a.append(img(c.img, '', r.title, c.color), h('span', 'ep-badge', `+${r.left}`), h('span', 'ep-name', r.title));
      strip.append(a);
    }
    body.replaceChildren(head, strip);

    const missing = rows.some((r) => !fresh(covers[r.title]));
    if (missing) {
      loadCovers(rows.map((r) => r.title))
        .then((cv) => { if (current === data) render(data, cv); })
        // Failed (e.g. AniList busy)? Try again in 2 minutes
        .catch(() => { clearTimeout(retryTimer); retryTimer = setTimeout(() => current && render(current), 120000); });
    }
  }

  window.addEventListener('message', guard((e) => {
    if (e.source !== window || !e.data || e.data.source !== 'episodes-left') return;
    const data = { rows: e.data.rows, updatedAt: e.data.updatedAt };
    // The extension often sends the same list several times: only redraw when something changed
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
