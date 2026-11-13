'use strict';

// Status for the phone app (since 1.5.0, big idea "Phone app" phase A).
// The app can't reach the Canvas assignments with their ids, Episodes Left (extension in Firefox on the PC), Gmail and
// the number of check-ins itself. So this dashboard puts one row in the dashboard's Supabase (dashboard_settings,
// key `_phone.status`, only Noah's account can read it) with its own time `at` per part:
//   { canvas: { at, items: [{ id, title, course, due, allDay }] }, episodes: { at, rows: [{ title, left, new }] },
//     mail: { at, count, top: [{ from, subject, thread }] }, checkin: { at, day (YYYY-MM-DD), count } }
// Every device only writes the parts it really has, and a part from another device with a newer time
// stays (so the laptop without the extension doesn't overwrite Episodes).
// widgets/ah.js puts the AH wage settings in `_phone.wage` itself (Noah's choice, 12 Nov 2026). Canvas check marks are already in
// dashboard_canvas_done. At most once per 2 minutes, and only when something changed. Not in demo.
// The old key `_telefoon.stand` (with `nieuw`) for app versions before 0.8.0 is no longer written since 1.7.1.
(() => {
  const SB = window.DASH_SB;
  if (!SB || !SB.configured || DASH.DEMO) return;
  const { store } = DASH;
  const KEY = '_phone.status';
  const MIN_GAP = 2 * 60000;
  let lastSent = '', lastAt = 0, timer = null;

  function canvasPart() {
    const items = window.DASH_CANVAS && DASH_CANVAS.items();
    if (!items) return null;   // no agenda in this browser
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
      rows: data.rows.filter((r) => r.left > 0).map((r) => ({ title: r.title, left: r.left, new: Math.max(0, r.left - (seen[r.title] ?? r.left)) })),
    };
  }
  function mailPart() {
    const m = window.DASH_MAIL;
    if (!m) return null;
    return { count: m.count, top: (m.mails || []).slice(0, 3).map((x) => ({ from: x.from, subject: x.subject, thread: x.thread })) };
  }
  function checkinPart() {
    if (!window.DASH_CHECKIN) return null;
    return { day: new Date().toLocaleDateString('sv'), count: DASH_CHECKIN.today() };   // YYYY-MM-DD
  }

  // Since 1.6.0 (phase B): film tonight (Sterrenvoorspeller extension) and Spotify month (this browser's Spotify login)
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
        // Episodes: the extension's own status counts (updatedAt), not when this device passed it on
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
