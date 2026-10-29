'use strict';

// Spelletjes: eigen pagina (zoals Feeds) via het spelletjes-icoon in de topbalk of adres #games; Esc of hetzelfde icoon = terug.
//   Hoger/lager    twee posters uit je Letterboxd: klik de film die jij een hoger cijfer gaf (gelijk = allebei goed)
//   Raad de poster een poster van een film die je gelogd hebt, eerst wazig en ingezoomd, steeds duidelijker
//   2048           voor tussendoor (pijltjes/WASD of vegen)
// Films: met het data-token je hele lijst met cijfers (data/aggregates/films.json in de privé repo), anders de laatste
// logs uit data/letterboxd.json. Posters via TMDB (config.tmdbApiKey, cache tmdb.games). Scores en records alleen in
// deze browser (localStorage games.*), niets naar het archief.
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
  page.setAttribute('aria-label', 'Spelletjes');
  page.hidden = true;
  const head = h('header', 'card gm-head');
  const tabs = h('div', 'fd-tabs gm-tabs');
  const stage = h('div', 'card gm-stage');
  head.append(h('h2', null, 'Spelletjes'), tabs);
  page.append(head, stage);
  document.body.append(page);
  const place = () => { page.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 12)}px`; };
  for (const ev of ['resize', 'dash:layout', 'load']) window.addEventListener(ev, () => { if (!page.hidden) place(); });
  new ResizeObserver(() => { if (!page.hidden) place(); }).observe(bar);

  const GAMES = [['hl', 'Hoger/lager'], ['poster', 'Raad de poster'], ['2048', '2048']];
  let game = store.get('games.tab') || 'hl';
  const best = (k) => +(store.get(`games.best.${k}`) || 0);
  const setBest = (k, v) => { if (v > best(k)) store.set(`games.best.${k}`, v); };
  const stars = (r) => '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(the|de|het|a|an)\s+/, '').replace(/[^a-z0-9]+/g, '');
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ---------- Films en posters ----------
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
          films = (await res.json()).films.map(([title, year, rating, tmdb]) => ({ title, year, rating, tmdb }));
          filmsSource = `${films.length} films uit je Letterboxd`;
          return films;
        }
      } catch { /* val terug op de openbare lijst */ }
    }
    const pub = await DASH.getJSON(`data/letterboxd.json?t=${Math.floor(Date.now() / 900000)}`).catch(() => ({ logs: [] }));
    const seen = new Set();
    films = (pub.logs || []).filter((l) => l.rating && !seen.has(l.title) && seen.add(l.title))
      .map((l) => ({ title: l.title, year: l.year, rating: l.rating, tmdb: l.tmdbId, poster: l.poster }));
    filmsSource = `${films.length} films uit je laatste logs${token ? '' : ' (koppel het data-archief voor al je films)'}`;
    return films;
  }
  const PCACHE = 'tmdb.games';
  async function poster(f) {
    if (f.poster) return f.poster;
    const key = `${f.title}|${f.year}`;
    const cache = store.get(PCACHE) || {};
    if (key in cache) return cache[key];
    if (!TMDB_KEY) return null;
    let url = null;
    try {
      const j = f.tmdb
        ? await DASH.getJSON(`https://api.themoviedb.org/3/movie/${f.tmdb}?api_key=${TMDB_KEY}`)
        : ((await DASH.getJSON(`https://api.themoviedb.org/3/search/movie?${new URLSearchParams({ api_key: TMDB_KEY, query: f.title, ...(f.year ? { year: f.year } : {}) })}`)).results || [])[0];
      if (j && j.poster_path) url = `https://image.tmdb.org/t/p/w500${j.poster_path}`;
    } catch { return null; }   // netwerkfout: niet onthouden
    const c2 = store.get(PCACHE) || {};
    c2[key] = url;
    store.set(PCACHE, c2);
    return url;
  }
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

  // ---------- Hoger/lager ----------
  let hl = null;
  async function startHL() {
    const list = (await loadFilms()).filter((f) => f.rating);
    if (list.length < 2) return stage.replaceChildren(h('p', 'w-note', 'Nog te weinig films met een cijfer.'));
    const a = pick(list);
    hl = { list, a, b: nextB(list, a), streak: 0, busy: false };
    renderHL();
  }
  function nextB(list, a) {
    // Vaker een ander cijfer dan hetzelfde, anders is het te makkelijk "gelijk"
    for (let i = 0; i < 8; i++) { const b = pick(list); if (b !== a && (b.rating !== a.rating || i > 5)) return b; }
    return list.find((f) => f !== a);
  }
  function renderHL(chosen) {
    const { a, b } = hl;
    const top = h('div', 'gm-row');
    top.append(h('p', 'gm-q', 'Welke film gaf jij een hoger cijfer?'), h('p', 'gm-score', `reeks ${hl.streak} · record ${best('hl')}`));
    const duel = h('div', 'gm-duel');
    const card = (f, side) => {
      const c = h('button', 'gm-card');
      c.type = 'button';
      const show = side === 'a' || chosen;
      if (chosen) {
        const other = side === 'a' ? b : a;
        c.classList.add(f.rating >= other.rating ? 'good' : 'bad');
        if (chosen === side) c.classList.add('picked');
      }
      c.append(posterBox(f), h('b', 'gm-title', `${f.title}${f.year ? ` (${f.year})` : ''}`), h('span', show ? 'gm-stars' : 'gm-hidden', show ? stars(f.rating) : '? klik de hoogste'));
      c.onclick = () => choose(side);
      return c;
    };
    duel.append(card(a, 'a'), h('span', 'gm-vs', 'vs'), card(b, 'b'));
    stage.replaceChildren(top, duel, h('p', 'w-sub gm-foot', `Gelijk cijfer telt allebei goed. ${filmsSource}. Records alleen in deze browser.`));
  }
  function choose(side) {
    if (hl.busy) return;
    hl.busy = true;
    const mine = side === 'a' ? hl.a : hl.b, other = side === 'a' ? hl.b : hl.a;
    const ok = mine.rating >= other.rating;
    if (ok) { hl.streak++; setBest('hl', hl.streak); } else hl.streak = 0;
    renderHL(side);
    setTimeout(() => {
      if (ok) { hl.a = hl.b; hl.b = nextB(hl.list, hl.a); } else { hl.a = pick(hl.list); hl.b = nextB(hl.list, hl.a); }
      hl.busy = false;
      if (game === 'hl' && !page.hidden) renderHL();
    }, ok ? 1100 : 1800);
  }

  // ---------- Raad de poster ----------
  const LEVELS = [[26, 2.3], [17, 1.9], [10, 1.55], [5, 1.25], [0, 1]];   // [vervaging px, zoom]
  let pz = null;
  async function startPoster() {
    const list = await loadFilms();
    stage.replaceChildren(h('p', 'w-note', 'Poster zoeken…'));
    for (let i = 0; i < 8; i++) {
      const f = pick(list);
      const url = await poster(f);
      if (url) {
        pz = { f, url, level: 0, total: pz ? pz.total : 0, done: false, list };
        return renderPoster();
      }
    }
    stage.replaceChildren(h('p', 'w-note', 'Kon geen posters vinden (TMDB niet bereikbaar?).'));
  }
  function renderPoster(msg) {
    const [blur, zoom] = LEVELS[pz.done ? LEVELS.length - 1 : pz.level];
    const top = h('div', 'gm-row');
    top.append(h('p', 'gm-q', pz.done ? `${pz.f.title}${pz.f.year ? ` (${pz.f.year})` : ''}${pz.f.rating ? ` · jij gaf ${stars(pz.f.rating)}` : ''}` : 'Welke film is dit?'),
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
    input.placeholder = 'Typ de titel…';
    input.autocomplete = 'off';
    input.disabled = pz.done;
    const dl = document.getElementById('gm-titles') || h('datalist');
    if (!dl.id) { dl.id = 'gm-titles'; document.body.append(dl); }
    if (dl.childElementCount !== pz.list.length) dl.replaceChildren(...pz.list.map((f) => { const o = h('option'); o.value = f.title; return o; }));
    const go = h('button', 'w-btn', 'Raad');
    const hint = h('button', 'w-btn ghost', 'Duidelijker');
    hint.type = 'button';
    const give = h('button', 'w-btn ghost', 'Geef op');
    give.type = 'button';
    const next = h('button', 'w-btn', 'Volgende');
    next.type = 'button';
    form.append(input, ...(pz.done ? [next] : [go, hint, give]));
    const points = LEVELS.length - pz.level;
    const note = h('p', `w-sub gm-msg${msg && msg.ok === false ? ' bad' : msg && msg.ok ? ' good' : ''}`, msg ? msg.text : `Goed in deze stap = ${points} punt${points === 1 ? '' : 'en'}. Fout of "duidelijker" = de poster wordt scherper.`);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (pz.done) return;
      const ok = input.value.trim() && norm(input.value) === norm(pz.f.title);
      if (ok) {
        pz.total += points;
        setBest('poster', pz.total);
        pz.done = true;
        return renderPoster({ ok: true, text: `Goed! +${points}` });
      }
      if (pz.level >= LEVELS.length - 1) { pz.done = true; pz.total = 0; return renderPoster({ ok: false, text: 'Helaas, score terug naar 0.' }); }
      pz.level++;
      renderPoster({ ok: false, text: input.value.trim() ? 'Niet goed, iets duidelijker nu.' : 'Iets duidelijker nu.' });
    };
    hint.onclick = () => { if (pz.level < LEVELS.length - 1) { pz.level++; renderPoster(); } };
    give.onclick = () => { pz.done = true; pz.total = 0; renderPoster({ ok: false, text: 'Opgegeven, score terug naar 0.' }); };
    next.onclick = () => startPoster();
    stage.replaceChildren(top, frame, form, note);
    if (!pz.done) input.focus({ preventScroll: true }); else next.focus({ preventScroll: true });
  }

  // ---------- 2048 ----------
  let g2 = store.get('games.2048.state') || null;
  function new2048() { g2 = { cells: Array(16).fill(0), score: 0, over: false }; add2048(); add2048(); save2048(); render2048(); }
  function add2048() {
    const empty = g2.cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (empty.length) g2.cells[pick(empty)] = Math.random() < 0.9 ? 2 : 4;
  }
  const save2048 = () => store.set('games.2048.state', g2);
  function slide(row) {
    const nums = row.filter(Boolean), out = [];
    let gained = 0;
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] === nums[i + 1]) { out.push(nums[i] * 2); gained += nums[i] * 2; i++; } else out.push(nums[i]);
    }
    while (out.length < 4) out.push(0);
    return [out, gained];
  }
  function move(dir) {
    if (!g2 || g2.over) return;
    const idx = (r, c) => (dir === 'left' ? r * 4 + c : dir === 'right' ? r * 4 + 3 - c : dir === 'up' ? c * 4 + r : (3 - c) * 4 + r);
    let moved = false;
    for (let r = 0; r < 4; r++) {
      const line = [0, 1, 2, 3].map((c) => g2.cells[idx(r, c)]);
      const [res, gained] = slide(line);
      res.forEach((v, c) => { if (g2.cells[idx(r, c)] !== v) moved = true; g2.cells[idx(r, c)] = v; });
      g2.score += gained;
    }
    if (!moved) return;
    add2048();
    const canMove = g2.cells.some((v, i) => !v || (i % 4 < 3 && v === g2.cells[i + 1]) || (i < 12 && v === g2.cells[i + 4]));
    if (!canMove) g2.over = true;
    setBest('2048', g2.score);
    save2048();
    render2048();
  }
  function render2048() {
    if (!g2) return new2048();
    const top = h('div', 'gm-row');
    const again = h('button', 'w-btn ghost', 'Nieuw spel');
    again.type = 'button';
    again.onclick = new2048;
    const sc = h('p', 'gm-score', `score ${g2.score} · record ${best('2048')}`);
    top.append(h('p', 'gm-q', g2.over ? 'Geen zetten meer!' : 'Schuif met de pijltjes (of WASD), of veeg.'), sc, again);
    const board = h('div', 'gm-2048');
    for (const v of g2.cells) {
      const c = h('div', 'gm-tile', v ? String(v) : '');
      if (v) c.dataset.v = v > 2048 ? 'big' : v;
      board.append(c);
    }
    let sx = null, sy = null;
    board.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; board.setPointerCapture(e.pointerId); });
    board.addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    stage.replaceChildren(top, board);
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

  // ---------- Openen en sluiten (zelfde afspraken als Feeds en Mijn data) ----------
  let pushed = false;
  function setOpen(open, fromHash) {
    page.hidden = !open;
    document.body.classList.toggle('games-open', open);
    btn.setAttribute('aria-pressed', open);
    btn.title = open ? 'Terug naar het dashboard (Esc)' : 'Spelletjes';
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
