'use strict';

// Games: a page of its own (like Feeds) via the games icon in the top bar or address #games; Esc or the same icon = back.
//   Higher/lower   two posters from your Letterboxd: click the film you rated higher (equal = both right)
//   Guess the poster  a poster of a film you logged, blurry and zoomed in at first, getting clearer
//   2048           for in between (arrow keys/WASD or swipe)
// Higher/lower can also use the Letterboxd average (from the archive; without a token TMDB) (games.hl.mode).
// Films: with the data token your whole list with ratings (data/aggregates/films.json in the private repo), otherwise the latest
// logs from data/letterboxd.json. Posters and averages via TMDB (config.tmdbApiKey, cache tmdb.games2). Scores and records only in
// this browser (localStorage games.*), nothing to the archive.
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  const btn = bar && bar.querySelector('.tb-games');
  if (!btn) return;
  const CFG = window.DASHBOARD_CONFIG || {};
  const REPO = CFG.dataRepo || 'nbroers05/dashboard-data';
  const TMDB_KEY = CFG.tmdbApiKey || '';

  const page = h('section', 'gm-page');
  page.id = 'games';
  page.setAttribute('aria-label', 'Games');
  page.hidden = true;
  const head = h('header', 'card gm-head');
  const tabs = h('div', 'fd-tabs gm-tabs');
  const stage = h('div', 'card gm-stage');
  head.append(h('h2', null, 'Games'), tabs);
  page.append(head, stage);
  document.body.append(page);
  const place = () => { page.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 12)}px`; };
  for (const ev of ['resize', 'dash:layout', 'load']) window.addEventListener(ev, () => { if (!page.hidden) place(); });
  new ResizeObserver(() => { if (!page.hidden) place(); }).observe(bar);

  const GAMES = [['hl', 'Higher/lower'], ['poster', 'Guess the poster'], ['2048', '2048']];
  let game = store.get('games.tab') || 'hl';
  const best = (k) => +(store.get(`games.best.${k}`) || 0);
  const setBest = (k, v) => { if (v > best(k)) store.set(`games.best.${k}`, v); };
  const stars = (r) => '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(the|de|het|a|an)\s+/, '').replace(/[^a-z0-9]+/g, '');
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ---------- Films and posters ----------
  let films = null, filmsSource = '';
  async function loadFilms() {
    if (films) return films;
    const token = store.get('data.token');
    if (token && !DASH.DEMO) {
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/contents/data/aggregates/films.json`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' },
        });
        if (res.ok) {
          films = (await res.json()).films.map(([title, year, rating, tmdb, lb, lbn]) => ({ title, year, rating, tmdb, lb, lbn }));
          filmsSource = `${films.filter((f) => f.rating).length} films with your rating, ${films.filter((f) => f.lb != null).length} with a Letterboxd average`;
          return films;
        }
      } catch { /* fall back to the public list */ }
    }
    const pub = await DASH.getJSON(`data/letterboxd.json?t=${Math.floor(Date.now() / 900000)}`).catch(() => ({ logs: [] }));
    const seen = new Set();
    films = (pub.logs || []).filter((l) => l.rating && !seen.has(l.title) && seen.add(l.title))
      .map((l) => ({ title: l.title, year: l.year, rating: l.rating, tmdb: l.tmdbId, poster: l.poster }));
    filmsSource = `${films.length} films from your latest logs${token ? '' : ' (link the data archive for all your films)'}`;
    return films;
  }
  const PCACHE = 'tmdb.games2';   // { "title|year": { url, avg, n } } (avg = TMDB average 0-10, n = number of votes)
  async function info(f) {
    const key = `${f.title}|${f.year}`;
    const cache = store.get(PCACHE) || {};
    if (key in cache) return cache[key];
    if (!TMDB_KEY) return { url: f.poster || null, avg: null, n: 0 };
    let out = { url: f.poster || null, avg: null, n: 0 };
    try {
      const j = f.tmdb
        ? await DASH.getJSON(`https://api.themoviedb.org/3/movie/${f.tmdb}?api_key=${TMDB_KEY}`)
        : ((await DASH.getJSON(`https://api.themoviedb.org/3/search/movie?${new URLSearchParams({ api_key: TMDB_KEY, query: f.title, ...(f.year ? { year: f.year } : {}) })}`)).results || [])[0];
      if (j) out = { url: f.poster || (j.poster_path ? `https://image.tmdb.org/t/p/w500${j.poster_path}` : null), avg: j.vote_average ?? null, n: j.vote_count || 0 };
    } catch { return out; }   // network error: don't remember
    const c2 = store.get(PCACHE) || {};
    c2[key] = out;
    store.set(PCACHE, c2);
    return out;
  }
  const poster = async (f) => (f.poster || (await info(f)).url);
  function posterBox(f, cls = '') {
    const box = h('div', `gm-poster ${cls}`);
    box.append(h('span', 'gm-poster-fb', f.title));
    poster(f).then((u) => {
      if (!u) return;
      const img = new Image();
      img.alt = '';
      img.onload = () => box.append(img);
      img.src = u;
    });
    return box;
  }

  // ---------- Higher/lower ----------
  // Two modes: "My rating" (your Letterboxd rating) and "Average": the Letterboxd average from the archive
  // (letterboxd-films, from the Sterrenvoorspeller). Without a token it falls back to the average of TMDB users
  // (converted to 5). Equal (within 0.05) counts as both right.
  let hlMode = store.get('games.hl.mode') || 'mine';
  let hl = null;
  const score = (f) => (hlMode === 'mine' ? f.rating : f.crowd);
  const bestKey = () => (hlMode === 'mine' ? 'hl' : 'hlcrowd');
  async function prepared(list, not) {
    // Average mode: only films with enough votes on TMDB (at least 50)
    for (let i = 0; i < 12; i++) {
      const f = pick(list);
      if (f === not) continue;
      if (hlMode === 'mine') { if (!not || f.rating !== not.rating || i > 6) return f; continue; }
      if (f.lb != null) {   // Letterboxd average from the archive
        f.crowd = f.lb;
        f.crowdSrc = 'Letterboxd';
        if (!not || Math.abs(f.crowd - not.crowd) >= 0.05 || i > 8) return f;
        continue;
      }
      if (lbCount() > 50) continue;   // enough Letterboxd films: only use those
      const inf = await info(f);
      if (inf.avg != null && inf.n >= 50) {
        f.crowd = Math.round(inf.avg * 5) / 10;   // 0-10 → 0-5, to 0.1
        f.crowdSrc = 'TMDB';
        if (!not || Math.abs(f.crowd - not.crowd) >= 0.05 || i > 8) return f;
      }
    }
    return list.find((f) => f !== not && (hlMode === 'mine' || f.crowd != null)) || null;
  }
  const lbCount = () => (films || []).filter((f) => f.lb != null).length;
  async function startHL() {
    const all = await loadFilms();
    const list = hlMode === 'mine' ? all.filter((f) => f.rating) : lbCount() > 50 ? all.filter((f) => f.lb != null) : all;
    if (list.length < 2) return stage.replaceChildren(h('p', 'w-note', 'Not enough films with a rating yet.'));
    stage.replaceChildren(h('p', 'w-note', 'Finding films…'));
    const a = await prepared(list, null);
    const b = a && await prepared(list, a);
    if (!a || !b) return stage.replaceChildren(h('p', 'w-note', 'Couldn\'t find films with an average (TMDB not reachable?).'));
    hl = { list, a, b, streak: 0, busy: false, mode: hlMode };
    renderHL();
  }
  const fmtScore = (f) => (hlMode === 'mine' ? stars(f.rating) : `★ ${f.crowd.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} average`);
  function renderHL(chosen) {
    const { a, b } = hl;
    const modes = h('div', 'fd-tabs gm-modes');
    for (const [m, label] of [['mine', 'My rating'], ['crowd', `Average (${lbCount() > 50 ? 'Letterboxd' : 'TMDB'})`]]) {
      const x = h('button', null, label);
      x.type = 'button';
      x.setAttribute('aria-pressed', hlMode === m);
      x.onclick = () => { if (hlMode === m) return; hlMode = m; store.set('games.hl.mode', m); hl = null; startHL(); };
      modes.append(x);
    }
    const top = h('div', 'gm-row');
    top.append(h('p', 'gm-q', hlMode === 'mine' ? 'Which film did you rate higher?' : 'Which film has a higher average?'), modes,
      h('p', 'gm-score', `streak ${hl.streak} · record ${best(bestKey())}`));
    const duel = h('div', 'gm-duel');
    const card = (f, side) => {
      const c = h('button', 'gm-card');
      c.type = 'button';
      const show = side === 'a' || chosen;
      if (chosen) {
        const other = side === 'a' ? b : a;
        c.classList.add(score(f) >= score(other) - 0.04 ? 'good' : 'bad');
        if (chosen === side) c.classList.add('picked');
      }
      const extra = hlMode === 'crowd' && show && f.rating ? ` · you ${stars(f.rating)}` : '';
      c.append(posterBox(f), h('b', 'gm-title', `${f.title}${f.year ? ` (${f.year})` : ''}`), h('span', show ? 'gm-stars' : 'gm-hidden', show ? `${fmtScore(f)}${extra}` : '? click the highest'));
      c.onclick = () => choose(side);
      return c;
    };
    duel.append(card(a, 'a'), h('span', 'gm-vs', 'vs'), card(b, 'b'));
    const note = hlMode === 'mine' ? `An equal rating counts as both right. ${filmsSource}.`
      : lbCount() > 50 ? `Letterboxd average (from the Sterrenvoorspeller, 19 Oct 2026); films from your watchlist take part too. ${filmsSource}.`
        : `Average of TMDB users (converted to 5), only films with at least 50 votes. Link the data archive for the Letterboxd averages.`;
    stage.replaceChildren(top, duel, h('p', 'w-sub gm-foot', `${note} Records only in this browser.`));
  }
  async function choose(side) {
    if (hl.busy) return;
    hl.busy = true;
    const mine = side === 'a' ? hl.a : hl.b, other = side === 'a' ? hl.b : hl.a;
    const ok = score(mine) >= score(other) - 0.04;
    if (ok) { hl.streak++; setBest(bestKey(), hl.streak); } else hl.streak = 0;
    renderHL(side);
    // Green or red glow around the whole tile
    stage.classList.remove('glow-good', 'glow-bad');
    void stage.offsetWidth;
    stage.classList.add(ok ? 'glow-good' : 'glow-bad');
    const mode = hlMode;
    const [na, nb] = ok ? [hl.b, null] : [await prepared(hl.list, null), null];
    const nextB = await prepared(hl.list, na);
    setTimeout(() => {
      if (mode !== hlMode || !hl) return;
      hl.a = na; hl.b = nextB || nb;
      hl.busy = false;
      if (game === 'hl' && !page.hidden) renderHL();
    }, ok ? 1100 : 1800);
  }

  // ---------- Guess the poster ----------
  const LEVELS = [[26, 2.3], [17, 1.9], [10, 1.55], [5, 1.25], [0, 1]];   // [vervaging px, zoom]
  let pz = null;
  async function startPoster() {
    const list = await loadFilms();
    stage.replaceChildren(h('p', 'w-note', 'Finding a poster…'));
    for (let i = 0; i < 8; i++) {
      const f = pick(list);
      const url = await poster(f);
      if (url) {
        pz = { f, url, level: 0, total: pz ? pz.total : 0, done: false, list };
        return renderPoster();
      }
    }
    stage.replaceChildren(h('p', 'w-note', 'Couldn\'t find posters (TMDB not reachable?).'));
  }
  function renderPoster(msg) {
    const [blur, zoom] = LEVELS[pz.done ? LEVELS.length - 1 : pz.level];
    const top = h('div', 'gm-row');
    top.append(h('p', 'gm-q', pz.done ? `${pz.f.title}${pz.f.year ? ` (${pz.f.year})` : ''}${pz.f.rating ? ` · you gave ${stars(pz.f.rating)}` : ''}` : 'Which film is this?'),
      h('p', 'gm-score', `score ${pz.total} · record ${best('poster')}`));
    const frame = h('div', 'gm-guess-frame');
    const img = new Image();
    img.alt = '';
    img.src = pz.url;
    img.style.filter = `blur(${blur}px)`;
    img.style.transform = `scale(${zoom})`;
    frame.append(img);
    const form = h('form', 'gm-guess');
    const input = h('input');
    input.setAttribute('list', 'gm-titles');
    input.placeholder = 'Type the title…';
    input.autocomplete = 'off';
    input.disabled = pz.done;
    const dl = document.getElementById('gm-titles') || h('datalist');
    if (!dl.id) { dl.id = 'gm-titles'; document.body.append(dl); }
    if (dl.childElementCount !== pz.list.length) dl.replaceChildren(...pz.list.map((f) => { const o = h('option'); o.value = f.title; return o; }));
    const go = h('button', 'w-btn', 'Guess');
    const hint = h('button', 'w-btn ghost', 'Clearer');
    hint.type = 'button';
    const give = h('button', 'w-btn ghost', 'Give up');
    give.type = 'button';
    const next = h('button', 'w-btn', 'Next');
    next.type = 'button';
    form.append(input, ...(pz.done ? [next] : [go, hint, give]));
    const points = LEVELS.length - pz.level;
    const note = h('p', `w-sub gm-msg${msg && msg.ok === false ? ' bad' : msg && msg.ok ? ' good' : ''}`, msg ? msg.text : `Right at this step = ${points} point${points === 1 ? '' : 's'}. Wrong or "Clearer" = the poster gets sharper.`);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (pz.done) return;
      const ok = input.value.trim() && norm(input.value) === norm(pz.f.title);
      if (ok) {
        pz.total += points;
        setBest('poster', pz.total);
        pz.done = true;
        return renderPoster({ ok: true, text: `Right! +${points}` });
      }
      if (pz.level >= LEVELS.length - 1) { pz.done = true; pz.total = 0; return renderPoster({ ok: false, text: 'Too bad, score back to 0.' }); }
      pz.level++;
      renderPoster({ ok: false, text: input.value.trim() ? 'Not right, a bit clearer now.' : 'A bit clearer now.' });
    };
    hint.onclick = () => { if (pz.level < LEVELS.length - 1) { pz.level++; renderPoster(); } };
    give.onclick = () => { pz.done = true; pz.total = 0; renderPoster({ ok: false, text: 'Gave up, score back to 0.' }); };
    next.onclick = () => startPoster();
    stage.replaceChildren(top, frame, form, note);
    if (!pz.done) input.focus({ preventScroll: true }); else next.focus({ preventScroll: true });
  }

  // ---------- 2048 ----------
  // Tiles are separate blocks with a fixed place (row, column); on a move they slide to their new place with a CSS
  // transition, merged tiles "pop". State in games.2048.state (an old state without tiles: new game).
  let g2 = store.get('games.2048.state');
  if (!g2 || !Array.isArray(g2.tiles)) g2 = null;
  let tileId = g2 ? Math.max(0, ...g2.tiles.map((t) => t.id)) + 1 : 1;
  let boardEl = null, scoreEl = null, msgEl = null;
  const els = new Map();   // tegel-id -> element
  function new2048() {
    g2 = { tiles: [], score: 0, over: false };
    els.clear();
    add2048(); add2048();
    save2048();
    render2048();
  }
  function add2048() {
    const used = new Set(g2.tiles.map((t) => t.r * 4 + t.c));
    const free = [...Array(16).keys()].filter((i) => !used.has(i));
    if (!free.length) return;
    const i = pick(free);
    g2.tiles.push({ id: tileId++, v: Math.random() < 0.9 ? 2 : 4, r: Math.floor(i / 4), c: i % 4, fresh: true });
  }
  const save2048 = () => store.set('games.2048.state', { ...g2, tiles: g2.tiles.map(({ id, v, r, c }) => ({ id, v, r, c })) });
  function move(dir) {
    if (!g2 || g2.over) return;
    const grid = Array.from({ length: 4 }, () => Array(4).fill(null));
    for (const t of g2.tiles) { t.fresh = false; t.merged = false; grid[t.r][t.c] = t; }
    const vertical = dir === 'up' || dir === 'down', reverse = dir === 'right' || dir === 'down';
    let moved = false;
    const gone = [];
    for (let line = 0; line < 4; line++) {
      const cells = [0, 1, 2, 3].map((k) => (reverse ? 3 - k : k));
      let target = 0, last = null;
      for (const k of cells) {
        const t = vertical ? grid[k][line] : grid[line][k];
        if (!t) continue;
        const pos = (n) => (reverse ? 3 - n : n);
        if (last && last.v === t.v && !last.merged) {
          // Merge: this tile slides to the previous one's place and disappears after that
          t.r = last.r; t.c = last.c; gone.push(t);
          last.merged = true; last.next = last.v * 2;   // the value only changes after sliding
          g2.score += last.next;
          moved = true;
          continue;
        }
        const p = pos(target++);
        const [nr, nc] = vertical ? [p, line] : [line, p];
        if (t.r !== nr || t.c !== nc) moved = true;
        t.r = nr; t.c = nc;
        last = t;
      }
    }
    if (!moved) return;
    paint2048();                                    // slide first (also the tiles that merge into another)
    g2.tiles = g2.tiles.filter((t) => !gone.includes(t));
    for (const t of g2.tiles) if (t.next) { t.v = t.next; delete t.next; }
    add2048();
    const at = new Map(g2.tiles.map((t) => [t.r * 4 + t.c, t.v]));
    const canMove = at.size < 16 || [...at].some(([i, v]) => (i % 4 < 3 && at.get(i + 1) === v) || (i < 12 && at.get(i + 4) === v));
    g2.over = !canMove;
    setBest('2048', g2.score);
    save2048();
    setTimeout(paint2048, calm() ? 0 : 130);      // then remove merged tiles, add the new tile
  }
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paint2048() {
    if (!boardEl) return;
    const alive = new Set();
    for (const t of g2.tiles) {
      alive.add(t.id);
      let el = els.get(t.id);
      if (!el) {
        el = h('div', 'gm-tile');
        if (t.fresh) el.classList.add('new');
        els.set(t.id, el);
        boardEl.append(el);
      }
      el.style.setProperty('--r', t.r);
      el.style.setProperty('--c', t.c);
      if (el.textContent !== String(t.v)) {
        if (el.textContent && t.merged) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        el.textContent = String(t.v);
        el.dataset.v = t.v > 2048 ? 'big' : t.v;
      }
    }
    for (const [id, el] of els) if (!alive.has(id) && !g2.tiles.some((t) => t.id === id)) { el.remove(); els.delete(id); }
    if (scoreEl) scoreEl.textContent = `score ${g2.score} · record ${best('2048')}`;
    if (msgEl) msgEl.textContent = g2.over ? 'No moves left!' : 'Slide with the arrow keys (or WASD), or swipe.';
  }
  function render2048() {
    if (!g2) return new2048();
    const top = h('div', 'gm-row');
    const again = h('button', 'w-btn ghost', 'New game');
    again.type = 'button';
    again.onclick = new2048;
    msgEl = h('p', 'gm-q');
    scoreEl = h('p', 'gm-score');
    top.append(msgEl, scoreEl, again);
    boardEl = h('div', 'gm-2048');
    for (let i = 0; i < 16; i++) boardEl.append(h('div', 'gm-cell'));
    els.clear();
    let sx = null, sy = null;
    boardEl.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; boardEl.setPointerCapture(e.pointerId); });
    boardEl.addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    stage.replaceChildren(top, boardEl);
    paint2048();
  }
  document.addEventListener('keydown', (e) => {
    if (page.hidden || game !== '2048' || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key];
    if (dir) { e.preventDefault(); move(dir); }
  });

  // ---------- Tabjes ----------
  function show(id) {
    game = id;
    store.set('games.tab', id);
    for (const b of tabs.children) b.setAttribute('aria-pressed', b.dataset.game === id);
    stage.dataset.game = id;
    if (id === 'hl') return hl ? renderHL() : startHL();
    if (id === 'poster') return pz && !pz.done ? renderPoster() : startPoster();
    return render2048();
  }
  for (const [id, label] of GAMES) {
    const b = h('button', null, label);
    b.type = 'button';
    b.dataset.game = id;
    b.onclick = () => show(id);
    tabs.append(b);
  }

  // ---------- Opening and closing (same rules as Feeds and My data) ----------
  let pushed = false;
  function setOpen(open, fromHash) {
    page.hidden = !open;
    document.body.classList.toggle('games-open', open);
    btn.setAttribute('aria-pressed', open);
    btn.title = open ? 'Back to the dashboard (Esc)' : 'Games';
    if (open) {
      window.dispatchEvent(new CustomEvent('dash:page', { detail: 'games' }));
      if (!fromHash && location.hash !== '#games') {
        if (location.hash === '#feeds' || location.hash === '#mydata') history.replaceState(null, '', '#games');
        else { history.pushState(null, '', '#games'); pushed = true; }
      }
      window.scrollTo(0, 0);
      place();
      show(game);
    } else if (!fromHash && location.hash === '#games') {
      if (pushed) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
      pushed = false;
    }
  }
  btn.onclick = () => setOpen(page.hidden);
  window.addEventListener('dash:page', (e) => { if (e.detail !== 'games' && !page.hidden) setOpen(false, true); });
  window.addEventListener('popstate', () => setOpen(location.hash === '#games', true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !page.hidden && !document.querySelector('dialog[open]') && document.activeElement.tagName !== 'INPUT') setOpen(false);
  });
  if (location.hash === '#games') setOpen(true, true);
})();
