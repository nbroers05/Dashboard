'use strict';

// Stand voor de telefoon-app (sinds 1.5.0, groot idee "Telefoon-app" fase A).
// De app kan zelf niet bij de Canvas-opdrachten met hun id's, Episodes Left (extensie in Firefox op de pc), Gmail en
// het aantal check-ins. Dit dashboard zet daarom één rij in de Supabase van het dashboard (dashboard_settings,
// sleutel `_telefoon.stand`, alleen Noahs account kan erbij) met per onderdeel een eigen tijd `at`:
//   { canvas: { at, items: [{ id, title, course, due, allDay }] }, episodes: { at, rows: [{ title, left, nieuw }] },
//     mail: { at, count, top: [{ from, subject, thread }] }, checkin: { at, day (JJJJ-MM-DD), count } }
// Elk apparaat schrijft alleen de onderdelen die het zelf echt heeft, en een onderdeel van een ander apparaat met een
// nieuwere tijd blijft staan (de laptop zonder extensie overschrijft Episodes dus niet).
// Het AH-loon zet widgets/ah.js zelf in `_telefoon.loon` (Noahs keuze, 12 nov 2026). Canvas-vinkjes staan al in
// dashboard_canvas_done. Hooguit eens per 2 minuten, en alleen als er iets veranderd is. Niet in demo.
(() => {
  const SB = window.DASH_SB;
  if (!SB || !SB.configured || DASH.DEMO) return;
  const { store } = DASH;
  const KEY = '_telefoon.stand';
  const MIN_GAP = 2 * 60000;
  let lastSent = '', lastAt = 0, timer = null;

  function canvasPart() {
    const items = window.DASH_CANVAS && DASH_CANVAS.items();
    if (!items) return null;   // geen agenda in deze browser
    const now = Date.now();
    return {
      items: items.filter((it) => it.due > now - 14 * 86400000 && it.due < now + 30 * 86400000)
        .map((it) => ({ id: it.id, title: it.name, course: it.course || '', due: it.due, allDay: !!it.allDay })),
    };
  }
  function episodesPart() {
    const data = store.get('episodes.data');
    if (!data || !data.rows || !data.updatedAt) return null;
    const seen = store.get('episodes.seen') || {};
    return {
      updatedAt: data.updatedAt,
      rows: data.rows.filter((r) => r.left > 0).map((r) => ({ title: r.title, left: r.left, nieuw: Math.max(0, r.left - (seen[r.title] ?? r.left)) })),
    };
  }
  function mailPart() {
    const m = window.DASH_MAIL;
    if (!m) return null;
    return { count: m.count, top: (m.mails || []).slice(0, 3).map((x) => ({ from: x.from, subject: x.subject, thread: x.thread })) };
  }
  function checkinPart() {
    if (!window.DASH_CHECKIN) return null;
    return { day: new Date().toLocaleDateString('sv'), count: DASH_CHECKIN.today() };   // JJJJ-MM-DD
  }

  // Sinds 1.6.0 (fase B): film van vanavond (Sterrenvoorspeller-extensie) en Spotify-maand (Spotify-inlog van deze browser)
  async function filmPart() {
    if (!window.DASH_FILM || !DASH_FILM.top) return null;
    try { return await DASH_FILM.top(); } catch { return null; }
  }
  function spotifyPart() {
    const t = store.get('spotify.top');
    if (!t || !t.at) return null;
    return { updatedAt: t.at, tracks: (t.tracks || []).slice(0, 5), artists: (t.artists || []).slice(0, 5) };
  }

  async function publish() {
    timer = null;
    if (!SB.linked()) return;
    const parts = { canvas: canvasPart(), episodes: episodesPart(), mail: mailPart(), checkin: checkinPart(), film: await filmPart(), spotify: spotifyPart() };
    const mine = JSON.stringify(parts);
    if (mine === lastSent) return;
    const now = Date.now();
    if (now - lastAt < MIN_GAP) { timer = setTimeout(publish, MIN_GAP - (now - lastAt)); return; }
    lastAt = now;
    try {
      const old = (await SB.flag(KEY)) || {};
      const out = { ...old };
      for (const [k, v] of Object.entries(parts)) {
        if (!v) continue;
        // Episodes: de stand van de extensie zelf telt (updatedAt), niet wanneer dit apparaat hem doorgaf
        if (k === 'episodes' && old.episodes && old.episodes.updatedAt && Date.parse(old.episodes.updatedAt) > Date.parse(v.updatedAt)) continue;
        if (k === 'spotify' && old.spotify && old.spotify.updatedAt > v.updatedAt) continue;
        out[k] = { at: now, ...v };
      }
      await SB.flag(KEY, out);
      lastSent = mine;
    } catch (e) {
      SB.fail(e);
    }
  }
  const soon = () => { if (!timer) timer = setTimeout(publish, 5000); };

  for (const ev of ['dash:calendar', 'dash:mail', 'dash:alerts', 'dash:sb-linked', 'dash:watchlist', 'storage']) window.addEventListener(ev, soon);
  DASH.every(5 * 60000, soon);
  setTimeout(soon, 8000);
})();
