'use strict';

// Mijn data: een eigen pagina (zelfde stijl als Feeds) met grafieken van alles in het PRIVÉ archief.
// Openen/sluiten met het grafiek-icoon in de topbalk, Esc of de terug-knop (adres #mydata).
// De data staat NIET in deze (publieke) repo: de pagina leest alleen de kleine samenvattingen
// data/aggregates/*.json uit de privé repo (config.dataRepo) via de GitHub-API, met het token uit localStorage
// (`data.token`, hetzelfde als de check-ins). Zonder token: lege pagina met uitleg. Met ?demo: verzonnen cijfers.
// Alleen tonen: geen conclusies of adviezen.
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  const btn = bar && bar.querySelector('.tb-mydata');
  if (!btn) return;
  const CFG = window.DASHBOARD_CONFIG || {};
  const REPO = CFG.dataRepo || 'nbroers05/dashboard-data';
  const API = `https://api.github.com/repos/${REPO}/contents/data/aggregates/`;
  const GROUPS = ['youtube', 'spotify', 'letterboxd', 'series', 'places', 'work', 'money', 'body', 'computer', 'social', 'checkins', 'weather', 'context'];
  const GROUP_LABEL = { youtube: 'YouTube', spotify: 'Spotify', letterboxd: 'Letterboxd', series: 'Series', places: 'Plekken', work: 'Werk en studie', money: 'Geld', body: 'Lichaam', computer: 'Computer', social: 'Berichten en zoeken', checkins: 'Check-ins', weather: 'Weer', context: 'Kalender en maan' };
  // Kleuren voor grafieken met meerdere reeksen (vaste volgorde, kleurenblind-veilig op donker)
  const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];

  const page = h('section', 'md-page');
  page.id = 'mydata';
  page.setAttribute('aria-label', 'Mijn data');
  page.hidden = true;
  document.body.append(page);
  const place = () => { page.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 12)}px`; };
  for (const ev of ['resize', 'dash:layout', 'load']) window.addEventListener(ev, () => { if (!page.hidden) place(); });
  new ResizeObserver(() => { if (!page.hidden) place(); }).observe(bar);

  // ---------- Hulpjes ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nl = (n, d = 0) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pad = (n) => String(n).padStart(2, '0');
  const D0 = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +(s.slice(8, 10) || 1));
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (s, n) => iso(D0(s) + n * 864e5);
  const monday = (s) => addDays(s, -((new Date(D0(s)).getUTCDay() + 6) % 7));
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const WD = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const fmtMonth = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const fmtDate = (s, year = true) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}${year ? ` ${s.slice(0, 4)}` : ''}`;
  const hours = (min) => (min == null ? null : min / 60);
  const fmtH = (min) => (min == null ? '–' : min < 60 ? `${nl(min)} min` : `${nl(min / 60, min < 600 ? 1 : 0)} u`);
  const eur = (v) => `€ ${nl(v)}`;
  const note = (text) => h('p', 'w-note', text);
  const sub = (text) => h('p', 'w-sub md-sub', text);
  const mini = (title) => h('p', 'md-mini', title);

  // ---------- Periode ----------
  let period = store.get('mydata.period') || { mode: 'year' };
  let data = null;          // { index, groups: {naam: json} }
  let state = 'idle';       // idle | loading | ready | notoken | error
  let errMsg = '';

  function firstDay() {
    // Begin van "alles": de vroegste maand van een bron, maar de agenda telt niet mee (losse afspraken vanaf 2005)
    const src = data?.index?.sources || {};
    const firsts = Object.entries(src).filter(([s, v]) => v.first && s !== 'calendar').map(([, v]) => v.first);
    return `${(firsts.sort()[0] || todayIso().slice(0, 7))}-01`;
  }
  function range() {
    const t = todayIso();
    if (period.mode === 'month') return { from: `${t.slice(0, 7)}-01`, to: t };   // deze maand, vanaf de 1e
    if (period.mode === 'all') return { from: firstDay(), to: t };
    if (period.mode === 'custom' && period.from && period.to) return period.from <= period.to ? { from: period.from, to: period.to } : { from: period.to, to: period.from };
    return { from: addDays(t, -364), to: t };
  }
  const nDays = (r) => Math.round((D0(r.to) - D0(r.from)) / 864e5) + 1;
  function monthsOf(r) {
    const out = [];
    let y = +r.from.slice(0, 4), m = +r.from.slice(5, 7);
    const end = r.to.slice(0, 7);
    for (;;) { const k = `${y}-${pad(m)}`; if (k > end) break; out.push(k); if (++m > 12) { m = 1; y++; } }
    return out;
  }
  // Staafjes per dag, week of maand: zo blijft elke grafiek leesbaar
  const autoBucket = (r, min = 'day') => {
    const n = nDays(r);
    const b = n <= 62 ? 'day' : n <= 731 ? 'week' : 'month';
    const order = ['day', 'week', 'month'];
    return order[Math.max(order.indexOf(b), order.indexOf(min))];
  };
  const bucketKey = (d, b) => (b === 'day' ? d : b === 'week' ? monday(d) : d.slice(0, 7));
  const bucketLabel = (k, b) => (b === 'month' ? fmtMonth(k) : b === 'week' ? `week van ${fmtDate(k)}` : `${WD[(new Date(D0(k)).getUTCDay() + 6) % 7]} ${fmtDate(k)}`);
  const bucketShort = (k, b) => (b === 'month' ? `${MONTHS[+k.slice(5, 7) - 1]} '${k.slice(2, 4)}` : fmtDate(k, false));

  // ---------- Reeksen uit de samenvattingen ----------
  const G = (name) => data?.groups?.[name] || null;
  const meta = (g, m) => G(g)?.metrics?.[m] || {};
  const spanCache = new Map();
  function span(g, m) {
    // Tellingen: binnen de periode waarin deze metriek data heeft (eerste t/m laatste dag) telt een lege dag als 0
    const key = `${g}.${m}`;
    if (spanCache.has(key)) return spanCache.get(key);
    const days = Object.keys(G(g)?.daily?.[m] || {});
    let lo = null, hi = null;
    for (const d of days) { if (!lo || d < lo) lo = d; if (!hi || d > hi) hi = d; }
    const s = lo ? { lo, hi } : null;
    spanCache.set(key, s);
    return s;
  }
  function daily(g, m, r) {
    // Map dag -> waarde of null (onbekend), voor elke dag in de periode
    const dict = G(g)?.daily?.[m] || {};
    const isCount = (meta(g, m).kind || 'count') === 'count';
    const sp = span(g, m);
    const out = [];
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
      let v = dict[d];
      if (v == null && isCount && sp && d >= sp.lo && d <= sp.hi) v = 0;
      out.push([d, v ?? null]);
    }
    return out;
  }
  function series(g, m, r, b, how) {
    const isCount = (meta(g, m).kind || 'count') === 'count';
    how = how || (isCount ? 'sum' : 'mean');
    const map = new Map();
    for (const [d, v] of daily(g, m, r)) {
      const k = bucketKey(d, b);
      if (!map.has(k)) map.set(k, { key: k, sum: 0, n: 0 });
      if (v != null) { const o = map.get(k); o.sum += v; o.n++; }
    }
    return [...map.values()].map((o) => ({ key: o.key, label: bucketLabel(o.key, b), short: bucketShort(o.key, b), value: o.n ? (how === 'sum' ? o.sum : o.sum / o.n) : null }));
  }
  const total = (g, m, r) => { let s = 0, n = 0; for (const [, v] of daily(g, m, r)) if (v != null) { s += v; n++; } return n ? s : null; };
  const hasData = (g, m) => Object.keys(G(g)?.daily?.[m] || {}).length > 0;
  const anyIn = (g, m, r) => daily(g, m, r).some(([d]) => (G(g)?.daily?.[m] || {})[d] != null);
  function mergeTop(g, name, r, n = 10) {
    const acc = new Map();
    for (const mo of monthsOf(r)) for (const [k, v] of G(g)?.monthly?.[mo]?.[name] || []) acc.set(k, (acc.get(k) || 0) + v);
    return [...acc].sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  function sumWdh(g, r, key = 'wdh') {
    const out = new Array(168).fill(0);
    let any = false;
    for (const mo of monthsOf(r)) { const w = G(g)?.monthly?.[mo]?.[key]; if (w) { any = true; w.forEach((v, i) => { out[i] += v; }); } }
    return any ? out : null;
  }
  // Maanddata (heatmaps, top-lijsten, bank) telt hele maanden: zeg dat erbij als de periode een maand doorsnijdt
  const monthNote = (r) => (r.from.slice(8) !== '01' || addDays(r.to, 1).slice(8) !== '01' ? ' (hele maanden)' : '');

  // ---------- Grafieken (SVG, zelf getekend; hover = tooltip via data-tip) ----------
  const tipAttr = (s) => `data-tip="${esc(s)}"`;
  function barPath(x, y, w, hgt, base) {
    const rr = Math.min(4, w / 2, hgt);
    if (hgt <= 0) return '';
    return `M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${base}Z`;
  }
  function xLabels(items, W, H, padL) {
    if (!items.length) return '';
    const n = items.length, bw = (W - padL) / n;
    // Weinig staafjes met eigen korte labels (uren, sterren): alle labels; anders begin, midden en eind
    const all = n <= 3 || (n <= 24 && items.some((it) => it.short === ''));
    const idx = all ? [...items.keys()].filter((i) => items[i].short !== '') : [0, Math.floor((n - 1) / 2), n - 1];
    return idx.map((i, j) => {
      const anchor = all ? 'middle' : j === 0 ? 'start' : j === idx.length - 1 ? 'end' : 'middle';
      const x = anchor === 'start' ? padL + i * bw : anchor === 'end' ? padL + (i + 1) * bw : padL + (i + .5) * bw;
      return `<text x="${x}" y="${H - 2}" text-anchor="${anchor}" class="md-ax">${esc(items[i].short ?? items[i].label)}</text>`;
    }).join('');
  }
  function svgWrap(W, H, inner, cls = '') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    s.setAttribute('width', W);
    s.setAttribute('height', H);
    s.setAttribute('class', `md-svg ${cls}`);
    s.innerHTML = inner;
    return s;
  }
  // items: [{label, short, value}], o: {fmt, height, color, max}
  function bars(box, items, o = {}) {
    const W = Math.max(120, box.clientWidth || 300), H = o.height || 120, padT = 16, padB = 16;
    const vals = items.map((i) => i.value).filter((v) => v != null);
    const max = o.max ?? (Math.max(0, ...vals) || 1);
    const n = items.length || 1, bw = W / n, gap = bw > 6 ? 2 : bw > 3 ? 1 : 0, w = Math.max(1, bw - gap);
    const base = H - padB, ph = base - padT;
    const fmt = o.fmt || ((v) => nl(v));
    let s = `<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="md-base"/>`;
    s += `<text x="0" y="10" class="md-ax">${esc(o.maxLabel ? o.maxLabel(max) : `max ${fmt(max)}`)}</text>`;
    items.forEach((it, i) => {
      const x = i * bw + gap / 2;
      const tip = `${it.label}: ${it.value == null ? 'geen data' : fmt(it.value)}`;
      if (it.value != null && it.value > 0) s += `<path d="${barPath(x, base - (it.value / max) * ph, w, (it.value / max) * ph, base)}" class="md-bar"/>`;
      else if (it.value == null) s += `<rect x="${x}" y="${base - 2}" width="${w}" height="2" class="md-gap"/>`;
      s += `<rect x="${i * bw}" y="0" width="${bw}" height="${base}" class="md-hit" ${tipAttr(tip)}/>`;
    });
    s += xLabels(items, W, H, 0);
    return svgWrap(W, H, s);
  }
  // Gestapelde staafjes: items [{label, short, parts: [..]}], names = namen van de delen
  function stacked(box, items, names, o = {}) {
    const W = Math.max(120, box.clientWidth || 300), H = o.height || 130, padT = 16, padB = 16;
    const totals = items.map((i) => i.parts.reduce((a, b) => a + (b || 0), 0));
    const max = Math.max(0, ...totals) || 1;
    const n = items.length || 1, bw = W / n, gap = bw > 6 ? 2 : bw > 3 ? 1 : 0, w = Math.max(1, bw - gap);
    const base = H - padB, ph = base - padT;
    const fmt = o.fmt || ((v) => nl(v));
    let s = `<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="md-base"/><text x="0" y="10" class="md-ax">max ${esc(fmt(max))}</text>`;
    items.forEach((it, i) => {
      const x = i * bw + gap / 2;
      let y = base;
      it.parts.forEach((v, j) => {
        if (!v) return;
        const hh = (v / max) * ph;
        const seg = Math.max(0, hh - (j ? 1 : 0));   // 1px naad tussen de delen
        s += `<rect x="${x}" y="${y - hh}" width="${w}" height="${seg}" fill="${SERIES[j]}"/>`;
        y -= hh;
      });
      const tip = `${it.label}: ${totals[i] ? names.map((nm, j) => `${nm} ${fmt(it.parts[j] || 0)}`).join(' · ') : 'geen data'}`;
      s += `<rect x="${i * bw}" y="0" width="${bw}" height="${base}" class="md-hit" ${tipAttr(tip)}/>`;
    });
    s += xLabels(items, W, H, 0);
    return svgWrap(W, H, s);
  }
  // Lijnen op één as: xs [{label, short}], list [{name, color, values}], o {min, max, fmt}
  function lines(box, xs, list, o = {}) {
    const W = Math.max(160, box.clientWidth || 300), H = o.height || 150, padT = 10, padB = 16, padL = 18;
    const all = list.flatMap((l) => l.values).filter((v) => v != null);
    const lo = o.min ?? Math.min(0, ...all), hi = o.max ?? (Math.max(...all, 1));
    const n = xs.length, step = n > 1 ? (W - padL - 6) / (n - 1) : 0;
    const X = (i) => padL + (n > 1 ? i * step : (W - padL) / 2), Y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
    const fmt = o.fmt || ((v) => nl(v, 1));
    let s = '';
    for (const t of o.ticks || [lo, hi]) s += `<line x1="${padL}" x2="${W}" y1="${Y(t)}" y2="${Y(t)}" class="md-grid"/><text x="0" y="${Y(t) + 4}" class="md-ax">${esc(o.tickFmt ? o.tickFmt(t) : nl(t))}</text>`;
    for (const l of list) {
      let d = '', pen = false;
      l.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
      s += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      // Losse punten (zonder buren) en weinig punten: stipjes, anders zie je ze niet
      l.values.forEach((v, i) => {
        if (v == null) return;
        const alone = (l.values[i - 1] == null) && (l.values[i + 1] == null);
        if (alone || n <= 40) s += `<circle cx="${X(i)}" cy="${Y(v)}" r="${alone ? 4 : 3}" fill="${l.color}" class="md-dot"/>`;
      });
    }
    const cw = n > 1 ? step : W - padL;
    xs.forEach((x, i) => {
      const tip = `${x.label}: ${list.map((l) => `${l.name} ${l.values[i] == null ? '–' : (l.fmt || fmt)(l.values[i], i)}`).join(' · ')}`;
      s += `<rect x="${X(i) - cw / 2}" y="0" width="${cw}" height="${H - padB}" class="md-hit md-col" ${tipAttr(tip)}/>`;
    });
    s += xLabels(xs, W, H, padL);
    return svgWrap(W, H, s);
  }
  function legend(list) {
    const l = h('div', 'md-legend');
    for (const it of list) { const s = h('span'); const sw = h('i'); sw.style.background = it.color; s.append(sw, it.name); l.append(s); }
    return l;
  }
  // Weekdag x uur: 7 rijen, 24 kolommen
  function heat(wdh, fmt) {
    const max = Math.max(...wdh) || 1;
    const g = h('div', 'md-heat');
    g.append(h('span'));
    for (let hr = 0; hr < 24; hr++) g.append(h('span', 'md-heat-h', hr % 6 === 0 ? String(hr) : ''));
    for (let d = 0; d < 7; d++) {
      g.append(h('span', 'md-heat-d', WD[d]));
      for (let hr = 0; hr < 24; hr++) {
        const v = wdh[d * 24 + hr];
        const c = h('span', 'md-cell');
        c.style.setProperty('--a', v ? (0.12 + 0.88 * Math.sqrt(v / max)).toFixed(2) : 0);
        c.dataset.tip = `${WD[d]} ${pad(hr)}:00–${pad(hr + 1)}:00 · ${fmt(v)}`;
        g.append(c);
      }
    }
    return g;
  }
  // Top-lijst met balkjes
  function topList(list, fmt, label = (k) => k) {
    const max = list[0]?.[1] || 1;
    const ol = h('ol', 'md-top');
    for (const [k, v] of list) {
      const li = h('li');
      const nm = h('span', 'md-top-name', label(k));
      nm.title = label(k);
      const tr = h('span', 'md-top-bar');
      tr.style.setProperty('--w', `${Math.max(2, (v / max) * 100)}%`);
      li.append(nm, h('span', 'md-top-val', fmt(v)), tr);
      ol.append(li);
    }
    return ol;
  }
  // Grafiek in een vakje dat zijn breedte pas na het invoegen kent
  function chart(parent, draw, cls = '') {
    const box = h('div', `md-chart ${cls}`);
    parent.append(box);
    charts.push(() => box.replaceChildren(draw(box)));
    return box;
  }
  let charts = [];

  // ---------- Opbouw van de pagina ----------
  const head = h('header', 'card md-head');
  const title = h('h2', null, 'Mijn data');
  const periodEl = h('div', 'md-period');
  const custom = h('form', 'md-custom');
  const fromIn = h('input'); fromIn.type = 'date'; fromIn.setAttribute('aria-label', 'Vanaf');
  const toIn = h('input'); toIn.type = 'date'; toIn.setAttribute('aria-label', 'Tot en met');
  custom.append(fromIn, h('span', 'w-sub', 't/m'), toIn, h('button', 'w-btn ghost', 'Toon'));
  const meta0 = h('p', 'w-sub md-meta');
  head.append(title, periodEl, custom, meta0);
  const grid = h('div', 'md-grid');
  page.append(head, grid);
  for (const [mode, label] of [['month', 'Deze maand'], ['year', 'Jaar'], ['all', 'Alles'], ['custom', 'Eigen periode']]) {
    const b = h('button', null, label);
    b.type = 'button';
    b.dataset.mode = mode;
    b.onclick = () => {
      if (mode === 'custom') { const r = range(); period = { mode, from: period.from || r.from, to: period.to || r.to }; }
      else period = { mode };
      store.set('mydata.period', period);
      render();
    };
    periodEl.append(b);
  }
  custom.onsubmit = (e) => {
    e.preventDefault();
    if (!fromIn.value || !toIn.value) return;
    period = { mode: 'custom', from: fromIn.value, to: toIn.value };
    store.set('mydata.period', period);
    render();
  };

  function tile(id, name, color, extra = '') {
    const card = h('section', `card tile md-tile ${extra}`);
    card.id = id;
    if (color) card.style.setProperty('--c', color);
    const hd = h('div', 'md-tile-head');
    hd.append(h('p', 'eyebrow', name));
    const body = h('div', 'w-body md-body');
    card.append(hd, body);
    grid.append(card);
    return { card, head: hd, body };
  }
  const T = {
    cov: tile('md-cov', 'Dekking per bron', '#9aa0b4'),
    kpis: (() => { const k = h('div', 'md-kpis'); k.id = 'md-kpis'; grid.append(k); return k; })(),
    watch: tile('md-watch', 'Kijken en luisteren', '#ff3b3b'),
    places: tile('md-places', 'Plekken', '#a78bfa'),
    check: tile('md-check', 'Check-ins', 'var(--c-checkin)'),
    work: tile('md-work', 'Werk en studie', 'var(--c-ah)'),
    money: tile('md-money', 'Geld', '#f5b02e'),
    body: tile('md-body', 'Lichaam', '#ff5f8f'),
    pc: tile('md-pc', 'Computer', '#8a8aa0'),
    overlap: tile('md-overlap', 'Overlap', '#2ec4b6'),
  };

  // ---------- Dekking: per bron welke maanden data hebben ----------
  const COVER = [
    ['YouTube', ['youtube-history']], ['Spotify', ['spotify', 'spotify-history']], ['Letterboxd', ['letterboxd-export', 'letterboxd']],
    ['Agenda', ['calendar']], ['Maps', ['maps-timeline']], ['Bank', ['bank']], ['Gezondheid', ['fit-daily', 'health-daily', 'health-sleep', 'health-heartrate']],
    ['Check-ins', ['self-report']], ['Pc', ['pc-window', 'pc-web', 'pc-sessions', 'pc-afk']], ['Telefoon', ['activitywatch-android']],
    ['Meldingen', ['notifications']], ['Steam', ['steam']], ['Weer', ['weather', 'weather-daily']],
    ['Pc aan/uit', ['pc-power']], ['Firefox', ['firefox-history']], ['Series', ['episodes-left']], ["Foto's", ['photos']],
    ['Zoeken', ['google-search']], ['OV', ['ov-trips']], ['Claude', ['claude-conversations']], ['Berichten', ['messages-daily']],
    ['Kalender', ['day-context']], ['Maan', ['moon']],
  ];
  function renderCoverage(r) {
    const src = data.index.sources || {};
    const start = firstDay().slice(0, 7), months = monthsOf({ from: `${start}-01`, to: todayIso() });
    T.cov.head.querySelector('.eyebrow').textContent = `Dekking per bron, ${start.slice(0, 4)} tot nu`;
    const rows = [], empty = [];
    for (const [label, list] of COVER) {
      const per = {};
      let any = false, before = 0;
      for (const s of list) for (const [m, n] of Object.entries(src[s]?.months || {})) { if (m < start) before += n; else { per[m] = (per[m] || 0) + n; any = true; } }
      if (any) rows.push({ label, per, before }); else empty.push(label);
    }
    const wrap = h('div', 'md-cov');
    const sel = new Set(monthsOf(r));
    for (const row of rows) {
      wrap.append(h('span', 'md-cov-name', row.label));
      chart(wrap, (box) => {
        const W = Math.max(120, box.clientWidth), H = 14, n = months.length, bw = W / n;
        const max = Math.max(...Object.values(row.per));
        let s = `<rect x="0" y="3" width="${W}" height="8" rx="4" class="md-cov-track"/>`;
        months.forEach((m, i) => {
          const v = row.per[m];
          if (v) s += `<rect x="${i * bw}" y="2" width="${Math.max(1, bw - (bw > 4 ? 1 : 0))}" height="10" rx="${bw > 6 ? 2 : 0}" class="md-cov-on${sel.has(m) ? ' sel' : ''}" style="opacity:${(0.45 + 0.55 * Math.log1p(v) / Math.log1p(max)).toFixed(2)}"/>`;
          s += `<rect x="${i * bw}" y="0" width="${bw}" height="${H}" class="md-hit md-cov-hit" data-month="${m}" ${tipAttr(`${row.label} · ${fmtMonth(m)} · ${v ? `${nl(v)} rijen` : 'geen data'}${i === 0 && row.before ? ` (en ${nl(row.before)} rijen van vóór ${start.slice(0, 4)})` : ''}`)}/>`;
        });
        // Gekozen periode als kader over de balk
        const a = months.indexOf(r.from.slice(0, 7)), b = months.indexOf(r.to.slice(0, 7));
        const ia = a < 0 ? 0 : a, ib = b < 0 ? n - 1 : b;
        s += `<rect x="${ia * bw}" y="0.5" width="${(ib - ia + 1) * bw}" height="${H - 1}" rx="3" class="md-cov-period"/>`;
        return svgWrap(W, H, s, 'md-cov-svg');
      }, 'md-cov-bar');
    }
    if (empty.length) {
      wrap.append(h('span', 'md-cov-name md-cov-empty', 'Nog leeg'), h('span', 'w-sub md-cov-emptylist', empty.join(', ')));
    }
    const axis = h('div', 'md-cov-axis');
    axis.append(h('span', null, start.slice(0, 4)), h('span', null, months.length > 24 ? String(Math.round((+start.slice(0, 4) + +todayIso().slice(0, 4)) / 2)) : ''), h('span', null, 'nu'));
    wrap.append(h('span'), axis);
    T.cov.body.replaceChildren(wrap, sub('Klik op een maand om alleen die maand te bekijken. Lichter = minder rijen.'));
  }
  // Klik op een maand in de dekking = eigen periode van die maand
  page.addEventListener('click', (e) => {
    const m = e.target.closest?.('[data-month]')?.dataset.month;
    if (!m) return;
    const last = addDays(iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)), -1);
    period = { mode: 'custom', from: `${m}-01`, to: last };
    store.set('mydata.period', period);
    render();
  });

  // ---------- Kerncijfers ----------
  function renderKpis(r) {
    const items = [
      [total('youtube', 'videos', r), "YouTube-video's", nl],
      [total('letterboxd', 'films', r), 'films gekeken', nl],
      [total('places', 'visits', r), 'plekken bezocht', nl],
      [total('work', 'ah_hours', r), 'AH-uren', (v) => `${nl(v)} u`],
    ];
    T.kpis.replaceChildren(...items.map(([v, label, f]) => {
      const c = h('div', 'card md-kpi');
      c.append(h('b', null, v == null ? '–' : f(v)), h('span', null, label));
      return c;
    }));
  }

  // ---------- Kijken en luisteren ----------
  let watchTab = store.get('mydata.watchTab') || 'youtube';
  function renderWatch(r) {
    const tabs = h('div', 'fd-tabs md-tabs');
    for (const [k, label] of [['youtube', 'YouTube'], ['spotify', 'Spotify'], ['letterboxd', 'Letterboxd'], ['series', 'Series']]) {
      const b = h('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', watchTab === k);
      b.onclick = () => { watchTab = k; store.set('mydata.watchTab', k); render(); };
      tabs.append(b);
    }
    T.watch.head.querySelector('.md-tabs')?.remove();
    T.watch.head.append(tabs);
    const body = T.watch.body;
    body.replaceChildren();
    const b = autoBucket(r);
    const per = { day: 'per dag', week: 'per week', month: 'per maand' }[b];
    if (watchTab === 'youtube') {
      if (!hasData('youtube', 'videos')) return body.append(note('Nog geen YouTube-geschiedenis. Importeer de Takeout-export (zie de README van het archief).'));
      const wdh = sumWdh('youtube', r);
      body.append(mini(`Wanneer, weekdag × uur${monthNote(r)}`), wdh ? heat(wdh, (v) => `${nl(v)} video's`) : note('Geen video’s in deze periode.'));
      body.append(mini(`Video's ${per}`));
      chart(body, (box) => bars(box, series('youtube', 'videos', r, b), { fmt: (v) => `${nl(v)} video's`, maxLabel: (m) => `max ${nl(m)}` }));
      const top = mergeTop('youtube', 'channels', r);
      const tl = top.length ? topList(top, nl) : note('–');
      tl.classList.add('md-top2');
      body.append(mini('Top 10 kanalen'), tl);
      body.append(sub("Alleen bekeken video's (geen advertenties). Shorts tellen ook mee."));
    } else if (watchTab === 'spotify') {
      if (!hasData('spotify', 'minutes')) return body.append(note('Nog geen Spotify-data.'));
      const wdh = sumWdh('spotify', r);
      const byHour = wdh ? Array.from({ length: 24 }, (_, hr) => WD.reduce((a, _d, d) => a + wdh[d * 24 + hr], 0)) : null;
      body.append(mini(`Luistertijd per uur van de dag${monthNote(r)}`));
      if (byHour) chart(body, (box) => bars(box, byHour.map((v, hr) => ({ label: `${pad(hr)}:00–${pad(hr + 1)}:00`, short: hr % 6 === 0 ? `${hr}:00` : '', value: v })), { fmt: fmtH, height: 90 }));
      else body.append(note('Niets geluisterd in deze periode.'));
      const row = h('div', 'md-split');
      const a = h('div'), c = h('div');
      const ta = mergeTop('spotify', 'artists', r), tt = mergeTop('spotify', 'tracks', r);
      a.append(mini('Top artiesten'), ta.length ? topList(ta, fmtH) : note('–'));
      c.append(mini('Top nummers'), tt.length ? topList(tt, fmtH) : note('–'));
      row.append(a, c);
      body.append(row, mini(`Luistertijd ${per}`));
      chart(body, (box) => bars(box, series('spotify', 'minutes', r, b), { fmt: fmtH, maxLabel: (m) => `max ${fmtH(m)}` }));
      if (G('spotify')?.note && !(data.index.sources['spotify-history']?.rows)) body.append(sub('Nog zonder de volledige Spotify-geschiedenis: alleen sinds de koppeling (elk uur de laatste 50 nummers), als lengte van het nummer.'));
    } else if (watchTab === 'series') {
      if (!hasData('series', 'episodes')) return body.append(note('Nog geen series. Het dashboard op de pc bewaart elk half uur wat Episodes Left doorgeeft; na twee momentopnames zie je hier welke afleveringen je keek.'));
      body.append(mini(`Afleveringen ${per}`));
      chart(body, (box) => bars(box, series('series', 'episodes', r, b), { fmt: (v) => `${nl(v)} afleveringen` }));
      const top = mergeTop('series', 'series', r);
      body.append(mini('Meest gekeken series'), top.length ? topList(top, (v) => `${nl(v)} afl.`) : note('Geen afleveringen in deze periode.'));
      body.append(sub('Uit Episodes Left: gekeken = uitgezonden (AniList) min nog open, per momentopname.'));
    } else {
      if (!hasData('letterboxd', 'films')) return body.append(note('Nog geen Letterboxd-data.'));
      body.append(mini(`Films ${per}`));
      chart(body, (box) => bars(box, series('letterboxd', 'films', r, b), { fmt: (v) => `${nl(v)} films` }));
      const dist = new Array(11).fill(0);
      for (const mo of monthsOf(r)) (G('letterboxd').monthly?.[mo]?.ratings || []).forEach((v, i) => { dist[i] += v; });
      const rated = dist.slice(1).reduce((a, v) => a + v, 0);
      const avg = rated ? dist.slice(1).reduce((a, v, i) => a + v * (i + 1) / 2, 0) / rated : null;
      body.append(mini(`Mijn cijfers${monthNote(r)}${avg ? ` · gemiddeld ${nl(avg, 2)} ★ over ${nl(rated)} films` : ''}`));
      if (rated) chart(body, (box) => bars(box, dist.slice(1).map((v, i) => ({ label: `${nl((i + 1) / 2, 1)} ★`, short: (i + 1) % 2 === 0 ? `${(i + 1) / 2}★` : '', value: v })), { fmt: (v) => `${nl(v)} films`, height: 100 }));
      else body.append(note('Geen cijfers in deze periode.'));
      if (dist[0]) body.append(sub(`${nl(dist[0])} films zonder cijfer.`));
    }
  }

  // ---------- Plekken: kaart (Leaflet + OpenStreetMap) ----------
  let leaflet = null, map = null, layer = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leaflet) return leaflet;
    leaflet = new Promise((resolve, reject) => {
      const css = h('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      const js = h('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = resolve; js.onerror = () => { leaflet = null; reject(new Error('Kaart kon niet laden')); };
      document.head.append(css, js);
    });
    return leaflet;
  }
  const placeName = (n, type) => ({ HOME: 'Thuis', WORK: 'Werk', INFERRED_WORK: 'Werk' }[type] || (type === 'SEARCHED_ADDRESS' ? `Gezocht adres (${n})` : `Plek ${n}`));
  function renderPlaces(r) {
    const body = T.places.body;
    const P = G('places');
    if (!P || !Object.keys(P.monthly || {}).length) { map = null; return body.replaceChildren(note('Nog geen Maps-tijdlijn. Exporteer hem op je telefoon (Instellingen › Locatie › Tijdlijn › Exporteren) en importeer hem op de pc.')); }
    const cells = new Map(), places = new Map();
    for (const mo of monthsOf(r)) {
      const m = P.monthly[mo];
      if (!m) continue;
      for (const [lat, lng, min] of m.grid || []) { const k = `${lat},${lng}`; cells.set(k, (cells.get(k) || 0) + min); }
      for (const [n, min, visits, type, lat, lng] of m.places || []) {
        const p = places.get(n) || { n, min: 0, visits: 0, type, lat, lng };
        p.min += min; p.visits += visits; places.set(n, p);
      }
    }
    const mapBox = h('div', 'md-map');
    const side = h('div', 'md-places-side');
    const row = h('div', 'md-split md-places-split');
    row.append(mapBox, side);
    body.replaceChildren(row);
    // Thuis vs elders per week
    const b = autoBucket(r, 'week');
    const keys = ['home_min', 'work_min', 'away_min', 'travel_min'], names = ['thuis', 'werk', 'elders', 'onderweg'];
    const ser = keys.map((k) => series('places', k, r, b, 'sum'));
    side.append(mini(`Thuis vs. elders ${b === 'week' ? 'per week' : 'per maand'}`));
    if (ser[0].some((x) => x.value != null) || ser[2].some((x) => x.value != null)) {
      chart(side, (box) => stacked(box, ser[0].map((x, i) => ({ label: x.label, short: x.short, parts: ser.map((s) => s[i].value || 0) })), names, { fmt: fmtH, height: 110 }));
      side.append(legend(names.map((nm, i) => ({ name: nm, color: SERIES[i] }))));
    } else side.append(note('Geen tijdlijn in deze periode.'));
    const top = [...places.values()].sort((a, c) => c.min - a.min).slice(0, 5);
    side.append(mini(`Meest bezochte plekken${monthNote(r)}`));
    if (top.length) {
      const ol = h('ol', 'md-top md-places-top');
      const max = top[0].min || 1;
      for (const p of top) {
        const li = h('li', 'md-place');
        li.tabIndex = 0;
        const nm = h('span', 'md-top-name', placeName(p.n, p.type));
        const tr = h('span', 'md-top-bar');
        tr.style.setProperty('--w', `${Math.max(2, (p.min / max) * 100)}%`);
        li.append(nm, h('span', 'md-top-val', `${fmtH(p.min)} · ${nl(p.visits)}×`), tr);
        li.onclick = () => map && map.flyTo([p.lat, p.lng], 15, { duration: .6 });
        ol.append(li);
      }
      side.append(ol);
    } else side.append(note('–'));
    side.append(sub('Vakjes van ~250 m, geen exacte routes. Plek-nummers blijven elke periode hetzelfde.'));
    // Kaart
    if (!cells.size) { mapBox.append(note('Geen plekken in deze periode.')); map = null; return; }
    mapBox.append(h('p', 'w-sub md-map-wait', 'Kaart laden…'));
    loadLeaflet().then(() => {
      if (!mapBox.isConnected) return;
      mapBox.replaceChildren();
      const L = window.L;
      map = L.map(mapBox, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      layer = L.layerGroup().addTo(map);
      const dLat = (P.grid_m || 250) / 111320, dLng = (P.grid_m || 250) / (111320 * Math.cos(52 * Math.PI / 180));
      const list = [...cells].map(([k, min]) => { const [lat, lng] = k.split(',').map(Number); return { lat, lng, min }; }).sort((a, c) => c.min - a.min);
      const max = list[0].min;
      const color = getComputedStyle(T.places.card).getPropertyValue('--ct').trim() || '#a78bfa';
      for (const c of list) {
        L.rectangle([[c.lat - dLat / 2, c.lng - dLng / 2], [c.lat + dLat / 2, c.lng + dLng / 2]], { stroke: false, fillColor: color, fillOpacity: 0.15 + 0.7 * Math.sqrt(c.min / max) })
          .bindTooltip(fmtH(c.min)).addTo(layer);
      }
      // Inzoomen op de vakjes waar je 90% van de tijd was (een verre reis zoomt de kaart anders heel ver uit)
      let acc = 0;
      const all = list.reduce((a, c) => a + c.min, 0), keep = [];
      for (const c of list) { keep.push([c.lat, c.lng]); acc += c.min; if (acc >= all * 0.9 && keep.length >= 3) break; }
      map.fitBounds(L.latLngBounds(keep).pad(0.3), { maxZoom: 14 });
    }).catch((e) => mapBox.replaceChildren(note(e.message)));
  }

  // ---------- Werk en studie ----------
  function renderWork(r) {
    const body = T.work.body;
    body.replaceChildren();
    if (!G('work')) return body.append(note('Nog geen agenda-data.'));
    const b = autoBucket(r, 'week');
    const per = b === 'week' ? 'per week' : 'per maand';
    body.append(mini(`AH-uren ${per}`));
    if (anyIn('work', 'ah_hours', r)) chart(body, (box) => bars(box, series('work', 'ah_hours', r, b), { fmt: (v) => `${nl(v, 1)} u`, height: 100 }));
    else body.append(note('Geen AH-diensten in deze periode (diensten = afspraken met "AH" in de titel).'));
    body.append(mini(`Colleges ${per}`));
    if (anyIn('work', 'colleges', r)) chart(body, (box) => bars(box, series('work', 'colleges', r, b), { fmt: (v) => `${nl(v)} colleges`, height: 80 }));
    else body.append(note('Geen colleges in deze periode (herkend aan woorden als college, werkgroep, tentamen).'));
    const dl = (G('work').deadlines || []).filter(([d]) => d >= r.from && d <= addDays(todayIso(), 14) && (d <= r.to || d >= todayIso()));
    body.append(mini('Deadlines'));
    if (dl.length) {
      const ul = h('ul', 'md-dl');
      for (const [d, t, name] of dl.slice(-8)) { const li = h('li'); li.append(h('b', null, `${fmtDate(d, false)}${t ? ` ${t}` : ''}`), h('span', null, name)); ul.append(li); }
      body.append(ul);
    } else body.append(note('Geen Canvas-deadlines in de agenda voor deze periode.'));
  }

  // ---------- Geld ----------
  function renderMoney(r) {
    const body = T.money.body;
    body.replaceChildren();
    const M = G('money');
    if (!M || !Object.keys(M.monthly || {}).length) return body.append(note('Nog geen bankafschriften. Importeer een export van je bank op de pc.'));
    const months = monthsOf(r).filter((m) => M.monthly[m]);
    if (!months.length) return body.append(note('Geen bankdata in deze periode.'));
    const tin = months.reduce((a, m) => a + M.monthly[m].in, 0), tout = months.reduce((a, m) => a + M.monthly[m].out, 0);
    const sum = h('div', 'md-money-sum');
    sum.append(h('span', null, `In ${eur(tin)}`), h('span', null, `Uit ${eur(tout)}`));
    body.append(sum, mini(`In en uit per maand${monthNote(r)}`));
    chart(body, (box) => {
      // Twee staafjes per maand naast elkaar: in (1) en uit (2)
      const W = Math.max(120, box.clientWidth), H = 110, padT = 16, padB = 16, base = H - padB;
      const max = Math.max(1, ...months.flatMap((m) => [M.monthly[m].in, M.monthly[m].out]));
      const n = months.length, bw = W / n, w = Math.max(1, (bw - 4) / 2);
      let s = `<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="md-base"/><text x="0" y="10" class="md-ax">max ${esc(eur(max))}</text>`;
      months.forEach((m, i) => {
        const o = M.monthly[m];
        [o.in, o.out].forEach((v, j) => { const hh = (v / max) * (base - padT); s += `<path d="${barPath(i * bw + 1 + j * (w + 2), base - hh, w, hh, base)}" fill="${SERIES[j]}"/>`; });
        s += `<rect x="${i * bw}" y="0" width="${bw}" height="${base}" class="md-hit" ${tipAttr(`${fmtMonth(m)}: in ${eur(o.in)} · uit ${eur(o.out)}`)}/>`;
      });
      s += xLabels(months.map((m) => ({ label: fmtMonth(m), short: bucketShort(m, 'month') })), W, H, 0);
      return svgWrap(W, H, s);
    });
    body.append(legend([{ name: 'in', color: SERIES[0] }, { name: 'uit', color: SERIES[1] }]));
    const cats = new Map();
    for (const m of months) for (const [c, [i, o]] of Object.entries(M.monthly[m].cats || {})) { const x = cats.get(c) || [0, 0]; x[0] += i; x[1] += o; cats.set(c, x); }
    const internal = new Set(M.internal || []);
    const outs = [...cats].filter(([c, v]) => v[1] > 0 && !internal.has(c)).map(([c, v]) => [c, v[1]]).sort((a, b) => b[1] - a[1]);
    const ins = [...cats].filter(([c, v]) => v[0] > 0 && !internal.has(c)).map(([c, v]) => [c, v[0]]).sort((a, b) => b[1] - a[1]);
    const row = h('div', 'md-split');
    const a = h('div'), c = h('div');
    a.append(mini('Uitgaven per categorie'), outs.length ? topList(outs.slice(0, 8), eur) : note('–'));
    c.append(mini('Inkomsten per categorie'), ins.length ? topList(ins.slice(0, 6), eur) : note('–'));
    row.append(a, c);
    body.append(row);
    const own = [...internal].map((k) => cats.get(k)).filter(Boolean);
    body.append(sub(`Categorieën zijn geschat uit de omschrijving.${own.length ? ` Overboekingen met je eigen rekening tellen niet mee (in ${eur(own.reduce((x, v) => x + v[0], 0))}, uit ${eur(own.reduce((x, v) => x + v[1], 0))}).` : ''} Alleen weergave.`));
  }

  // ---------- Lichaam ----------
  function renderBody(r) {
    const body = T.body.body;
    body.replaceChildren();
    if (!G('body')) return body.append(note('Nog geen gezondheidsdata.'));
    const b = autoBucket(r);
    const avgNote = b === 'day' ? '' : ' (gemiddeld per dag)';
    const parts = [
      ['steps', `Stappen${avgNote}`, (v) => `${nl(v)} stappen`, 'Geen stappen in deze periode.'],
      ['sleep_h', `Slaap${avgNote}`, (v) => `${nl(v, 1)} u`, 'Nog geen slaapdata: Google Health geeft nu alleen stappen door.'],
      ['resting_hr', 'Rusthartslag', (v) => `${nl(v)} bpm`, null],
      ['avg_hr', 'Gemiddelde hartslag', (v) => `${nl(v)} bpm`, 'Nog geen hartslag: komt vanzelf mee als je horloge of telefoon hem doorgeeft.'],
    ];
    let shown = 0;
    for (const [m, label, fmt, empty] of parts) {
      if (anyIn('body', m, r)) {
        body.append(mini(label));
        chart(body, (box) => bars(box, series('body', m, r, b, 'mean'), { fmt, height: 90 }));
        shown++;
      } else if (empty && !(m === 'avg_hr' && anyIn('body', 'resting_hr', r))) body.append(mini(label.replace(avgNote, '')), note(empty));
    }
    if (shown) body.append(sub('Stappen uit Google Fit (oud) en Google Health (nu).'));
  }

  // ---------- Computer ----------
  function renderPc(r) {
    const body = T.pc.body;
    body.replaceChildren();
    const C = G('computer');
    const hasPc = C && ['pc_active_min', 'pc_on_min'].some((m) => hasData('computer', m));
    const b = autoBucket(r);
    const per = { day: 'per dag', week: 'per week', month: 'per maand' }[b];
    if (hasPc) {
      const m = hasData('computer', 'pc_active_min') ? 'pc_active_min' : 'pc_on_min';
      body.append(mini(`${m === 'pc_active_min' ? 'Actieve tijd' : 'Pc aan'} ${per}`));
      chart(body, (box) => bars(box, series('computer', m, r, b), { fmt: fmtH, height: 90, maxLabel: (x) => `max ${fmtH(x)}` }));
      const wdh = sumWdh('computer', r);
      if (wdh) body.append(mini(`Wanneer de pc aan staat${monthNote(r)}`), heat(wdh, fmtH));
      const row = h('div', 'md-split');
      const a = h('div'), c = h('div');
      const apps = mergeTop('computer', 'apps', r, 6), sites = mergeTop('computer', 'sites', r, 6);
      a.append(mini('Top apps'), apps.length ? topList(apps, fmtH) : note('–'));
      c.append(mini('Top sites'), sites.length ? topList(sites, fmtH) : note('–'));
      row.append(a, c);
      body.append(row);
    } else {
      body.append(note('Nu nog leeg: wordt vanzelf gevuld door ActivityWatch (de pc-taak stuurt elke dag actieve tijd, apps en sites door).'));
    }
    if (C && hasData('computer', 'notifications') && anyIn('computer', 'notifications', r)) {
      const top = mergeTop('computer', 'notif_apps', r, 5);
      body.append(mini(`Meldingen ${per}`));
      chart(body, (box) => bars(box, series('computer', 'notifications', r, b), { fmt: (v) => `${nl(v)} meldingen`, height: 70 }));
      if (top.length) body.append(topList(top, nl));
    }
    if (C && anyIn('computer', 'steam_min', r)) {
      body.append(mini('Gamen (Steam)'), topList(mergeTop('computer', 'games', r, 5), fmtH));
    }
    if (C && anyIn('computer', 'phone_min', r)) {
      body.append(mini(`Schermtijd telefoon ${per}`));
      chart(body, (box) => bars(box, series('computer', 'phone_min', r, b), { fmt: fmtH, height: 70 }));
    }
    if (C && anyIn('computer', 'ff_visits', r)) {
      body.append(mini(`Firefox-bezoeken ${per}`));
      chart(body, (box) => bars(box, series('computer', 'ff_visits', r, b), { fmt: (v) => `${nl(v)} bezoeken`, height: 70 }));
      const wdh = sumWdh('computer', r, 'ff_wdh');
      if (wdh) body.append(mini(`Wanneer je surft${monthNote(r)}`), heat(wdh, (v) => `${nl(v)} bezoeken`));
      if (!hasPc) body.append(mini('Meest bezochte sites'), topList(mergeTop('computer', 'ff_sites', r, 6), (v) => `${nl(v)}×`));
    }
    const boots = total('computer', 'boots', r), chats = total('computer', 'claude_chats', r);
    const facts = [boots ? `${nl(boots)}× opgestart` : '', chats ? `${nl(chats)} Claude-gesprekken` : ''].filter(Boolean);
    if (facts.length) body.append(sub(facts.join(' · ')));
  }

  // ---------- Check-ins ----------
  const SCALES = [['mood', 'stemming'], ['energy', 'energie'], ['focus', 'focus'], ['stress', 'stress']];
  function renderCheck(r) {
    const body = T.check.body;
    body.replaceChildren();
    if (!G('checkins') || !hasData('checkins', 'checkins')) return body.append(note('Nog geen check-ins. Vul er een in via het check-in-vak op het dashboard.'));
    const n = total('checkins', 'checkins', r) || 0, p = total('checkins', 'prompts', r) || 0, a = total('checkins', 'answered', r) || 0;
    const kp = h('div', 'md-money-sum');
    kp.append(h('span', null, `${nl(n)} ingevuld`), h('span', null, p ? `${nl(a)} van ${nl(p)} meldingen` : 'geen meldingen'));
    body.append(kp);
    if (!n) return body.append(note('Geen check-ins in deze periode.'));
    const b = autoBucket(r);
    const ser = SCALES.map(([k]) => series('checkins', k, r, b, 'mean'));
    const list = SCALES.map(([, name], i) => ({ name, color: SERIES[i], values: ser[i].map((x) => x.value) }));
    body.append(legend(list));
    chart(body, (box) => lines(box, ser[0], list, { min: 1, max: 5, ticks: [1, 3, 5], height: 150 }), 'md-check-chart');
    body.append(sub(`1 = heel laag, 5 = heel hoog (stress: 5 = veel)${b === 'day' ? '' : `; gemiddelde ${b === 'week' ? 'per week' : 'per maand'}`}.`));
  }

  // ---------- Overlap: twee bronnen per dag over elkaar ----------
  let ov = store.get('mydata.overlap') || { a: 'youtube.videos', b: 'work.ah_hours' };
  function metricsList() {
    const out = [];
    for (const g of GROUPS) for (const [m, mt] of Object.entries(G(g)?.metrics || {})) if (hasData(g, m)) out.push({ id: `${g}.${m}`, g, m, label: mt.label, unit: mt.unit, group: GROUP_LABEL[g] });
    return out;
  }
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function renderOverlap(r) {
    const body = T.overlap.body;
    body.replaceChildren();
    const list = metricsList();
    if (list.length < 2) return body.append(note('Er zijn nog te weinig bronnen met data per dag.'));
    if (!list.find((x) => x.id === ov.a)) ov.a = list[0].id;
    if (!list.find((x) => x.id === ov.b) || ov.b === ov.a) ov.b = list.find((x) => x.id !== ov.a).id;
    const ctrl = h('div', 'md-ov-ctrl');
    const mk = (key, color) => {
      const s = h('select', 'md-select');
      s.style.setProperty('--sw', color);
      s.setAttribute('aria-label', key === 'a' ? 'Bron A' : 'Bron B');
      let og = null, last = '';
      for (const x of list) {
        if (x.group !== last) { og = h('optgroup'); og.label = x.group; s.append(og); last = x.group; }
        const o = h('option', null, x.label); o.value = x.id; og.append(o);
      }
      s.value = ov[key];
      s.onchange = () => { ov[key] = s.value; store.set('mydata.overlap', ov); renderOverlap(range()); charts.forEach((f) => f()); };
      return s;
    };
    const A = list.find((x) => x.id === ov.a), B = list.find((x) => x.id === ov.b);
    const da = daily(A.g, A.m, r), db = daily(B.g, B.m, r);
    const xs = [], ys = [];
    da.forEach(([, v], i) => { const w = db[i][1]; if (v != null && w != null) { xs.push(v); ys.push(w); } });
    const rr = pearson(xs, ys);
    const rEl = h('p', 'md-r', rr == null ? 'r = –' : `r = ${nl(rr, 2)}`);
    rEl.title = 'Pearson-correlatie over de dagen waarop allebei een waarde hebben';
    ctrl.append(mk('a', SERIES[0]), mk('b', SERIES[1]), rEl);
    body.append(ctrl);
    const b = autoBucket(r);
    const sa = series(A.g, A.m, r, b), sb = series(B.g, B.m, r, b);
    // Eén as: elke reeks geschaald naar zijn eigen hoogste waarde (= 100%); de echte waarden staan in de tooltip
    const norm = (s) => { const mx = Math.max(...s.map((x) => x.value ?? -Infinity)); return s.map((x) => (x.value == null ? null : mx > 0 ? x.value / mx * 100 : 0)); };
    const fmtVal = (x, v) => (x.unit === 'min' ? fmtH(v) : `${nl(v, v % 1 ? 1 : 0)} ${x.unit}`);
    const lst = [
      { name: A.label, color: SERIES[0], values: norm(sa), fmt: (_v, i) => (sa[i].value == null ? '–' : fmtVal(A, sa[i].value)) },
      { name: B.label, color: SERIES[1], values: norm(sb), fmt: (_v, i) => (sb[i].value == null ? '–' : fmtVal(B, sb[i].value)) },
    ];
    body.append(legend(lst));
    chart(body, (box) => lines(box, sa, lst, { min: 0, max: 100, ticks: [0, 50, 100], tickFmt: (t) => `${t}%`, height: 200 }), 'md-ov-chart');
    const per = { day: 'per dag', week: 'per week', month: 'per maand' }[b];
    body.append(sub(`${per[0].toUpperCase()}${per.slice(1)}, elke lijn geschaald naar zijn eigen hoogste punt (100%). De correlatie (r, van −1 tot 1) is berekend over ${nl(xs.length)} dagen waarop allebei een waarde hebben${xs.length < 3 ? ': te weinig om iets te zeggen' : ''}. Samenhang zegt niets over oorzaak.`));
  }

  // ---------- Tooltip (gedeeld door alle grafieken) ----------
  const tip = h('div', 'md-tip');
  tip.hidden = true;
  document.body.append(tip);
  function showTip(e) {
    const t = e.target.closest?.('[data-tip]');
    if (!t || page.hidden) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const x = Math.min(window.innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2));
    const y = e.clientY - r.height - 14 < 8 ? e.clientY + 18 : e.clientY - r.height - 14;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  page.addEventListener('pointermove', showTip);
  page.addEventListener('pointerdown', showTip);
  page.addEventListener('pointerleave', () => { tip.hidden = true; });
  page.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  // ---------- Laden ----------
  const token = () => store.get('data.token');
  async function fetchAgg(name) {
    const res = await fetch(API + name, {
      cache: 'no-cache',   // ETag: ongewijzigd = snel 304 van GitHub
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (res.status === 404) return null;
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  }
  let loadedAt = 0;
  async function load(force) {
    if (DASH.DEMO) { data = demoData(); state = 'ready'; spanCache.clear(); return render(); }
    if (!token()) { state = 'notoken'; return render(); }
    if (!force && data && Date.now() - loadedAt < 10 * 60000) return render();
    state = data ? 'ready' : 'loading';
    if (!data) render();
    const t0 = performance.now();
    try {
      const [index, ...groups] = await Promise.all([fetchAgg('index.json'), ...GROUPS.map((g) => fetchAgg(`${g}.json`).catch(() => null))]);
      if (!index) {
        // Bestaat de repo wel voor dit token? (GitHub geeft 404 bij geen toegang)
        const st = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null);
        const e = new Error(st && st.ok ? 'nog-geen-samenvattingen' : 'geen-toegang');
        e.status = 404;
        throw e;
      }
      data = { index, groups: Object.fromEntries(GROUPS.map((g, i) => [g, groups[i]])) };
      spanCache.clear();
      loadedAt = Date.now();
      state = 'ready';
      page.dataset.loadMs = Math.round(performance.now() - t0);
    } catch (e) {
      state = 'error';
      errMsg = e.message === 'nog-geen-samenvattingen'
        ? 'De samenvattingen bestaan nog niet. Ze worden elk uur gemaakt door de workflow "Verzamelen" in het archief (of draai lokaal: python scripts/aggregate.py).'
        : e.status === 401 ? 'Het token is ongeldig of verlopen. Maak een nieuw token (zie hieronder) en plak het opnieuw.'
          : e.status === 403 || e.message === 'geen-toegang' ? 'Het token mag het archief niet lezen.'
            : `Laden lukte niet (${e.message}). Probeer het later opnieuw.`;
    }
    render();
  }

  // ---------- Lege pagina's ----------
  function tokenForm() {
    const form = h('form', 'fd-key md-token');
    const input = h('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.placeholder = token() ? 'Token opgeslagen (leeg = wissen)' : 'github_pat_…';
    form.append(input, h('button', 'w-btn', 'Opslaan'));
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (window.DASH_DATA) window.DASH_DATA.setToken(v || null);
      else try { if (v) localStorage.setItem('data.token', JSON.stringify(v)); else localStorage.removeItem('data.token'); } catch {}
      data = null;
      load(true);
    };
    return form;
  }
  const HOWTO = [
    'Ga op github.com naar je profielfoto › Settings › Developer settings › Personal access tokens › Fine-grained tokens.',
    `Klik op je token voor de check-ins (of maak er een: Generate new token). Bij Repository access: alleen ${REPO}.`,
    'Bij Repository permissions › Contents: kies "Read and write" (lezen is nodig voor deze pagina, schrijven voor de check-ins). Opslaan.',
    'Was het een nieuw token? Plak hem hieronder. Een bestaand token aanpassen: niks plakken, alleen deze pagina herladen.',
  ];
  function renderEmpty(kind) {
    grid.hidden = true;
    const box = h('section', 'card tile md-empty');
    box.style.setProperty('--c', '#9aa0b4');
    box.append(h('p', 'eyebrow', kind === 'notoken' ? 'Nog niet gekoppeld' : kind === 'loading' ? 'Laden' : 'Er ging iets mis'));
    if (kind === 'loading') {
      box.append(note('Samenvattingen ophalen uit je privé archief…'));
    } else {
      box.append(note(kind === 'notoken'
        ? `Deze pagina laat grafieken zien van alles in je privé archief (${REPO}). De data staat niet op deze website: je browser haalt hem op met het token van de check-ins. In deze browser staat nog geen token.`
        : errMsg));
      if (kind === 'notoken' || /token/i.test(errMsg)) {
        const ol = h('ol', 'md-howto');
        for (const s of HOWTO) ol.append(h('li', null, s));
        box.append(ol, tokenForm());
      }
      const demo = h('a', 'text-btn', 'Bekijk een demo met verzonnen cijfers');
      demo.href = `${location.pathname}?demo#mydata`;
      const retry = h('button', 'w-btn ghost', 'Opnieuw proberen');
      retry.onclick = () => load(true);
      const row = h('div', 'md-empty-row');
      row.append(...(kind === 'error' ? [retry] : []), demo);
      box.append(row);
    }
    page.querySelector('.md-empty')?.remove();
    page.append(box);
  }

  // ---------- Alles tekenen ----------
  function render() {
    for (const b of periodEl.children) b.setAttribute('aria-pressed', b.dataset.mode === period.mode);
    custom.hidden = period.mode !== 'custom' || state !== 'ready';
    periodEl.hidden = state !== 'ready';
    page.querySelector('.md-empty')?.remove();
    if (state !== 'ready') {
      meta0.textContent = '';
      return renderEmpty(state === 'idle' ? 'loading' : state);
    }
    grid.hidden = false;
    const r = range();
    if (period.mode === 'custom') { fromIn.value = r.from; toIn.value = r.to; }
    const src = data.index.sources || {};
    const n = Object.values(src).filter((s) => s.rows > 0).length;
    const up = data.index.updated ? new Date(data.index.updated) : null;
    const upText = up ? (up.toDateString() === new Date().toDateString() ? DASH.fmtTime(up) : `${up.getDate()} ${MONTHS[up.getMonth()]} ${DASH.fmtTime(up)}`) : '?';
    meta0.textContent = `${fmtDate(r.from)} – ${fmtDate(r.to)} · bijgewerkt ${upText} · ${n} bronnen${DASH.DEMO ? ' · DEMO: verzonnen cijfers' : ''}`;
    page.classList.toggle('md-demo', DASH.DEMO);
    charts = [];
    for (const [f, t] of [[renderCoverage, T.cov], [renderKpis, null], [renderWatch, T.watch], [renderPlaces, T.places], [renderCheck, T.check],
      [renderWork, T.work], [renderMoney, T.money], [renderBody, T.body], [renderPc, T.pc], [renderOverlap, T.overlap]]) {
      try { f(r); } catch (e) { console.error(e); if (t) t.body.replaceChildren(note(`Dit vak kon niet tekenen: ${e.message}`)); }
    }
    // Pas na het invoegen kennen de vakjes hun breedte
    requestAnimationFrame(() => charts.forEach((f) => { try { f(); } catch (e) { console.error(e); } }));
  }
  let lastW = 0, rt = 0;
  new ResizeObserver(() => {
    if (page.hidden || state !== 'ready' || Math.abs(grid.clientWidth - lastW) < 4) return;
    lastW = grid.clientWidth;
    clearTimeout(rt);
    rt = setTimeout(() => { charts.forEach((f) => f()); if (map) map.invalidateSize(); }, 150);
  }).observe(grid);

  // ---------- Demo: duidelijk verzonnen cijfers ----------
  function demoData() {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const t = todayIso(), from = '2023-01-01';
    const days = [];
    for (let d = from; d <= t; d = addDays(d, 1)) days.push(d);
    const dly = (f) => Object.fromEntries(days.map((d, i) => [d, f(d, i)]).filter(([, v]) => v != null));
    const months = monthsOf({ from, to: t });
    const wd = () => Array.from({ length: 168 }, (_, i) => { const hr = i % 24; return Math.round(rnd() * (hr >= 8 && hr <= 23 ? 20 : 3)); });
    const top = (pre, n = 12) => Array.from({ length: n }, (_, i) => [`${pre} ${i + 1}`, Math.round((n - i) * 10 * (0.5 + rnd()))]);
    const cnt = (k) => ({ label: k, unit: 'keer', kind: 'count' });
    const g = {
      youtube: { metrics: { videos: { label: "YouTube-video's", unit: "video's", kind: 'count' } }, daily: { videos: dly(() => Math.round(rnd() * 25)) }, monthly: Object.fromEntries(months.map((m) => [m, { wdh: wd(), channels: top('Voorbeeldkanaal') }])) },
      spotify: { metrics: { minutes: { label: 'Spotify-luistertijd', unit: 'min', kind: 'count' } }, daily: { minutes: dly(() => Math.round(rnd() * 180)) }, monthly: Object.fromEntries(months.map((m) => [m, { wdh: wd(), artists: top('Artiest'), tracks: top('Nummer') }])) },
      letterboxd: { metrics: { films: { label: 'Films gekeken', unit: 'films', kind: 'count' } }, daily: { films: dly(() => (rnd() < 0.25 ? 1 : 0)) }, monthly: Object.fromEntries(months.map((m) => [m, { ratings: Array.from({ length: 11 }, (_, i) => Math.round(rnd() * (i > 4 ? 4 : 1))) }])) },
      places: {
        grid_m: 250,
        metrics: { home_min: { label: 'Tijd thuis', unit: 'min', kind: 'measure' }, work_min: { label: 'Tijd op werk', unit: 'min', kind: 'measure' }, away_min: { label: 'Tijd elders', unit: 'min', kind: 'measure' }, travel_min: { label: 'Onderweg', unit: 'min', kind: 'measure' }, visits: { label: 'Plekken bezocht', unit: 'bezoeken', kind: 'count' } },
        daily: { home_min: dly(() => 800 + Math.round(rnd() * 400)), work_min: dly(() => Math.round(rnd() * 300)), away_min: dly(() => Math.round(rnd() * 200)), travel_min: dly(() => Math.round(rnd() * 90)), visits: dly(() => Math.round(rnd() * 6)) },
        monthly: Object.fromEntries(months.map((m) => [m, {
          grid: Array.from({ length: 30 }, (_, i) => [+(52.37 + (rnd() - 0.5) * 0.06).toFixed(4), +(4.9 + (rnd() - 0.5) * 0.1).toFixed(4), Math.round(rnd() * (i ? 600 : 20000))]),
          places: [[1, 20000, 30, 'HOME', 52.37, 4.9], [2, 3000, 12, 'WORK', 52.36, 4.92], ...Array.from({ length: 6 }, (_, i) => [i + 3, Math.round(rnd() * 900), 1 + Math.round(rnd() * 5), 'UNKNOWN', +(52.37 + (rnd() - 0.5) * 0.05).toFixed(4), +(4.9 + (rnd() - 0.5) * 0.08).toFixed(4)])],
        }])),
      },
      work: { metrics: { ah_hours: { label: 'AH-uren', unit: 'uur', kind: 'count' }, colleges: cnt('Colleges'), events: cnt('Afspraken') }, daily: { ah_hours: dly(() => (rnd() < 0.35 ? 4 + Math.round(rnd() * 4) : 0)), colleges: dly((d) => ((new Date(D0(d)).getUTCDay() % 6) && rnd() < 0.4 ? 1 : 0)), events: dly(() => Math.round(rnd() * 4)) }, deadlines: [[addDays(t, -3), '23:59', 'Voorbeeldopdracht 1'], [addDays(t, 4), '17:00', 'Voorbeeldopdracht 2']] },
      money: { internal: ['Eigen rekening'], monthly: Object.fromEntries(months.map((m) => { const c = { Salaris: [1000 + Math.round(rnd() * 300), 0], Boodschappen: [0, 150 + Math.round(rnd() * 80)], 'Eten en drinken': [0, Math.round(rnd() * 120)], Online: [0, Math.round(rnd() * 200)], Vervoer: [0, Math.round(rnd() * 60)] }; return [m, { cats: c, in: c.Salaris[0], out: Object.values(c).reduce((a, v) => a + v[1], 0) }]; })) },
      body: { metrics: { steps: { label: 'Stappen', unit: 'stappen', kind: 'measure' }, sleep_h: { label: 'Slaap', unit: 'uur', kind: 'measure' }, resting_hr: { label: 'Rusthartslag', unit: 'bpm', kind: 'measure' } }, daily: { steps: dly(() => 3000 + Math.round(rnd() * 9000)), sleep_h: dly(() => +(6 + rnd() * 3).toFixed(1)), resting_hr: dly(() => 55 + Math.round(rnd() * 10)) } },
      computer: { metrics: { pc_active_min: { label: 'Actief achter de pc', unit: 'min', kind: 'count' }, notifications: cnt('Meldingen') }, daily: { pc_active_min: dly(() => Math.round(rnd() * 400)), notifications: dly(() => Math.round(rnd() * 60)) }, monthly: Object.fromEntries(months.map((m) => [m, { wdh: wd(), apps: top('App'), sites: top('voorbeeld.nl'), notif_apps: top('Telefoon-app', 5) }])) },
      checkins: { metrics: { mood: { label: 'Stemming', unit: '1-5', kind: 'measure' }, energy: { label: 'Energie', unit: '1-5', kind: 'measure' }, focus: { label: 'Focus', unit: '1-5', kind: 'measure' }, stress: { label: 'Stress', unit: '1-5', kind: 'measure' }, checkins: cnt('Check-ins ingevuld'), prompts: cnt('Check-in-meldingen'), answered: cnt('Check-ins na melding') },
        daily: Object.assign(...['mood', 'energy', 'focus', 'stress'].map((k) => ({ [k]: dly(() => +(1 + rnd() * 4).toFixed(1)) })), { checkins: dly(() => 1 + Math.round(rnd() * 2)), prompts: dly(() => 3), answered: dly(() => Math.round(rnd() * 3)) }) },
      weather: { metrics: { tmax: { label: 'Max. temperatuur', unit: '°C', kind: 'measure' } }, daily: { tmax: dly((d) => +(12 + 9 * Math.sin((D0(d) / 864e5 - 100) / 365 * 2 * Math.PI) + rnd() * 4).toFixed(1)) } },
    };
    const sources = {};
    const cover = (s, first) => { const ms = monthsOf({ from: `${first}-01`, to: t }); sources[s] = { months: Object.fromEntries(ms.map((m) => [m, 100 + Math.round(rnd() * 500)])), rows: ms.length * 300, first: ms[0], last: ms.at(-1) }; };
    cover('youtube-history', '2023-01'); cover('spotify', '2024-03'); cover('letterboxd-export', '2023-01'); cover('calendar', '2023-01');
    cover('maps-timeline', '2023-06'); cover('bank', '2024-01'); cover('fit-daily', '2023-01'); cover('self-report', '2025-01'); cover('pc-window', '2025-06'); cover('notifications', '2025-06');
    return { index: { updated: new Date().toISOString(), sources }, groups: g };
  }

  // ---------- Openen en sluiten ----------
  let pushed = false;
  function setOpen(open, fromHash) {
    page.hidden = !open;
    tip.hidden = true;
    document.body.classList.toggle('mydata-open', open);
    btn.setAttribute('aria-pressed', open);
    btn.title = open ? 'Terug naar het dashboard (Esc)' : 'Mijn data';
    if (open) {
      window.dispatchEvent(new CustomEvent('dash:page', { detail: 'mydata' }));
      if (!fromHash && location.hash !== '#mydata') {
        if (location.hash === '#feeds') history.replaceState(null, '', '#mydata');
        else { history.pushState(null, '', '#mydata'); pushed = true; }
      }
      window.scrollTo(0, 0);
      place();
      load(false);
    } else if (!fromHash && location.hash === '#mydata') {
      if (pushed) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
      pushed = false;
    }
  }
  btn.onclick = () => setOpen(page.hidden);
  // Feeds en Mijn data liggen op dezelfde plek: de ene opent, de andere gaat dicht
  window.addEventListener('dash:page', (e) => { if (e.detail !== 'mydata' && !page.hidden) setOpen(false, true); });
  window.addEventListener('popstate', () => setOpen(location.hash === '#mydata', true));
  window.addEventListener('dash:data-token', () => { data = null; if (!page.hidden) load(true); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !page.hidden && !document.querySelector('dialog[open]') && !['INPUT', 'SELECT'].includes(document.activeElement.tagName)) setOpen(false);
  });
  if (location.hash === '#mydata') setOpen(true, true);
})();
