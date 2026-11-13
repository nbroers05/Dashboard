'use strict';

// Lyrics next to the player. Spotify gives no lyrics via its API; these come from LRCLIB (free, no key).
// Synced lyrics run along with the track; click a line to seek there.
DASH.widget('lyrics', (card, body, guard) => {
  const { h, store } = DASH;
  const dash = document.querySelector('.dashboard');
  const btn = document.getElementById('lyrics-btn');
  const box = document.getElementById('ly-scroll');
  const KEY = 'lyrics.open';
  const API = 'https://lrclib.net/api';

  const cache = new Map();        // track-id → { lines: [{t, text}] | null, plain: string | null, instrumental }
  let shown = null;               // track id that's in the tile now
  let lines = null;
  let active = -1;
  let userScrollUntil = 0;
  let tickTimer = null;

  // ---------- Opening / closing ----------
  function setOpen(open) {
    card.hidden = !open;
    dash.classList.toggle('lyrics-open', open);
    btn.setAttribute('aria-pressed', String(open));
    store.set(KEY, open);
    clearInterval(tickTimer);
    if (open) {
      show(window.DASH_TRACK);
      tickTimer = setInterval(guard(tick), 250);
    }
  }
  btn.addEventListener('click', () => setOpen(card.hidden));
  document.getElementById('lyrics-close').addEventListener('click', () => setOpen(false));

  // ---------- Ophalen ----------
  // "winter 4ever - Sped Up" → "winter 4ever"; also (Remastered 2009), feat. etc.
  const clean = (s) => s
    .replace(/\s*[-–]\s*(sped up|slowed.*|nightcore|remaster(ed)?.*|live.*|radio edit|single version|mono|stereo).*$/i, '')
    .replace(/\s*[([](sped up|slowed[^)\]]*|feat\.[^)\]]*|with [^)\]]*|remaster[^)\]]*|\d{4} remaster[^)\]]*)[)\]]/gi, '')
    .trim();

  const parseLrc = (lrc) => lrc.split('\n').map((row) => {
    const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    return m ? { t: (Number(m[1]) * 60 + Number(m[2])) * 1000, text: m[3].trim() } : null;
  }).filter(Boolean);

  // 404 = not found; any other error (LRCLIB down, 502 etc.) throws, so it isn't remembered as 'no lyrics'
  async function get(path, params) {
    const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`);
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    throw new Error(`LRCLIB ${res.status}`);
  }

  async function find(track) {
    const durS = Math.round(track.duration / 1000);
    // 1. Exactly on title, artist, album and duration
    const exact = await get('get', { track_name: track.name, artist_name: track.artist, album_name: track.album, duration: durS });
    if (exact) return { hit: exact, scale: 1 };
    // 2. Search with a cleaned-up title; the closest duration with lyrics wins
    const name = clean(track.name);
    let list = (await get('search', { track_name: name, artist_name: track.artist })) || [];
    if (!list.length && name !== track.name) {
      list = (await get('search', { q: `${name} ${track.artist}` })) || [];
    }
    const withText = list.filter((x) => x.syncedLyrics || x.plainLyrics || x.instrumental);
    if (!withText.length) return null;
    withText.sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || Math.abs(a.duration - durS) - Math.abs(b.duration - durS));
    const hit = withText[0];
    // Sped up / slowed version: convert the original's times to this version
    const ratio = hit.duration ? durS / hit.duration : 1;
    return { hit, scale: Math.abs(ratio - 1) > 0.03 && ratio > 0.5 && ratio < 1.6 ? ratio : 1 };
  }

  async function load(track) {
    if (cache.has(track.id)) return cache.get(track.id);
    let entry = { lines: null, plain: null, instrumental: false };
    const found = await find(track);
    if (found) {
      const { hit, scale } = found;
      entry = {
        lines: hit.syncedLyrics ? parseLrc(hit.syncedLyrics).map((l) => ({ ...l, t: l.t * scale })) : null,
        plain: hit.plainLyrics || null,
        instrumental: !!hit.instrumental,
      };
    }
    cache.set(track.id, entry);
    return entry;
  }

  // ---------- Showing ----------
  function note(text) {
    lines = null;
    box.classList.remove('plain');
    box.replaceChildren(h('p', 'ly-note', text));
  }

  async function show(track) {
    if (card.hidden) return;
    if (!track) { shown = null; return note('Play a track to see the lyrics.'); }
    if (shown === track.id) return;
    shown = track.id;
    note('Finding lyrics…');
    let entry;
    try {
      entry = await load(track);
    } catch {
      if (shown === track.id) note('Couldn\'t fetch the lyrics (LRCLIB isn\'t responding). The next track or opening again tries again.');
      cache.delete(track.id);
      shown = null;
      return;
    }
    if (shown !== track.id) return; // another track in the meantime
    active = -1;
    box.scrollTop = 0;
    if (entry.instrumental) return note('Instrumentaal ♪');
    if (entry.lines && entry.lines.length) {
      lines = entry.lines;
      box.classList.remove('plain');
      box.replaceChildren(...lines.map((l, i) => {
        const p = h('p', 'ly-line', l.text || '♪');
        p.dataset.i = i;
        return p;
      }));
      tick();
      return;
    }
    if (entry.plain) {
      lines = null;
      box.classList.add('plain');
      box.replaceChildren(h('p', 'ly-note', 'Not synced'), ...entry.plain.split('\n').map((t) => h('p', 'ly-line', t || ' ')));
      return;
    }
    note('No lyrics found for this track.');
  }

  // Light up the current line and keep it in the middle (except right after you scroll yourself)
  function tick() {
    if (!lines || card.hidden || typeof window.spotifyPosition !== 'function') return;
    const pos = window.spotifyPosition() + 250;
    let idx = -1;
    for (let i = 0; i < lines.length && lines[i].t <= pos; i++) idx = i;
    if (idx === active) return;
    active = idx;
    box.querySelectorAll('.ly-line').forEach((p, i) => {
      p.classList.toggle('now', i === idx);
      p.classList.toggle('past', i < idx);
    });
    const cur = box.children[idx];
    if (cur && Date.now() > userScrollUntil) {
      box.scrollTo({ top: cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2, behavior: 'smooth' });
    }
  }

  ['wheel', 'touchmove', 'pointerdown'].forEach((type) => box.addEventListener(type, () => { userScrollUntil = Date.now() + 4000; }, { passive: true }));
  box.addEventListener('click', (e) => {
    const p = e.target.closest('.ly-line');
    if (!p || !lines || !window.spotifySeek) return;
    const l = lines[Number(p.dataset.i)];
    if (l) { userScrollUntil = 0; window.spotifySeek(Math.round(l.t)); }
  });

  // The tile changed size (thin/big player, another screen): the current line back in the middle right away (0.60.2)
  window.addEventListener('resize', () => {
    const cur = active >= 0 && box.children[active];
    if (cur && !card.hidden && Date.now() > userScrollUntil) requestAnimationFrame(() => { box.scrollTop = cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2; });
  });
  window.addEventListener('dash:track', guard((e) => show(e.detail)));
  if (store.get(KEY)) setOpen(true);
});
