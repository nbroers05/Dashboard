'use strict';

// Daily puzzles (big idea "Daily puzzles", 1.15.0): the first tab ("Daily") on the Games page, from my "Luie genie" list minus the four
// made-up ones, so 22 puzzles. Window daily.exe: "7 / 22 today" with a segmented bar, category chips, one row per puzzle (tick box,
// name, category + today's score, streak, 7-day dots, Play which opens the puzzle in a new tab). Ticking (or coming back from Play)
// asks for an optional score in a small popover (Enter = done, empty = "played"). Done rows turn green and sink. Puzzles whose link isn't
// sure sit folded under "+ N more". Window discover.exe: a short fixed list of puzzles from Listdle (no scraping) with "+ Add"
// (moves it to Daily) and "Try", plus a "Surprise me" link. Played state is shared between devices (sync.js: daily.log, daily.extra).
// The top-bar day line and the Games item in the dock/rail show how many are left; gone at 0 and after 23:00.
// Exposes DASH_DAILY = { render(stage), left() }. Event dash:daily when something changes. Nothing personal in here.
window.DASH_DAILY = (() => {
  const { h, store, startOfDay, addDays } = DASH;
  const LOG = 'daily.log', EXTRA = 'daily.extra';
  const g = (id, n, c, hint, u) => ({ id, n, c, h: hint, u });   // a puzzle with a sure link
  const s = (id, n, c, hint, q) => ({ id, n, c, h: hint, u: `https://www.google.com/search?q=${encodeURIComponent(q)}`, search: true });   // link not sure: Google
  const BASE = [
    g('wordle', 'Wordle', 'Word', 'e.g. 3/6', 'https://www.nytimes.com/games/wordle/index.html'),
    g('poople', 'Poople', 'Word', 'steps', 'https://poople.io'),
    g('connections', 'Connections', 'Word', 'e.g. 1 mistake', 'https://www.nytimes.com/games/connections'),
    g('krillion', 'Krillion', 'Trivia', 'points / meters', 'https://krillion.io'),
    g('globle', 'Globle', 'Geography', 'guesses', 'https://globle-game.com'),
    g('flagle', 'Flagle', 'Geography', 'e.g. 2/6', 'https://www.flagle.io'),
    g('strands', 'Strands', 'Word', 'hints used', 'https://www.nytimes.com/games/strands'),
    g('spotle', 'Spotle', 'Other', 'e.g. 4/10', 'https://spotle.io'),
    g('crossword', 'Crossword', 'Word', 'time', 'https://www.nytimes.com/crosswords'),
    g('minutecryptic', 'Minute Cryptic', 'Word', 'hints / time', 'https://www.minutecryptic.com'),
    g('metazooa', 'Metazooa', 'Other', 'e.g. 5/20', 'https://metazooa.com'),
    g('travle', 'Travle', 'Geography', 'score (e.g. +2)', 'https://travle.earth'),
    g('mini', 'Mini Crossword', 'Word', 'time', 'https://www.nytimes.com/crosswords/game/mini'),
    g('loldle', 'LoLdle', 'Video games', 'guesses', 'https://loldle.net'),
    g('squirdle', 'Squirdle', 'Video games', 'e.g. 4/8', 'https://squirdle.fireblend.com'),
    s('terradle', 'Terradle', 'Video games', 'score', 'terradle terraria'),
    s('brandle', 'Brandle', 'Other', 'e.g. 3/8', 'brandle daily logo'),
    s('magnitudle', 'Magnitudle', 'Other', 'points /500', 'magnitudle'),
    s('pricepoint', 'Pricepoint', 'Other', 'score', 'pricepoint daily game'),
    s('contextle', 'Contextle', 'Word', 'guesses', 'contextle'),
    s('unwordle', 'Unwordle', 'Word', 'solved?', 'unwordle'),
    s('categories', 'Categories', 'Word', 'score', 'categories daily game'),
  ];
  const DISCOVER = [
    g('nerdle', 'Nerdle', 'Math', 'e.g. 4/6', 'https://www.nerdlegame.com'),
    g('murdle', 'Murdle', 'Mystery', 'solved?', 'https://murdle.com'),
    g('quordle', 'Quordle', 'Word', 'e.g. 7/9', 'https://www.merriam-webster.com/games/quordle'),
    g('worldle', 'Worldle', 'Geography', 'e.g. 2/6', 'https://worldle.teuteuf.fr'),
    s('redactle', 'Redactle', 'Word', 'guesses', 'redactle'),
    s('heardle', 'Heardle', 'Music', 'tries', 'heardle daily'),
  ];
  const BLURB = { nerdle: 'Wordle with a sum', murdle: 'A small murder case', quordle: 'Four Wordles at once', worldle: 'Guess the country by its shape', redactle: 'Guess the Wiki page', heardle: 'Song from the intro' };
  const SURPRISE = 'https://listdle.com';

  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const log = () => store.get(LOG) || {};
  const extra = () => store.get(EXTRA) || [];
  const list = () => BASE.concat(DISCOVER.filter((d) => extra().includes(d.id)));
  const todayKey = () => iso(Date.now());
  const has = (id, key) => { const d = log()[key]; return !!(d && d[id] !== undefined); };
  const dayAgo = (n) => iso(addDays(startOfDay(Date.now()), -n));
  function streak(id) {
    let n = 0, i = has(id, todayKey()) ? 0 : 1;
    while (has(id, dayAgo(i))) { n++; i++; }
    return n;
  }
  function setScore(id, val) {
    const all = { ...log() }, k = todayKey();
    const day = { ...(all[k] || {}) };
    if (val === null) delete day[id]; else day[id] = val;
    if (Object.keys(day).length) all[k] = day; else delete all[k];
    const cut = dayAgo(60);
    for (const d of Object.keys(all)) if (d < cut) delete all[d];   // keep two months
    store.set(LOG, all);
    changed();
  }
  const changed = () => { window.dispatchEvent(new CustomEvent('dash:daily')); if (stageEl) paint(); };
  // How many are left today (0 after 23:00, so the badge and the day line go away for the night)
  const left = () => (new Date().getHours() >= 23 ? 0 : list().filter((p) => !has(p.id, todayKey())).length);

  // ---------- Window titles in the house style (the tiles are made here, housestyle.js doesn't know them) ----------
  function win(el, exe, kanji) {
    el.dataset.nhExe = exe; el.dataset.nhName = exe.replace(/\.exe$/, ''); el.dataset.nhKanji = kanji;
    const eb = el.querySelector(':scope > .eyebrow');
    if (eb) Object.assign(eb.dataset, { nhExe: exe, nhName: exe.replace(/\.exe$/, ''), nhKanji: kanji });
  }

  let stageEl = null, filter = 'all', showMore = false, pending = null, pop = null;
  const daily = h('section', 'card tile dl-daily');
  const disc = h('section', 'card tile dl-discover');
  daily.id = 'w-daily'; disc.id = 'w-discover';
  daily.append(h('p', 'eyebrow', 'Daily'), h('div', 'w-body'));
  disc.append(h('p', 'eyebrow', 'Discover'), h('div', 'w-body'));
  win(daily, 'daily.exe', '日課'); win(disc, 'discover.exe', '発見');

  // ---------- Score popover ----------
  function closePop() { if (pop) { pop.remove(); pop = null; } document.removeEventListener('pointerdown', outside, true); }
  function outside(e) { if (pop && !pop.contains(e.target)) closePop(); }
  function askScore(p, anchor) {
    closePop();
    pop = h('form', 'dl-pop');
    const inp = h('input');
    inp.placeholder = `${p.n}: score (${p.h}) or empty`;
    inp.maxLength = 30;
    const ok = h('button', 'dx-btn dx-primary', 'Done');
    pop.append(inp, ok);
    pop.onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim() || 'played'; closePop(); setScore(p.id, v); };
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(innerWidth - 330, r.left))}px`;
    pop.style.top = `${r.bottom + 8 + 60 > innerHeight ? Math.max(8, r.top - 56) : r.bottom + 6}px`;
    inp.focus();
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  // Back from a puzzle you opened with Play: ask for the score (once)
  function comeBack() {
    if (!pending || !stageEl || document.hidden) return;
    const p = list().find((x) => x.id === pending);
    pending = null;
    if (!p || has(p.id, todayKey())) return;
    const row = daily.querySelector(`[data-id="${p.id}"]`);
    if (row) askScore(p, row);
  }
  window.addEventListener('focus', () => setTimeout(comeBack, 150));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(comeBack, 150); });

  // ---------- Drawing ----------
  function row(p, doneToday) {
    const day = log()[todayKey()] || {};
    const el = h('div', `dl-row${doneToday ? ' done' : ''}`);
    el.dataset.id = p.id;
    const tick = h('button', 'dl-tick', doneToday ? '✓' : '');
    tick.type = 'button';
    tick.setAttribute('aria-label', doneToday ? `${p.n}: done, click to undo` : `Tick off ${p.n}`);
    tick.onclick = () => (doneToday ? setScore(p.id, null) : askScore(p, tick));
    const txt = h('div', 'dl-txt');
    const score = doneToday ? (day[p.id] === 'played' ? 'played' : String(day[p.id])) : '';
    txt.append(h('b', null, p.n), h('span', null, `${p.c}${doneToday ? ` · ${score}` : ''}`));
    const st = streak(p.id), side = h('div', 'dl-side');
    const dots = h('span', 'dl-dots');
    for (let i = 6; i >= 0; i--) dots.append(h('i', has(p.id, dayAgo(i)) ? 'y' : ''));
    side.append(h('span', 'dl-streak', `${st}d streak`), dots);
    el.append(tick, txt, side);
    if (!doneToday) {
      const play = h('a', 'dl-play', 'Play');
      play.href = p.u; play.target = '_blank'; play.rel = 'noopener';
      play.onclick = () => { pending = p.id; };
      el.append(play);
    } else el.append(h('span', 'dl-playpad'));
    return el;
  }

  function paint() {
    const body = daily.querySelector('.w-body'), all = list(), k = todayKey(), day = log()[k] || {};
    const doneN = all.filter((p) => day[p.id] !== undefined).length;
    const head = h('div', 'dl-head');
    head.append(h('div', 'dl-big', `${doneN}`), h('span', 'dl-of', ` / ${all.length} today`));
    const seg = h('div', 'dl-seg');
    all.forEach((p, i) => seg.append(h('i', i < doneN ? 'on' : '')));
    head.append(seg);
    // Best current streak and how many days this month everything was done
    let bestN = 0, bestName = '';
    for (const p of all) { const n = streak(p.id); if (n > bestN) { bestN = n; bestName = p.n; } }
    const mk = k.slice(0, 7);
    const perfect = Object.entries(log()).filter(([d, v]) => d.startsWith(mk) && all.every((p) => v[p.id] !== undefined)).length;
    const sub = h('p', 'dl-sub', [bestN ? `best streak: ${bestName} ${bestN} day${bestN === 1 ? '' : 's'}` : '', perfect ? `all done ${perfect}x this month` : ''].filter(Boolean).join(' · ') || 'Tick off what you played; scores are optional.');
    // Category chips
    const cats = [...new Set(all.map((p) => p.c))];
    const chips = h('div', 'tk-chips dl-chips');
    const chip = (id, label) => { const b = h('button', 'tk-chip', label); b.type = 'button'; b.setAttribute('aria-pressed', String(filter === id)); b.onclick = () => { filter = id; paint(); }; chips.append(b); };
    chip('all', `All ${all.length}`);
    chip('open', `Open ${all.length - doneN}`);
    for (const c of cats) chip(c, `${c} ${all.filter((p) => p.c === c).length}`);
    // Rows: open first, done sink; puzzles without a sure link folded under "+ N more"
    const inFilter = (p) => (filter === 'all' ? true : filter === 'open' ? day[p.id] === undefined : p.c === filter);
    const shown = all.filter(inFilter);
    const sure = shown.filter((p) => !p.search), unsure = shown.filter((p) => p.search);
    const order = (a, b) => (day[a.id] !== undefined) - (day[b.id] !== undefined);
    const rows = h('div', 'dl-rows');
    for (const p of [...sure].sort(order)) rows.append(row(p, day[p.id] !== undefined));
    if (unsure.length) {
      const more = h('button', 'dl-more', `${showMore ? '▴' : '▾'} ${showMore ? 'Hide' : `+ ${unsure.length} more`} (${unsure.slice(0, 3).map((p) => p.n).join(', ')}${unsure.length > 3 ? ', ...' : ''})`);
      more.type = 'button';
      more.onclick = () => { showMore = !showMore; paint(); };
      rows.append(more);
      if (showMore) for (const p of [...unsure].sort(order)) rows.append(row(p, day[p.id] !== undefined));
    }
    if (!shown.length) rows.append(h('p', 'w-note', 'Nothing here.'));
    body.replaceChildren(head, sub, chips, rows);

    // discover.exe
    const open = DISCOVER.filter((d) => !extra().includes(d.id));
    const dbody = disc.querySelector('.w-body');
    const top = h('div', 'dl-dhead');
    const sur = h('a', 'dl-surprise', 'Surprise me · listdle.com ↗');
    sur.href = SURPRISE; sur.target = '_blank'; sur.rel = 'noopener';
    top.append(h('span', 'w-sub', 'Picked from Listdle · not on your list yet'), sur);
    const grid = h('div', 'dl-dgrid');
    for (const d of open) {
      const c = h('div', 'dl-dcard');
      c.append(h('b', null, d.n), h('span', null, `${d.c} · ${BLURB[d.id] || ''}`));
      const act = h('div', 'dl-dact');
      const add = h('button', 'dx-btn', '+ Add');
      add.type = 'button';
      add.onclick = () => { store.set(EXTRA, [...extra(), d.id]); changed(); };
      const tryA = h('a', 'dx-btn', 'Try ↗');
      tryA.href = d.u; tryA.target = '_blank'; tryA.rel = 'noopener';
      act.append(add, tryA);
      c.append(act);
      grid.append(c);
    }
    dbody.replaceChildren(top, open.length ? grid : h('p', 'w-note', 'Everything from the list is on your Daily tab.'));
  }

  function render(stage) {
    stageEl = stage;
    stage.replaceChildren(daily, disc);
    paint();
  }
  window.addEventListener('dash:synced', (e) => { if (e.detail && [LOG, EXTRA].includes(e.detail.key)) changed(); });
  window.addEventListener('storage', (e) => { if (e.key === LOG || e.key === EXTRA) changed(); });
  DASH.every(60 * 1000, () => { window.dispatchEvent(new CustomEvent('dash:daily')); if (stageEl && daily.isConnected) paint(); });   // new day / 23:00
  setTimeout(() => window.dispatchEvent(new CustomEvent('dash:daily')), 0);
  return { render, left };
})();
