'use strict';

// Media stack in Now Bar style: Spotify (via the Spotify link, works everywhere) plus whatever else plays on this PC
// (YouTube in the browser, the Spotify app, VLC, ...) via the helper (helper/media.py, only on this PC).
// The front card plays; the next one peeks out narrower at the bottom. Click it or swipe to switch.
(() => {
  const { h, DEMO } = DASH;
  const stack = document.getElementById('media-stack');
  const spotify = document.getElementById('spotify');
  if (!stack || !spotify) return;
  const HELPER = 'http://127.0.0.1:8765';

  const cards = new Map();   // id -> { el, refs, data, at, thumb }
  let sessions = [];
  let order = [];
  let front = null;
  let wasPlaying = new Set();   // what played last time (to see what JUST started)

  const svgIcon = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
  const ICON = {
    prev: svgIcon('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
    next: svgIcon('M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z'),
    play: '<svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  };
  const fmt = (sec) => {
    if (sec == null || !isFinite(sec)) return '';
    sec = Math.max(0, Math.floor(sec));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = String(sec % 60).padStart(2, '0');
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
  };

  // ---------- Cards ----------
  function makeCard(id) {
    const el = h('section', 'card player media-card');
    el.dataset.state = 'player';
    el.dataset.mediaId = id;
    const view = h('div', 'view player-view');
    const info = h('div', 'info');
    const app = h('p', 'eyebrow');
    const title = h('h1', 'title');
    const artist = h('p', 'artist');
    info.append(app, title, artist);
    const cover = new Image();
    cover.className = 'cover';
    cover.alt = '';
    cover.crossOrigin = 'anonymous';
    const progress = h('div', 'progress');
    const bar = h('div', 'bar');
    const fill = h('div', 'fill');
    bar.append(fill);
    const times = h('div', 'times');
    const pos = h('span'), dur = h('span');
    times.append(pos, dur);
    progress.append(bar, times);
    const controls = h('div', 'controls');
    const main = h('div', 'group main');
    const btn = (cls, label, html, action) => {
      const b = h('button', cls);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.innerHTML = html;
      b.onclick = (e) => { e.stopPropagation(); control(id, action); };
      return b;
    };
    const prev = btn('btn', 'Previous', ICON.prev, 'prev');
    const play = btn('btn pill play-btn', 'Afspelen/pauzeren', ICON.play, 'playpause');
    const next = btn('btn', 'Next', ICON.next, 'next');
    main.append(prev, play, next);
    // The same buttons on the right as for Spotify, so the layout doesn't jump; dimmed here with an explanation
    const extra = h('div', 'group extra');
    const why = 'Only for Spotify: this source doesn\'t pass this on';
    for (const [label, src] of [['Shuffle', 'shuffle'], ['Repeat', 'repeat'], ['Lyrics', 'lyrics-btn'], ['Save to library', 'save']]) {
      const b = h('button', 'btn small off');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-disabled', 'true');
      b.title = why;
      // The same icon as on the Spotify card (the first variant)
      const svg = document.querySelector(`#${src} svg`);
      if (svg) b.append(svg.cloneNode(true));
      b.onclick = (e) => e.stopPropagation();
      extra.append(b);
    }
    controls.append(main, extra);
    const meta = h('div', 'meta');
    const device = h('span', 'app-badge');
    meta.append(device);
    view.append(info, cover, progress, controls, meta);
    el.append(view);
    cover.onload = () => {
      const c = DASH.coverTint(cover);
      if (c) DASH.tint(id, c);
    };
    // Click on a card peeking out behind: to the front
    el.addEventListener('click', () => { if (el.dataset.pos !== '0') choose(id); });
    stack.append(el);
    const card = { el, refs: { app, title, artist, cover, fill, pos, dur, prev, play, next, device, progress } };
    cards.set(id, card);
    return card;
  }

  function fillCard(card, s) {
    const r = card.refs;
    // New data from the helper: tick on from now
    if (card.data !== s) card.at = Date.now();
    card.data = s;
    r.app.textContent = s.album ? `${s.app} · ${s.album}` : s.app;
    r.title.textContent = s.title || s.app;
    r.title.title = s.title;
    r.artist.textContent = s.artist || '';
    r.device.replaceChildren(h('i'), document.createTextNode(`On this PC · ${s.app}`));
    card.el.classList.toggle('playing', !!s.playing);
    r.play.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
    r.play.disabled = !s.canPlayPause;
    r.prev.disabled = !s.canPrev;
    r.next.disabled = !s.canNext;
    r.progress.style.visibility = s.duration ? '' : 'hidden';
    const src = s.thumb ? (s.thumb.startsWith('data:') ? s.thumb : HELPER + s.thumb) : fallbackCover(s.app);
    if (card.thumb !== src) {
      card.thumb = src;
      r.cover.src = src;
      card.el.style.setProperty('--cover', s.thumb ? `url("${src}")` : 'none');
    }
    tick(card);
  }

  // No cover: a color block with the app's first letter
  function fallbackCover(app) {
    const letter = (app || '?')[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5bd6"/><stop offset="1" stop-color="#d65b9a"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="64" font-family="sans-serif" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  // Tick the position on between two fetches
  function tick(card) {
    const s = card.data;
    if (!s || !s.duration) return;
    const since = s.playing ? (Date.now() - (s.updated && s.updated <= Date.now() ? s.updated : card.at)) / 1000 : 0;
    const p = Math.min(s.duration, (s.position || 0) + since);
    card.refs.fill.style.transform = `scaleX(${p / s.duration})`;
    card.refs.pos.textContent = fmt(p);
    card.refs.dur.textContent = fmt(s.duration);
  }
  (function loop() {
    requestAnimationFrame(loop);
    const c = cards.get(front);
    if (c && c.data && c.data.playing) tick(c);
  })();

  // ---------- Volgorde ----------
  // When nothing plays, Spotify and Windows sometimes return "nothing" for a moment: then a card disappeared for half a
  // second and came back. So a card only counts as gone after a few seconds without it (GRACE).
  const GRACE = 6000;
  let spotifySeen = 0;
  const spotifyHasTrack = () => {
    if (spotify.dataset.state === 'player') { spotifySeen = Date.now(); return true; }
    return Date.now() - spotifySeen < GRACE;
  };
  const isPlaying = (id) => (id === 'spotify' ? spotify.classList.contains('playing') : !!(cards.get(id) && cards.get(id).data && cards.get(id).data.playing));

  function layout() {
    // Spotify app twice? If the Spotify link already shows a track, leave out the Windows version of it
    const others = sessions.filter((s) => !(spotifyHasTrack() && s.app === 'Spotify'));
    const ids = others.map((s) => s.id);
    // Spotify card: when it shows something, or when there's nothing else (then log in/nothing playing as always)
    if (spotifyHasTrack() || !ids.length) ids.unshift('spotify');

    for (const s of others) fillCard(cards.get(s.id) || makeCard(s.id), s);
    for (const [id, c] of cards) if (!ids.includes(id)) { c.el.remove(); cards.delete(id); }

    // Who's in front: your own choice stays. Only when the front one is gone, or something new starts playing
    // while the front one is paused, does that move to the front by itself.
    const nowPlaying = new Set(ids.filter(isPlaying));
    const started = ids.find((id) => nowPlaying.has(id) && !wasPlaying.has(id) && id !== front);
    if (!ids.includes(front)) front = ids.find(isPlaying) || ids[0];
    else if (started && !isPlaying(front)) front = started;
    wasPlaying = nowPlaying;

    const rest = ids.filter((id) => id !== front).sort((a, b) => isPlaying(b) - isPlaying(a) || order.indexOf(a) - order.indexOf(b));
    order = [front, ...rest];
    const els = { spotify, ...Object.fromEntries([...cards].map(([id, c]) => [id, c.el])) };
    for (const [id, el] of Object.entries(els)) {
      const i = order.indexOf(id);
      el.dataset.pos = i < 0 || i > 2 ? 'hidden' : String(i);
      el.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
    }
    stack.classList.toggle('stacked-1', order.length === 2);
    stack.classList.toggle('stacked-2', order.length > 2);
    DASH.tintFront(front);
    dots();
  }

  function dots() {
    let box = stack.querySelector('.media-dots');
    if (order.length < 2) { if (box) box.remove(); return; }
    if (!box) { box = h('div', 'media-dots'); stack.append(box); }
    // A fixed order for the dots (not the stack order)
    const fixed = [...order].sort((a, b) => (a === 'spotify' ? -1 : b === 'spotify' ? 1 : a.localeCompare(b)));
    box.replaceChildren(...fixed.map((id) => {
      const b = h('button');
      b.type = 'button';
      b.setAttribute('aria-label', id === 'spotify' ? 'Spotify' : (cards.get(id).data || {}).app || 'Media');
      b.setAttribute('aria-current', id === front ? 'true' : 'false');
      b.onclick = () => choose(id);
      return b;
    }));
  }

  function choose(id) {
    front = id;
    layout();
  }

  // Click on the Spotify card when it peeks out behind: to the front (the other cards do this themselves)
  spotify.addEventListener('click', () => { if (spotify.dataset.pos !== '0') choose('spotify'); });

  // Swipe (phone/touchscreen): to the next card
  let startX = null;
  stack.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  stack.addEventListener('pointerup', (e) => {
    if (startX == null || order.length < 2) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60 && !e.target.closest('.bar, button')) choose(dx < 0 ? order[1] : order[order.length - 1]);
  });

  // ---------- Fetching and controlling ----------
  let demoState = { playing: false, position: 1234 };
  function demoSessions() {
    return [{
      id: 'demo-yt', app: 'Firefox', title: 'lofi hip hop radio – beats to relax/study to', artist: 'Lofi Girl', album: '',
      playing: demoState.playing, position: demoState.position, duration: 3 * 3600, updated: demoState.at || Date.now(),
      thumb: null, canNext: false, canPrev: false, canPlayPause: true,
    }];
  }

  let failures = 0;
  const seen = new Map();   // sessie-id -> { s, at }: laatst gezien
  async function load() {
    if (DEMO) { sessions = demoSessions(); return layout(); }
    // Not reachable (phone, other PC, helper off): try less and less often
    if (failures && Date.now() % (Math.min(failures, 15) * 2000) > 2000) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${HELPER}/media`, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const now = Date.now();
      for (const s of (await res.json()).items || []) seen.set(s.id, { s, at: now });
      failures = 0;
    } catch {
      failures++;
    }
    for (const [id, v] of seen) if (Date.now() - v.at > GRACE) seen.delete(id);
    sessions = [...seen.values()].map((v) => v.s);
    layout();
  }

  async function control(id, action) {
    if (DEMO) {
      if (action === 'playpause') {
        demoState = { playing: !demoState.playing, position: demoState.position + (demoState.playing ? (Date.now() - demoState.at) / 1000 : 0), at: Date.now() };
      }
      return load();
    }
    // Show right away, then fetch the real state
    const c = cards.get(id);
    if (c && c.data && action === 'playpause') { c.data.playing = !c.data.playing; c.el.classList.toggle('playing', c.data.playing); }
    try { await fetch(`${HELPER}/media/${action}?id=${encodeURIComponent(id)}`, { method: 'POST' }); } catch {}
    setTimeout(load, 400);
  }

  // Spotify changes (another track, pause, login): order again
  new MutationObserver(() => layout()).observe(spotify, { attributes: true, attributeFilter: ['class', 'data-state'] });

  DASH.every(2000, load);
  load();
})();
