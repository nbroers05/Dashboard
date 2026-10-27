'use strict';

// Mediastapel in Now Bar-stijl: Spotify (via de Spotify-koppeling, werkt overal) plus wat er verder op deze pc
// afspeelt (YouTube in de browser, de Spotify-app, VLC, ...) via het hulpprogramma (helper/media.py, alleen op deze pc).
// De kaart vooraan speelt; de volgende steekt er onderaan smaller uit. Klik daarop of veeg om te wisselen.
(() => {
  const { h, DEMO } = DASH;
  const stack = document.getElementById('media-stack');
  const spotify = document.getElementById('spotify');
  if (!stack || !spotify) return;
  const HELPER = 'http://127.0.0.1:8765';
  const AUTO_AFTER = 8000;   // zo lang na je eigen keuze niet automatisch wisselen

  const cards = new Map();   // id -> { el, refs, data, at, thumb }
  let sessions = [];
  let order = [];
  let front = null;
  let chosenAt = 0;

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

  // ---------- Kaarten ----------
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
    const prev = btn('btn', 'Vorige', ICON.prev, 'prev');
    const play = btn('btn pill play-btn', 'Afspelen/pauzeren', ICON.play, 'playpause');
    const next = btn('btn', 'Volgende', ICON.next, 'next');
    main.append(prev, play, next);
    controls.append(main);
    const meta = h('div', 'meta');
    const device = h('span', 'app-badge');
    meta.append(device);
    view.append(info, cover, progress, controls, meta);
    el.append(view);
    cover.onload = () => {
      const c = DASH.coverTint(cover);
      if (c) DASH.tint(id, c);
    };
    // Klik op een kaart die erachter steekt: naar voren
    el.addEventListener('click', () => { if (el.dataset.pos !== '0') choose(id); });
    stack.append(el);
    const card = { el, refs: { app, title, artist, cover, fill, pos, dur, prev, play, next, device, progress } };
    cards.set(id, card);
    return card;
  }

  function fillCard(card, s) {
    const r = card.refs;
    // Nieuwe gegevens van het hulpprogramma: vanaf nu doortikken
    if (card.data !== s) card.at = Date.now();
    card.data = s;
    r.app.textContent = s.album ? `${s.app} · ${s.album}` : s.app;
    r.title.textContent = s.title || s.app;
    r.title.title = s.title;
    r.artist.textContent = s.artist || '';
    r.device.replaceChildren(h('i'), document.createTextNode(`Op deze pc · ${s.app}`));
    card.el.classList.toggle('playing', !!s.playing);
    r.play.setAttribute('aria-label', s.playing ? 'Pauzeren' : 'Afspelen');
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

  // Geen hoes: kleurvlak met de eerste letter van de app
  function fallbackCover(app) {
    const letter = (app || '?')[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5bd6"/><stop offset="1" stop-color="#d65b9a"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="64" font-family="sans-serif" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  // Positie doortikken tussen twee keer ophalen
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
  const spotifyHasTrack = () => spotify.dataset.state === 'player';
  const isPlaying = (id) => (id === 'spotify' ? spotify.classList.contains('playing') : !!(cards.get(id) && cards.get(id).data && cards.get(id).data.playing));

  function layout() {
    // Spotify-app dubbel? Als de Spotify-koppeling al een nummer toont, de Windows-versie ervan weglaten
    const others = sessions.filter((s) => !(spotifyHasTrack() && s.app === 'Spotify'));
    const ids = others.map((s) => s.id);
    // Spotify-kaart: als hij iets toont, of als er verder niets is (dan inloggen/niets aan het spelen zoals altijd)
    if (spotifyHasTrack() || !ids.length) ids.unshift('spotify');

    for (const s of others) fillCard(cards.get(s.id) || makeCard(s.id), s);
    for (const [id, c] of cards) if (!ids.includes(id)) { c.el.remove(); cards.delete(id); }

    // Wie vooraan: je eigen keuze, tenzij die stilstaat terwijl iets anders speelt
    if (!ids.includes(front)) front = ids.find(isPlaying) || ids[0];
    else if (!isPlaying(front) && Date.now() - chosenAt > AUTO_AFTER) front = ids.find(isPlaying) || front;

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
    // Vaste volgorde voor de bolletjes (niet de stapelvolgorde)
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
    chosenAt = Date.now();
    layout();
  }

  // Vegen (telefoon/touchscreen): naar de volgende kaart
  let startX = null;
  stack.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  stack.addEventListener('pointerup', (e) => {
    if (startX == null || order.length < 2) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60 && !e.target.closest('.bar, button')) choose(dx < 0 ? order[1] : order[order.length - 1]);
  });

  // ---------- Ophalen en bedienen ----------
  let demoState = { playing: false, position: 1234 };
  function demoSessions() {
    return [{
      id: 'demo-yt', app: 'Firefox', title: 'lofi hip hop radio – beats to relax/study to', artist: 'Lofi Girl', album: '',
      playing: demoState.playing, position: demoState.position, duration: 3 * 3600, updated: demoState.at || Date.now(),
      thumb: null, canNext: false, canPrev: false, canPlayPause: true,
    }];
  }

  let failures = 0;
  async function load() {
    if (DEMO) { sessions = demoSessions(); return layout(); }
    // Niet bereikbaar (telefoon, andere pc, hulpprogramma uit): steeds minder vaak proberen
    if (failures && Date.now() % (Math.min(failures, 15) * 2000) > 2000) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${HELPER}/media`, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sessions = (await res.json()).items || [];
      failures = 0;
    } catch {
      sessions = [];
      failures++;
    }
    layout();
  }

  async function control(id, action) {
    if (DEMO) {
      if (action === 'playpause') {
        demoState = { playing: !demoState.playing, position: demoState.position + (demoState.playing ? (Date.now() - demoState.at) / 1000 : 0), at: Date.now() };
      }
      return load();
    }
    // Meteen tonen, daarna de echte stand ophalen
    const c = cards.get(id);
    if (c && c.data && action === 'playpause') { c.data.playing = !c.data.playing; c.el.classList.toggle('playing', c.data.playing); }
    try { await fetch(`${HELPER}/media/${action}?id=${encodeURIComponent(id)}`, { method: 'POST' }); } catch {}
    setTimeout(load, 400);
  }

  // Spotify verandert (ander nummer, pauze, inloggen): opnieuw ordenen
  new MutationObserver(() => layout()).observe(spotify, { attributes: true, attributeFilter: ['class', 'data-state'] });

  DASH.every(2000, load);
  load();
})();
