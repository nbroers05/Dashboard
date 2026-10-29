'use strict';

// Spelletjes: eigen pagina (zoals Feeds) via het spelletjes-icoon in de topbalk of adres #games; Esc of hetzelfde icoon = terug.
//   Hoger/lager    twee posters uit je Letterboxd: klik de film die jij een hoger cijfer gaf (gelijk = allebei goed)
//   Raad de poster een poster van een film die je gelogd hebt, eerst wazig en ingezoomd, steeds duidelijker
//   2048           voor tussendoor (pijltjes/WASD of vegen)
// Hoger/lager kan ook op het gemiddelde van TMDB-gebruikers (games.hl.mode).
// Films: met het data-token je hele lijst met cijfers (data/aggregates/films.json in de privé repo), anders de laatste
// logs uit data/letterboxd.json. Posters en gemiddelden via TMDB (config.tmdbApiKey, cache tmdb.games2). Scores en records alleen in
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
  const PCACHE = 'tmdb.games2';   // { "titel|jaar": { url, avg, n } } (avg = TMDB-gemiddelde 0-10, n = aantal stemmen)
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
    } catch { return out; }   // netwerkfout: niet onthouden
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

  // ---------- Hoger/lager ----------
  // Twee standen: "Mijn cijfer" (jouw Letterboxd-cijfer) en "Gemiddelde" (het gemiddelde van TMDB-gebruikers, op 5
  // omgerekend; Letterboxd zelf heeft geen openbare API). Gelijk (binnen 0,05) telt allebei goed.
  let hlMode = store.get('games.hl.mode') || 'mine';
  let hl = null;
  const score = (f) => (hlMode === 'mine' ? f.rating : f.crowd);
  const bestKey = () => (hlMode === 'mine' ? 'hl' : 'hlcrowd');
  async function prepared(list, not) {
    // Gemiddelde-stand: alleen films met genoeg stemmen op TMDB (minstens 50)
    for (let i = 0; i < 12; i++) {
      const f = pick(list);
      if (f === not) continue;
      if (hlMode === 'mine') { if (!not || f.rating !== not.rating || i > 6) return f; continue; }
      const inf = await info(f);
      if (inf.avg != null && inf.n >= 50) {
        f.crowd = Math.round(inf.avg * 5) / 10;   // 0-10 → 0-5, op 0,1
        if (!not || Math.abs(f.crowd - not.crowd) >= 0.05 || i > 8) return f;
      }
    }
    return list.find((f) => f !== not && (hlMode === 'mine' || f.crowd != null)) || null;
  }
  async function startHL() {
    const all = await loadFilms();
    const list = hlMode === 'mine' ? all.filter((f) => f.rating) : all;
    if (list.length < 2) return stage.replaceChildren(h('p', 'w-note', 'Nog te weinig films met een cijfer.'));
    stage.replaceChildren(h('p', 'w-note', 'Films zoeken…'));
    const a = await prepared(list, null);
    const b = a && await prepared(list, a);
    if (!a || !b) return stage.replaceChildren(h('p', 'w-note', 'Kon geen films met een gemiddelde vinden (TMDB niet bereikbaar?).'));
    hl = { list, a, b, streak: 0, busy: false, mode: hlMode };
    renderHL();
  }
  const fmtScore = (f) => (hlMode === 'mine' ? stars(f.rating) : `★ ${f.crowd.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} gemiddeld`);
  function renderHL(chosen) {
    const { a, b } = hl;
    const modes = h('div', 'fd-tabs gm-modes');
    for (const [m, label] of [['mine', 'Mijn cijfer'], ['crowd', 'Gemiddelde (TMDB)']]) {
      const x = h('button', null, label);
      x.type = 'button';
      x.setAttribute('aria-pressed', hlMode === m);
      x.onclick = () => { if (hlMode === m) return; hlMode = m; store.set('games.hl.mode', m); hl = null; startHL(); };
      modes.append(x);
    }
    const top = h('div', 'gm-row');
    top.append(h('p', 'gm-q', hlMode === 'mine' ? 'Welke film gaf jij een hoger cijfer?' : 'Welke film heeft een hoger gemiddelde?'), modes,
      h('p', 'gm-score', `reeks ${hl.streak} · record ${best(bestKey())}`));
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
      const extra = hlMode === 'crowd' && show && f.rating ? ` · jij ${stars(f.rating)}` : '';
      c.append(posterBox(f), h('b', 'gm-title', `${f.title}${f.year ? ` (${f.year})` : ''}`), h('span', show ? 'gm-stars' : 'gm-hidden', show ? `${fmtScore(f)}${extra}` : '? klik de hoogste'));
      c.onclick = () => choose(side);
      return c;
    };
    duel.append(card(a, 'a'), h('span', 'gm-vs', 'vs'), card(b, 'b'));
    const note = hlMode === 'mine' ? `Gelijk cijfer telt allebei goed. ${filmsSource}.` : `Gemiddelde van TMDB-gebruikers (op 5 omgerekend), alleen films met minstens 50 stemmen. ${filmsSource}.`;
    stage.replaceChildren(top, duel, h('p', 'w-sub gm-foot', `${note} Records alleen in deze browser.`));
  }
  async function choose(side) {
    if (hl.busy) return;
    hl.busy = true;
    const mine = side === 'a' ? hl.a : hl.b, other = side === 'a' ? hl.b : hl.a;
    const ok = score(mine) >= score(other) - 0.04;
    if (ok) { hl.streak++; setBest(bestKey(), hl.streak); } else hl.streak = 0;
    renderHL(side);
    // Groene of rode gloed om het hele vak
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
  // Tegels zijn losse blokjes met een vaste plek (rij, kolom); bij een zet schuiven ze met een CSS-overgang naar hun
  // nieuwe plek, samengevoegde tegels "ploppen". Stand in games.2048.state (oude stand zonder tegels: nieuw spel).
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
          // Samenvoegen: deze tegel schuift naar de plek van de vorige en verdwijnt daarna
          t.r = last.r; t.c = last.c; gone.push(t);
          last.merged = true; last.next = last.v * 2;   // de waarde verandert pas na het schuiven
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
    paint2048();                                    // eerst schuiven (ook de tegels die opgaan in een andere)
    g2.tiles = g2.tiles.filter((t) => !gone.includes(t));
    for (const t of g2.tiles) if (t.next) { t.v = t.next; delete t.next; }
    add2048();
    const at = new Map(g2.tiles.map((t) => [t.r * 4 + t.c, t.v]));
    const canMove = at.size < 16 || [...at].some(([i, v]) => (i % 4 < 3 && at.get(i + 1) === v) || (i < 12 && at.get(i + 4) === v));
    g2.over = !canMove;
    setBest('2048', g2.score);
    save2048();
    setTimeout(paint2048, calm() ? 0 : 130);      // daarna samengevoegde weg, nieuwe tegel erbij
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
    if (msgEl) msgEl.textContent = g2.over ? 'Geen zetten meer!' : 'Schuif met de pijltjes (of WASD), of veeg.';
  }
  function render2048() {
    if (!g2) return new2048();
    const top = h('div', 'gm-row');
    const again = h('button', 'w-btn ghost', 'Nieuw spel');
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
