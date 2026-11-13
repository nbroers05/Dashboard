'use strict';

// Episodes Left log for the private archive: saves per series how many episodes are still open, so the
// archive can work out per day which series you watched and how many episodes. The extension itself stays unchanged:
// we listen to the same message as the Episodes tile ({ title, left }). The number of aired episodes
// comes from AniList (the same query as the covers), so watched = aired − still open; that way a new
// episode you watch right away counts too. Only with the data token (DASH_DATA), never in demo mode.
// At most one snapshot per half hour, and only when something changed. Data: data/episodes-left/<yyyy-mm>.csv.
(() => {
  const { store } = DASH;
  const D = window.DASH_DATA;
  if (!D || DASH.DEMO) return;
  const AIRED = 'episodes.aired';      // { title: { at, aired, id } }, valid for 6 hours
  const LAST = 'episodes.logged';      // { at, sig }
  const COLS = ['timestamp_utc', 'timestamp_local', 'source', 'collected_at', 'id', 'title', 'left', 'aired', 'watched', 'anilist_id'];
  let busy = false, timer = 0;

  async function aired(titles) {
    const cache = store.get(AIRED) || {};
    const missing = titles.filter((t) => !cache[t] || Date.now() - cache[t].at > 6 * 3600000).slice(0, 25);
    if (missing.length) {
      const query = `{ ${missing.map((t, i) => `a${i}: Page(perPage: 1) { media(search: ${JSON.stringify(t.replace(/[‘’]/g, "'"))}, type: ANIME) { id episodes status nextAiringEpisode { episode } } }`).join(' ')} }`;
      const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        missing.forEach((t, i) => {
          const m = json.data[`a${i}`] && json.data[`a${i}`].media[0];
          const n = m ? (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.episodes) : null;
          cache[t] = { at: Date.now(), aired: Number.isFinite(n) ? n : null, id: m ? m.id : null };
        });
        store.set(AIRED, cache);
      }
    }
    return cache;
  }

  async function log(rows) {
    if (busy || !D.token() || !rows || !rows.length) return;
    const sig = JSON.stringify(rows.map((r) => [r.title, r.left]).sort());
    const last = store.get(LAST) || {};
    if (last.sig === sig) return;
    const wait = (last.at || 0) + 30 * 60000 - Date.now();
    if (wait > 0) { clearTimeout(timer); timer = setTimeout(() => log(rows), wait + 1000); return; }   // later alsnog
    busy = true;
    try {
      const info = await aired(rows.map((r) => r.title)).catch(() => store.get(AIRED) || {});
      const now = new Date();
      const stamp = D.utcIso(now), local = D.localIso(now);
      const out = rows.map((r) => {
        const a = info[r.title] || {};
        const ok = a.aired != null && a.aired >= r.left;
        return { timestamp_utc: stamp, timestamp_local: local, source: 'episodes-left', collected_at: stamp, id: `${stamp}|${r.title}`,
          title: r.title, left: r.left, aired: ok ? a.aired : '', watched: ok ? a.aired - r.left : '', anilist_id: a.id || '' };
      });
      await D.appendRows(`data/episodes-left/${local.slice(0, 7)}.csv`, COLS, out, `Episodes Left ${stamp}`);
      store.set(LAST, { at: Date.now(), sig });
    } catch (e) {
      console.warn('Episodes Left log:', e.message);   // again next time; the tile itself just keeps working
    } finally {
      busy = false;
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.source === 'episodes-left') log(e.data.rows);
  });
})();
