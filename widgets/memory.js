'use strict';

// Memory Lane: "Vandaag in het verleden" (sinds 0.60.0, groot idee uit WENSEN.md, alleen op tall in het roterende vak).
// Leest data/aggregates/memory/<MM>.json uit het privé archief (scripts/aggregate.py → build_memory), met het archief-token:
// {days: {"MM-DD": {"JJJJ": {w, yt, out, st, ph, pc, f, ag}}}}. Niets uit het archief komt in deze publieke repo.
// Zonder klikken (1.0-plan): elke keer dat het vak in de rotatie voorbijkomt, staat er een ander jaar groot; de andere jaren
// staan als regel ernaast (klik op een regel mag, hoeft niet). 29 februari: jaren zonder 29 februari nemen 28 februari.
DASH.widget('w-memory', (card, body, guard) => {
  const { h, store, DEMO } = DASH;
  const TMDB_KEY = (window.DASHBOARD_CONFIG || {}).tmdbApiKey || '';
  const pad = (n) => String(n).padStart(2, '0');
  const stars = (r) => (r == null ? '' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : ''));
  const nl = (n, d = 0) => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: d });

  let data = null;        // {"MM-DD": {"JJJJ": dag}} van deze maand
  let monthLoaded = null; // "MM"
  let pick = null;        // jaar dat groot staat
  let dayKey = null;      // "JJJJ-MM-DD" van vandaag, om om middernacht te wisselen

  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  // Per jaar de dag van vandaag (29 feb → 28 feb in jaren zonder 29 feb); alleen jaren vóór dit jaar
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
  // Meer dan alleen het weer = een "rijke" dag; die komen groot in beeld
  const rich = (d) => Object.keys(d).some((k) => k !== 'w');

  // ---------- Posters (TMDB, cache in deze browser) ----------
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

  // ---------- Tonen ----------
  function stat(label, big, sub) {
    const c = h('div', 'mm-stat');
    c.append(h('span', 'mm-label', label), h('b', null, big));
    if (sub) c.append(h('span', 'w-sub', sub));
    return c;
  }
  function weatherText(w) {
    if (!w) return null;
    const [t, r] = w;
    return `${t != null ? `${nl(t)}°` : '–'} · ${r ? `${nl(r, 1)} mm` : 'droog'}`;
  }
  // Korte regel voor een ander jaar
  function line(x) {
    const d = x.day, bits = [];
    if (d.w) bits.push(`${d.w[0] != null ? `${nl(d.w[0])}°` : '–'}${d.w[1] >= 1 ? ', regen' : ''}`);
    if (d.f && d.f.length) bits.push(d.f.length === 1 ? `🎬 ${d.f[0][0]}${d.f[0][2] != null ? ` ${stars(d.f[0][2])}` : ''}` : `🎬 ${d.f.length} films`);
    if (d.ag && d.ag.some((a) => a[0] === 'ah')) bits.push('AH');
    if (d.ag && d.ag.some((a) => a[0] === 'tentamen')) bits.push('toets');
    if (d.yt) bits.push(`${nl(d.yt[0])} video's`);
    if (d.out && d.out[0] != null) bits.push(`${nl(d.out[0], 1)} u buiten`);
    if (d.ph) bits.push(`${d.ph} foto${d.ph === 1 ? '' : "'s"}`);
    return bits.join(' · ');
  }

  function render() {
    const now = new Date();
    const list = years(now);
    if (!list.length) {
      body.replaceChildren(h('p', 'w-note', 'Nog niks uit eerdere jaren op deze dag.'));
      return;
    }
    const cycle = list.some((x) => rich(x.day)) ? list.filter((x) => rich(x.day)) : list;
    if (!list.some((x) => x.y === pick)) pick = cycle[0].y;
    const main = list.find((x) => x.y === pick);
    const d = main.day;
    const ago = now.getFullYear() - main.y;

    const left = h('div', 'mm-main');
    const head = h('div', 'mm-head');
    const dateText = main.date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    head.append(h('b', 'mm-date', dateText[0].toUpperCase() + dateText.slice(1)),
      h('span', 'w-sub', ago === 1 ? '1 jaar geleden' : `${ago} jaar geleden`));
    left.append(head);

    const stats = h('div', 'mm-stats');
    if (d.w) stats.append(stat('weer', weatherText(d.w)));
    if (d.yt) stats.append(stat('YouTube', `${nl(d.yt[0])} video's`, d.yt[1] ? `meest: ${d.yt[1]}` : null));
    if (d.out || d.st) {
      const plek = (n) => `${n} ${n === 1 ? 'plek' : 'plekken'}`;
      const big = d.out && d.out[0] != null ? `${nl(d.out[0], 1)} u buiten` : d.st ? `${nl(d.st)} stappen` : plek(d.out[1]);
      const sub = [d.out && d.out[0] != null && d.out[1] ? plek(d.out[1]) : null, d.st && d.out && d.out[0] != null ? `${nl(d.st)} stappen` : null].filter(Boolean).join(' · ');
      stats.append(stat('waar', big, sub || null));
    }
    if (d.ph) stats.append(stat("foto's", nl(d.ph)));
    if (d.pc) stats.append(stat('pc', `${nl(d.pc, 1)} u`));
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
        txt.append(h('b', null, `${f[0]}${f[1] ? ` (${f[1]})` : ''}`), h('span', 'mm-stars', stars(f[2]) || 'geen cijfer'));
        if (f[3]) txt.append(h('span', 'w-sub', '↻ opnieuw gekeken'));
        item.append(box, txt);
        films.append(item);
      }
      left.append(films);
    }
    if (d.ag && d.ag.length) {
      const ag = h('div', 'mm-agenda');
      ag.append(h('span', 'mm-label', 'agenda'), h('span', null, d.ag.map((a) => (a[0] === 'ah' ? a[1] : `${a[0] === 'tentamen' ? '📝' : '🎓'} ${a[1]}${a[2] ? ` ${a[2]}` : ''}`)).join(' · ')));
      left.append(ag);
    }

    const right = h('div', 'mm-others');
    right.append(h('span', 'mm-label', 'andere jaren op deze dag'));
    for (const x of list) {
      if (x.y === main.y) continue;
      const b = h('button', 'mm-year');
      b.type = 'button';
      b.append(h('b', null, String(x.y)), h('span', null, line(x)));
      b.onclick = () => { pick = x.y; render(); };
      right.append(b);
    }
    if (right.children.length === 1) right.append(h('p', 'w-sub', 'Geen andere jaren met data.'));

    const wrap = h('div', 'mm-wrap');
    wrap.append(left, right);
    body.replaceChildren(wrap);
  }

  // Volgende keer dat het vak in beeld komt: het volgende jaar groot (zonder klikken)
  function advance() {
    const list = years(new Date());
    const cycle = list.some((x) => rich(x.day)) ? list.filter((x) => rich(x.day)) : list;
    if (cycle.length < 2) return;
    const i = cycle.findIndex((x) => x.y === pick);
    pick = cycle[(i + 1) % cycle.length].y;
    render();
  }
  let wasOn = false, shown = false;
  new MutationObserver(() => {
    const on = card.classList.contains('on');
    if (on && !wasOn) { if (shown) advance(); shown = true; }   // de eerste keer het nieuwste jaar
    wasOn = on;
  }).observe(card, { attributes: true, attributeFilter: ['class'] });

  // ---------- Laden ----------
  function demo(now) {
    const md = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    let seed = now.getDate() * 31 + now.getMonth();
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const out = {};
    for (let y = now.getFullYear() - 1; y >= 2017; y--) {
      const day = { w: [Math.round(5 + rnd() * 12), Math.round(rnd() * 60) / 10] };
      if (y >= 2022) day.yt = [Math.round(rnd() * 30), 'Voorbeeldkanaal'];
      if (y >= 2024) { day.out = [Math.round(rnd() * 80) / 10, 1 + Math.round(rnd() * 4)]; day.st = Math.round(3000 + rnd() * 9000); }
      if (rnd() > .5) day.f = [['Voorbeeldfilm', 1999, 3.5, rnd() > .7 ? 1 : 0, '']];
      if (rnd() > .6) day.ag = [['ah', 'AH-dienst 17:00–22:00', '17:00']];
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
      body.replaceChildren(h('div', 'w-empty', 'Koppel het data-archief (Instellingen › Data) voor Memory Lane.'));
      return;
    }
    try {
      const f = await D.read(`data/aggregates/memory/${mm}.json`);
      data = f ? JSON.parse(f.text).days || {} : {};
      monthLoaded = mm;
      render();
    } catch (e) {
      console.warn('[memory]', e);
      if (!data) body.replaceChildren(h('div', 'w-empty', 'Memory Lane kon het archief niet lezen. Het probeert het later opnieuw.'));
    }
  });

  window.addEventListener('dash:data-token', load);
  // Elke minuut: om middernacht een nieuwe dag; elk uur opnieuw lezen (het archief werkt het bij)
  let lastRead = Date.now();
  DASH.every(60 * 1000, () => {
    const now = new Date();
    if (now.toDateString() !== dayKey || Date.now() - lastRead > 3600000) { lastRead = Date.now(); load(); }
  });
  load();
});
