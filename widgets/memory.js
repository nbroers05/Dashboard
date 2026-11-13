'use strict';

// Memory Lane: "Today in the past" (since 0.60.0, a big idea from the wish list, only on tall in the rotating tile).
// Reads data/aggregates/memory/<MM>.json from the private archive (scripts/aggregate.py → build_memory), with the archive token:
// {days: {"MM-DD": {"YYYY": {w, yt, out, st, ph, pc, f, ag}}}}. Nothing from the archive goes into this public repo.
// Without clicking (1.0 plan): every time the tile comes by in the rotation, another year is shown big; the other years
// are next to it as a line (clicking a line is allowed, not needed). 29 February: years without 29 February take 28 February.
DASH.widget('w-memory', (card, body, guard) => {
  const { h, store, DEMO } = DASH;
  const TMDB_KEY = (window.DASHBOARD_CONFIG || {}).tmdbApiKey || '';
  const pad = (n) => String(n).padStart(2, '0');
  const stars = (r) => (r == null ? '' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : ''));
  const dec = (n, d = 0) => Number(n).toLocaleString('en-GB', { maximumFractionDigits: d });

  let data = null;        // {"MM-DD": {"YYYY": day}} of this month
  let monthLoaded = null; // "MM"
  let pick = null;        // year that's shown big
  let dayKey = null;      // "YYYY-MM-DD" of today, to switch at midnight

  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  // Per year the day of today (29 Feb → 28 Feb in years without 29 Feb); only years before this year
  function years(now) {
    const md = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const out = [];
    const by = (data && data[md]) || {};
    const feb28 = (data && data['02-28']) || {};
    const all = new Set([...Object.keys(by), ...(md === '02-29' ? Object.keys(feb28) : [])]);
    for (const y of [...all].map(Number).sort((a, b) => b - a)) {
      if (y >= now.getFullYear()) continue;
      const day = md === '02-29' && !isLeap(y) ? feb28[y] : by[y];
      if (day && Object.keys(day).length) out.push({ y, day, date: new Date(y, md === '02-29' && !isLeap(y) ? 1 : now.getMonth(), md === '02-29' && !isLeap(y) ? 28 : now.getDate()) });
    }
    return out;
  }
  // More than just the weather = a "rich" day; those are shown big
  const rich = (d) => Object.keys(d).some((k) => k !== 'w');
  // How much there is to see (0.60.1): films and agenda count more; the richest year comes first big
  const score = (d) => Object.keys(d).filter((k) => k !== 'w').length + (d.f ? 2 : 0) + (d.ag ? 1 : 0);
  const order = (list) => {
    const r = list.filter((x) => rich(x.day));
    return (r.length ? r : list).slice().sort((a, b) => score(b.day) - score(a.day) || b.y - a.y);
  };

  // ---------- Posters (TMDB, cache in this browser) ----------
  const posters = store.get('memory.posters') || {};
  async function poster(f) {
    const key = f[4] || `${f[0]}|${f[1]}`;
    if (key in posters) return posters[key];
    if (!TMDB_KEY) return null;
    try {
      const r = f[4]
        ? await DASH.getJSON(`https://api.themoviedb.org/3/movie/${f[4]}?api_key=${TMDB_KEY}`)
        : ((await DASH.getJSON(`https://api.themoviedb.org/3/search/movie?${new URLSearchParams({ api_key: TMDB_KEY, query: f[0], ...(f[1] ? { year: f[1] } : {}) })}`)).results || [])[0] || {};
      posters[key] = r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : '';
      store.set('memory.posters', posters);
      return posters[key];
    } catch { return null; }
  }

  // ---------- Showing ----------
  function stat(label, big, sub, href) {
    const c = h(href ? 'a' : 'div', 'mm-stat');
    if (href) { c.href = href; c.target = '_blank'; c.rel = 'noopener'; c.title = 'Open Google Photos on this day'; }
    c.append(h('span', 'mm-label', label), h('b', null, big));
    if (sub) c.append(h('span', 'w-sub', sub));
    return c;
  }
  function weatherText(w) {
    if (!w) return null;
    const [t, r] = w;
    return `${t != null ? `${dec(t)}°` : '–'} · ${r ? `${dec(r, 1)} mm` : 'dry'}`;
  }
  // A short line for another year
  function line(x) {
    const d = x.day, bits = [];
    if (d.w) bits.push(`${d.w[0] != null ? `${dec(d.w[0])}°` : '–'}${d.w[1] >= 1 ? ', rain' : ''}`);
    if (d.f && d.f.length) bits.push(d.f.length === 1 ? `🎬 ${d.f[0][0]}${d.f[0][2] != null ? ` ${stars(d.f[0][2])}` : ''}` : `🎬 ${d.f.length} films`);
    if (d.ag && d.ag.some((a) => a[0] === 'ah')) bits.push('AH');
    if (d.ag && d.ag.some((a) => a[0] === 'tentamen' || a[0] === 'exam')) bits.push('exam');
    if (d.yt) bits.push(`${dec(d.yt[0])} videos`);
    if (d.out && d.out[0] != null) bits.push(`${dec(d.out[0], 1)} h outside`);
    if (d.ph) bits.push(`${d.ph} photo${d.ph === 1 ? '' : 's'}`);
    return bits.join(' · ');
  }

  function render() {
    const now = new Date();
    const list = years(now);
    if (!list.length) {
      body.replaceChildren(h('p', 'w-note', 'Nothing from earlier years on this day yet.'));
      return;
    }
    const cycle = order(list);
    if (!list.some((x) => x.y === pick)) pick = cycle[0].y;
    const main = list.find((x) => x.y === pick);
    const d = main.day;
    const ago = now.getFullYear() - main.y;

    const left = h('div', 'mm-main');
    const head = h('div', 'mm-head');
    const dateText = main.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    head.append(h('b', 'mm-date', dateText[0].toUpperCase() + dateText.slice(1)),
      h('span', 'w-sub', ago === 1 ? '1 year ago' : `${ago} years ago`));
    left.append(head);

    const stats = h('div', 'mm-stats');
    if (d.w) stats.append(stat('weather', weatherText(d.w)));
    if (d.yt) stats.append(stat('YouTube', `${dec(d.yt[0])} videos`, d.yt[1] ? `most: ${d.yt[1]}` : null));
    if (d.out || d.st) {
      const place = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;
      const big = d.out && d.out[0] != null ? `${dec(d.out[0], 1)} h outside` : d.st ? `${dec(d.st)} steps` : place(d.out[1]);
      const sub = [d.out && d.out[0] != null && d.out[1] ? place(d.out[1]) : null, d.st && d.out && d.out[0] != null ? `${dec(d.st)} steps` : null].filter(Boolean).join(' · ');
      stats.append(stat('where', big, sub || null));
    }
    // Only the number is in the archive (Google doesn't let websites read your photo library): click = search Google Photos
    // on that date (works if you're logged in there)
    if (d.ph) {
      const q = main.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      stats.append(stat('photos', `${dec(d.ph)} ${d.ph === 1 ? 'photo' : 'photos'}`, 'view in Google Photos ↗', `https://photos.google.com/search/${encodeURIComponent(q)}`));
    }
    if (d.pc) stats.append(stat('pc', `${dec(d.pc, 1)} h`));
    left.append(stats);

    if (d.f && d.f.length) {
      const films = h('div', 'mm-films');
      for (const f of d.f.slice(0, 3)) {
        const item = h('div', 'mm-film');
        const box = DASH.img(null, 'mm-poster', f[0]);
        poster(f).then((src) => {
          if (!src) return;
          const i = new Image();
          i.alt = '';
          i.onload = () => i.classList.add('loaded');
          i.src = src;
          box.append(i);
        });
        const txt = h('div', 'mm-film-txt');
        txt.append(h('b', null, `${f[0]}${f[1] ? ` (${f[1]})` : ''}`), h('span', 'mm-stars', stars(f[2]) || 'no rating'));
        if (f[3]) txt.append(h('span', 'w-sub', '↻ rewatched'));
        item.append(box, txt);
        films.append(item);
      }
      left.append(films);
    }
    if (d.ag && d.ag.length) {
      const ag = h('div', 'mm-agenda');
      ag.append(h('span', 'mm-label', 'agenda'), h('span', null, d.ag.map((a) => (a[0] === 'ah' ? a[1] : `${a[0] === 'tentamen' || a[0] === 'exam' ? '📝' : '🎓'} ${a[1]}${a[2] ? ` ${a[2]}` : ''}`)).join(' · ')));
      left.append(ag);
    }

    const right = h('div', 'mm-others');
    right.append(h('span', 'mm-label', 'other years on this day'));
    for (const x of list) {
      if (x.y === main.y) continue;
      const b = h('button', 'mm-year');
      b.type = 'button';
      b.append(h('b', null, String(x.y)), h('span', null, line(x)));
      b.onclick = () => { pick = x.y; render(); };
      right.append(b);
    }
    if (right.children.length === 1) right.append(h('p', 'w-sub', 'No other years with data.'));

    const wrap = h('div', 'mm-wrap');
    wrap.append(left, right);
    body.replaceChildren(wrap);
  }

  // The next time the tile comes into view: the next year big (without clicking)
  function advance() {
    const list = years(new Date());
    const cycle = order(list);
    if (cycle.length < 2) return;
    const i = cycle.findIndex((x) => x.y === pick);
    pick = cycle[(i + 1) % cycle.length].y;
    render();
  }
  let wasOn = false, shown = false;
  new MutationObserver(() => {
    const on = card.classList.contains('on');
    if (on && !wasOn) { if (shown) advance(); shown = true; }   // the first time the newest year
    wasOn = on;
  }).observe(card, { attributes: true, attributeFilter: ['class'] });

  // ---------- Loading ----------
  function demo(now) {
    const md = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    let seed = now.getDate() * 31 + now.getMonth();
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const out = {};
    for (let y = now.getFullYear() - 1; y >= 2017; y--) {
      const day = { w: [Math.round(5 + rnd() * 12), Math.round(rnd() * 60) / 10] };
      if (y >= 2022) day.yt = [Math.round(rnd() * 30), 'Example channel'];
      if (y >= 2024) { day.out = [Math.round(rnd() * 80) / 10, 1 + Math.round(rnd() * 4)]; day.st = Math.round(3000 + rnd() * 9000); }
      if (rnd() > .5) day.f = [['Example film', 1999, 3.5, rnd() > .7 ? 1 : 0, '']];
      if (rnd() > .6) day.ag = [['ah', 'AH shift 17:00–22:00', '17:00']];
      if (rnd() > .7) day.ph = Math.round(1 + rnd() * 12);
      out[y] = day;
    }
    return { [md]: out };
  }

  const load = guard(async () => {
    const now = new Date();
    const mm = pad(now.getMonth() + 1);
    dayKey = now.toDateString();
    if (DEMO) { data = demo(now); monthLoaded = mm; return render(); }
    const D = window.DASH_DATA;
    if (!D || !D.token()) {
      body.replaceChildren(h('div', 'w-empty', 'Link the data archive (Settings › Data) for Memory Lane.'));
      return;
    }
    try {
      const f = await D.read(`data/aggregates/memory/${mm}.json`);
      data = f ? JSON.parse(f.text).days || {} : {};
      monthLoaded = mm;
      render();
    } catch (e) {
      console.warn('[memory]', e);
      if (!data) body.replaceChildren(h('div', 'w-empty', 'Memory Lane couldn\'t read the archive. It will try again later.'));
    }
  });

  window.addEventListener('dash:data-token', load);
  // Every minute: a new day at midnight; read again every hour (the archive updates it)
  let lastRead = Date.now();
  DASH.every(60 * 1000, () => {
    const now = new Date();
    if (now.toDateString() !== dayKey || Date.now() - lastRead > 3600000) { lastRead = Date.now(); load(); }
  });
  load();
});
