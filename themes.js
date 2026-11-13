'use strict';

// Themes (since 0.44.0; builds on the holiday version 0.42.0). Loaded directly, also works with ?mini=1.
// Each theme is its own file in themes/ (explained at the top of themes/default.js) and registers with DASH_THEMES.add({...}).
// This file picks which theme applies now and draws it:
//   - top bar: color (html[data-theme] + --th1/--th2), greeting .tb-greet, icon in the day line, decoration above it (.th-top)
//   - background (.th-bg) and one shared canvas for falling particles (.th-parts) BEHIND the tiles, so never over text
//   - decoration on the tiles (.th-deco): only in a corner or edge without text, buttons or images (free())
//   - one-off effects (confetti, fireworks) once a day per browser (theme.fx), on a canvas over the page
// Automatic: a holiday beats the season, the real weather (Open-Meteo, 20 min cache) goes on top.
// Phone (≤ 700px): only top bar color, greeting and background. Minimal mode: everything except tile decoration (there are no tiles).
// Reduced motion: only still decoration (no particles, no effects, nothing blinks). Exam week: everything still too.
// Settings (Theme tab in settings.js) are in localStorage theme.settings; "View as date" in sessionStorage.
//
// Testing: ?date=YYYY-MM-DD pretends it's that day, ?theme=<name> or ?<name> forces a theme (effect then always),
// ?weather=snow|rain|sun|cold pretends it's that weather.
window.DASH_THEMES = (() => {
  const { h, store } = DASH;
  const root = document.documentElement;
  const bar = document.getElementById('topbar');
  const dayEl = bar && bar.querySelector('.tb-day');
  const params = new URLSearchParams(location.search);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const md = (d) => isoDay(d).slice(5);
  const noon = (iso) => new Date(`${iso}T12:00:00`);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phoneMq = matchMedia('(max-width: 700px)');
  const FILES = ['default', 'autumn', 'winter', 'spring', 'summer', 'halloween', 'sinterklaas', 'christmas', 'newyear',
    'valentine', 'easter', 'kingsday', 'liberationday', 'birthday', 'f1', 'exams'];

  // ---------- Own birthday from the private archive (config.json → personal.birthday, since 0.49.0) ----------
  // With the archive token (also after logging in with the bundle, vault.js) it's right on every computer. datarepo.js only
  // loads with the full dashboard: hence on dash:data-token and a few seconds after load.
  async function personal() {
    const D = window.DASH_DATA;
    if (DASH.DEMO || !D || !D.token()) return;
    try {
      const f = await D.read('config.json');
      const cfg = f && JSON.parse(f.text);
      const b = cfg && ((cfg.personal || {}).birthday || (cfg.persoonlijk || {}).verjaardag);   // old names as fallback
      if (b && /^\d{4}-\d{2}-\d{2}$/.test(b) && b !== store.get('theme.birthday')) { store.set('theme.birthday', b); refresh(); }
    } catch (e) { console.warn('[themes] birthday from archive', e); }
  }
  window.addEventListener('dash:data-token', personal);
  window.addEventListener('load', () => setTimeout(personal, 4000));

  // ---------- Set your own birthday once via the link (it's not in the code: the repo is public) ----------
  const setB = params.get('mybirthday');
  if (setB && /^\d{4}-\d{2}-\d{2}$/.test(setB)) {
    store.set('theme.birthday', setB);
    params.delete('mybirthday');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    document.addEventListener('DOMContentLoaded', () => {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = 'Birthday saved in this browser 🎂';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 4000);
    });
  }

  // ---------- Helpers for the theme files ----------
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    const month = Math.floor((hh + l - 7 * m + 114) / 31);
    return new Date(y, month - 1, ((hh + l - 7 * m + 114) % 31) + 1, 12);
  }
  // 'MM-DD' between from and to (also across New Year)
  const between = (d, from, to) => { const x = md(d); return from <= to ? x >= from && x <= to : x >= from || x <= to; };
  const daysUntil = (d, mmdd) => {
    let t = noon(`${d.getFullYear()}-${mmdd}`);
    if (t < noon(isoDay(d))) t = noon(`${d.getFullYear() + 1}-${mmdd}`);
    return Math.round((t - noon(isoDay(d))) / 86400000);
  };
  const inDays = (n) => (n === 1 ? 'tomorrow' : `in ${n} days`);
  // Agenda: live from calendar.js, otherwise the saved one (minimal mode)
  const calEvents = () => (window.DASH_CALENDAR && window.DASH_CALENDAR.connected ? window.DASH_CALENDAR.events : (store.get('google.events') || {}).events) || [];
  // Seeded randomness: the same day gives the same tiles and corners
  function rng(str) {
    let a = 0;
    for (const ch of str) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  // Snow cap on top of a tile (Christmas, winter in December)
  const snowCap = '<svg viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M0 0H200V6Q195 12 188 8T172 9T156 7T140 10T124 8T108 10T92 7T76 9T60 8T44 10T28 7T12 9T0 7Z" fill="#f2f6ff" fill-opacity=".92"/></svg>';

  // ---------- Registration ----------
  const themes = [], byId = {}, aliases = {}, kinds = {};
  let ready = false;
  function add(t) {
    t.prio = t.prio || 0;
    themes.push(t);
    byId[t.id] = t;
    for (const [name, mmdd] of Object.entries(t.aliases || {})) aliases[name] = { id: t.id, md: mmdd };
    if (t.css) document.head.append(Object.assign(document.createElement('style'), { textContent: t.css }));
    if (ready) refresh();
  }
  const kind = (name, def) => { kinds[name] = def; };

  // ---------- Settings ----------
  // style: 'housestyle' (default since 1.2.0, housestyle.css + housestyle.js), 'modern' or 'y2k'; mood: 'auto' | 'digital' | 'poster' | 'titlecard'
  const DEFAULTS = { choice: 'auto', all: true, particles: true, deco: true, topbar: true, bg: true, weather: true, fx: true, amount: 'normal', serif: true, style: 'housestyle', mood: 'auto' };
  const AMOUNT = { calm: { parts: 10, deco: 0.5 }, normal: { parts: 30, deco: 1 }, party: { parts: 60, deco: 1.6 } };
  // Settings saved before 1.2.0 always have style: 'modern' (the old default) without styleV: those go to the house style.
  // Values saved before 1.7.0 were Dutch; the migration at the top of index.html converts them, this does it again to be safe.
  const OLD = { huisstijl: 'housestyle', titel: 'titlecard', rustig: 'calm', normaal: 'normal', feestje: 'party' };
  const settings = () => {
    const saved = store.get('theme.settings') || {}, s = { ...DEFAULTS, ...saved };
    if (saved.stand && !saved.mood) s.mood = saved.stand;
    for (const k of ['style', 'mood', 'amount']) if (OLD[s[k]]) s[k] = OLD[s[k]];
    if (window.DASH_OLD_THEME_IDS && DASH_OLD_THEME_IDS[s.choice]) s.choice = DASH_OLD_THEME_IDS[s.choice];
    delete s.stand;
    if (saved.styleV !== 2) s.style = 'housestyle';
    return s;
  };
  function set(key, value) {
    const s = settings();
    s[key] = value;
    s.styleV = 2;
    store.set('theme.settings', s);
    serif();
    style();
    refresh();
  }
  // Serif digits (big numbers in a serif face, html.serif-nums): separate from "All effects", applied right at load
  const serif = () => root.classList.toggle('serif-nums', settings().serif !== false);
  serif();
  // Style (html.y2k, styles in y2k.css): separate from the theme, so seasons and holidays keep working. ?style=y2k|modern to test
  const urlStyle = /^(y2k|modern|housestyle)$/.test(params.get('style') || '') ? params.get('style') : null;
  const style = () => {
    const st = urlStyle || settings().style;
    root.classList.toggle('y2k', st === 'y2k');
    root.classList.toggle('nh-want', st === 'housestyle');   // housestyle.js sets html.nh (not on the phone)
    window.DASH_HOUSESTYLE?.refresh();
    window.dispatchEvent(new Event('resize'));   // window borders and title bars change sizes: let the layouts measure again
  };
  style();
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} },
  };
  const urlDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : null;
  const viewIso = () => urlDay || session.get('theme.viewDate');
  function viewDate(iso) { session.set('theme.viewDate', iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null); refresh(); }
  const today = () => (viewIso() ? noon(viewIso()) : new Date());

  // ---------- Which theme ----------
  function forced() {
    const name = params.get('theme') || [...params.keys()].find((k) => byId[k] || aliases[k]);
    if (!name) return null;
    if (aliases[name]) return aliases[name];
    return byId[name] ? { id: name } : null;
  }
  // Data the when() rules may use (fetched once per pick)
  function context() {
    const f1 = store.get('f1.schedule.v2');
    return { events: calEvents(), f1: (f1 && f1.sessions) || [], birthday: store.get('theme.birthday'), wx: wxState() };
  }
  function pick(day, data) {
    const hits = themes.filter((t) => { try { return t.when && t.when(day, data); } catch (e) { console.warn('[theme]', t.id, e); return false; } });
    const season = hits.filter((t) => t.tier === 'season').sort((a, b) => b.prio - a.prio)[0];
    return [season, ...hits.filter((t) => t.tier !== 'season').sort((a, b) => a.prio - b.prio)].filter(Boolean);
  }
  function current(data) {
    const s = settings(), f = forced(), day = today();
    if (f) return { layers: [byId[f.id]], fixed: true, test: true, day: f.md ? noon(`${day.getFullYear()}-${f.md}`) : day };
    if (s.choice !== 'auto' && byId[s.choice]) return { layers: [byId[s.choice]], fixed: true, day };
    return { layers: pick(day, data), fixed: false, day };
  }
  const names = (l) => l.filter((t) => t.id !== 'default').map((t) => t.name).join(' + ') || 'Default';
  // "now: Autumn + Halloween · from Sun: Autumn"
  function describe() {
    const data = context(), day = today(), now = pick(day, data);
    const key = (l) => l.map((t) => t.id).join();
    let text = `now: ${names(now)}`;
    for (let i = 1; i <= 120; i++) {
      const d = addDays(day, i), l = pick(d, data);
      if (key(l) === key(now)) continue;
      const when = i < 7 ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      text += ` · from ${when}: ${names(l)}`;
      break;
    }
    const w = settings().weather && !viewIso() ? wxState() : null;
    if (w && w.kind) text += ` · real weather: ${w.kind}`;
    return text;
  }

  // ---------- Real weather ----------
  const WX_TEST = params.get('weather');
  function wxState() {
    if (WX_TEST) return { kind: WX_TEST === 'cold' ? null : WX_TEST, temp: WX_TEST === 'cold' || WX_TEST === 'snow' ? -1 : 14 };
    const c = store.get('theme.wx');
    return c && c.v === 2 && Date.now() - c.at < 3 * 3600000 ? c : null;   // v2 = English kinds (1.7.0)
  }
  let wxBusy = false;
  async function loadWx() {
    const c = store.get('theme.wx');
    if (WX_TEST || wxBusy || (c && c.v === 2 && Date.now() - c.at < 20 * 60000)) return;
    wxBusy = true;
    try {
      const d = await DASH.getJSON('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
        latitude: DASH.HOME.lat, longitude: DASH.HOME.lon, current: 'temperature_2m,weather_code,is_day', timezone: 'Europe/Amsterdam' }));
      const code = d.current.weather_code;
      const kindOf = [71, 73, 75, 77, 85, 86].includes(code) ? 'snow' : (code >= 51 && code <= 67) || (code >= 80 && code <= 99) ? 'rain'
        : code <= 1 && d.current.is_day ? 'sun' : null;
      store.set('theme.wx', { v: 2, at: Date.now(), kind: kindOf, temp: d.current.temperature_2m });
      refresh();
    } catch (e) {
      console.warn('[theme] weather failed:', e);
    } finally {
      wxBusy = false;
    }
  }

  // ---------- Top bar: greeting, color, day-line icon, decoration ----------
  let greet = null, viewChip = null, topEl = null, dropsEl = null;
  function topbarParts() {
    if (greet || !dayEl) return;
    greet = h('span', 'tb-greet');
    greet.hidden = true;
    dayEl.insertBefore(greet, dayEl.querySelector('.tb-dayline'));
    viewChip = h('button', 'th-view');
    viewChip.type = 'button';
    viewChip.hidden = true;
    viewChip.title = 'Back to today';
    viewChip.onclick = () => viewDate(null);
    dayEl.insertBefore(viewChip, greet);
  }
  // Lights, flags or a garland just above the top bar (in the space above it, never over text)
  // f < 1: drawn smaller when there's little room above the top bar (compact landscape layout)
  const GARLAND_BOTTOM = { lights: 24, flags: 26, garland: 22, stars: 17 };
  function garland(type, colors, width, f = 1) {
    const W = Math.max(200, Math.round(width / f)), H = 30, span = W > 900 ? 240 : 160;
    const n = Math.max(2, Math.round(W / span)), seg = W / n;
    let path = 'M0 4', items = '';
    for (let i = 0; i < n; i++) path += ` Q${(i + 0.5) * seg} 16 ${(i + 1) * seg} 4`;
    const yAt = (x) => { const t = (x % seg) / seg; return 4 + 2 * t * (1 - t) * 12 * 1; };
    const step = type === 'lights' ? 46 : type === 'flags' ? 34 : 26;
    let k = 0;
    for (let x = step / 2; x < W - 6; x += step, k++) {
      const y = yAt(x), c = colors[k % colors.length];
      if (type === 'lights') items += `<g class="th-bulb" style="animation-delay:${((k * 0.37) % 2.4).toFixed(2)}s"><rect x="${x - 2}" y="${y - 1}" width="4" height="4" rx="1" fill="#555"/><ellipse cx="${x}" cy="${y + 8}" rx="4" ry="6" fill="${c}"/></g>`;
      else if (type === 'flags') items += `<path d="M${x - 9} ${y} L${x + 9} ${y} L${x} ${y + 15} Z" fill="${c}"/>`;
      else if (type === 'garland') items += k % 2 ? `<circle cx="${x}" cy="${y + 5}" r="3.2" fill="${c}"/>` : `<path d="M${x - 6} ${y} L${x + 6} ${y} L${x} ${y + 11} Z" fill="${c}"/>`;
      else if (type === 'stars') items += k % 3 ? `<circle cx="${x}" cy="${y + 4}" r="1.6" fill="${c}"/>` : `<path d="M${x} ${y - 1}l1.6 3.6 3.9.4-2.9 2.6.8 3.8-3.4-2-3.4 2 .8-3.8-2.9-2.6 3.9-.4z" fill="${c}"/>`;
    }
    const cord = type === 'stars' ? '' : `<path d="${path}" fill="none" stroke="${type === 'lights' ? '#3a3a3a' : 'rgba(255,255,255,.35)'}" stroke-width="1.5"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="${Math.round(W * f)}" height="${Math.round(H * f)}" aria-hidden="true">${cord}${items}</svg>`;
  }
  function drops(width) {
    const r = rng('rain'), W = Math.round(width);
    let s = '';
    for (let i = 0; i < Math.round(W / 70); i++) {
      const x = 20 + r() * (W - 40), sz = 3 + r() * 2.5;
      s += `<path d="M${x} ${10 - sz * 1.6} Q${x + sz} ${10 - sz * 0.2} ${x} ${10 + sz * 0.6} Q${x - sz} ${10 - sz * 0.2} ${x} ${10 - sz * 1.6}Z" fill="rgba(170,210,255,.75)"/>`;
    }
    return `<svg viewBox="0 0 ${W} 16" width="${W}" height="16" aria-hidden="true">${s}</svg>`;
  }
  let topKey = '';
  function topDeco(spec, rain) {
    const br = bar ? bar.getBoundingClientRect() : { width: 0 }, width = br.width - 48;
    // Room: from the top of the page to the first text/button in the top bar
    const parts = bar ? [...bar.querySelectorAll('.tb-clock, .tb-links, .tb-research, .tb-search, .tb-actions')].filter((e) => e.offsetParent) : [];
    const contentTop = parts.length ? Math.min(...parts.map((e) => e.getBoundingClientRect().top)) - br.top : 14;
    const above = br.top + scrollY;
    const need = spec ? GARLAND_BOTTOM[spec.type] || 24 : 0;
    const f = spec ? Math.max(0.4, Math.min(1, (above + contentTop - 3) / need)) : 1;
    const key = `${spec ? `${spec.type}|${spec.colors}` : ''}|${Math.round(width / 40)}|${rain}|${f.toFixed(2)}|${Math.round(contentTop)}`;
    if (key === topKey) return;
    topKey = key;
    if (topEl) { topEl.remove(); topEl = null; }
    if (dropsEl) { dropsEl.remove(); dropsEl = null; }
    if (spec && width > 0) {
      topEl = h('div', `th-top th-top-${spec.type}`);
      topEl.setAttribute('aria-hidden', 'true');
      topEl.style.top = `${Math.round(contentTop - 3 - need * f)}px`;
      topEl.innerHTML = garland(spec.type, spec.colors, width, f);
      bar.append(topEl);
    }
    if (rain && width > 0) {
      dropsEl = h('div', 'th-drops');
      dropsEl.setAttribute('aria-hidden', 'true');
      dropsEl.style.top = `${Math.round(Math.max(-above, Math.min(-10, contentTop - 17)))}px`;
      dropsEl.innerHTML = drops(width);
      bar.append(dropsEl);
    }
  }

  // ---------- Background ----------
  let bgEl = null;
  function background(css) {
    if (!css) { if (bgEl) bgEl.hidden = true; return; }
    if (!bgEl) {
      bgEl = h('div', 'th-bg');
      bgEl.setAttribute('aria-hidden', 'true');
      document.body.prepend(bgEl);
    }
    bgEl.hidden = false;
    if (bgEl.dataset.css !== css) { bgEl.dataset.css = css; bgEl.style.background = css; }
  }

  // ---------- Falling particles: one canvas behind the tiles ----------
  const P = { cv: null, ctx: null, parts: [], mix: [], target: 0, raf: 0, last: 0, W: 0, H: 0, s: 1, key: '' };
  function sizeCanvas() {
    if (!P.cv) return;
    P.s = Math.min(2, devicePixelRatio || 1);
    P.W = P.cv.width = Math.round(innerWidth * P.s);
    P.H = P.cv.height = Math.round(innerHeight * P.s);
  }
  function spawn(first) {
    let total = P.mix.reduce((a, m) => a + m.weight, 0), r = Math.random() * total, m = P.mix[0];
    for (const x of P.mix) { r -= x.weight; if (r <= 0) { m = x; break; } }
    const k = kinds[m.kind];
    if (!k) return null;
    const p = { k, x: Math.random() * P.W, y: 0, vx: 0, vy: 1, r: Math.random() * 6.28, vr: 0, size: 6, a: 1, ph: Math.random() * 6.28, sw: 0.02, amp: 0.4 };
    k.init(p, P.s);
    p.y = first ? -Math.random() * P.H : -p.size * P.s * 3;
    return p;
  }
  function frame(now) {
    P.raf = 0;
    if (document.hidden || !P.target) return;
    const f = Math.min(3, (now - (P.last || now)) / 16.7);
    P.last = now;
    const { ctx } = P;
    ctx.clearRect(0, 0, P.W, P.H);
    for (let i = P.parts.length - 1; i >= 0; i--) {
      const p = P.parts[i];
      p.ph += p.sw * f;
      p.x += (p.vx + Math.sin(p.ph) * p.amp) * P.s * f;
      p.y += p.vy * P.s * f;
      p.r += p.vr * f;
      if (p.y > P.H + 40 * P.s || p.x < -60 * P.s || p.x > P.W + 60 * P.s) {
        if (P.parts.length > P.target) { P.parts.splice(i, 1); continue; }
        const n = spawn(false);
        if (n) P.parts[i] = n; else P.parts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      p.k.draw(ctx, p, P.s);
      ctx.restore();
    }
    while (P.parts.length < P.target) { const n = spawn(true); if (!n) break; P.parts.push(n); }
    P.raf = requestAnimationFrame(frame);
  }
  function startParts() { if (!P.raf && P.target && !document.hidden) { P.last = 0; P.raf = requestAnimationFrame(frame); } }
  function particles(mix, target) {
    const key = `${mix.map((m) => `${m.kind}:${m.weight}`).join()}|${target}`;
    if (key === P.key) return;
    P.key = key;
    P.mix = mix.filter((m) => kinds[m.kind]);
    P.target = P.mix.length ? target : 0;
    root.classList.toggle('th-falling', P.target > 0);   // minimal mode: top bar more transparent, so you see them
    if (!P.target) {
      if (P.raf) cancelAnimationFrame(P.raf);
      P.raf = 0;
      P.parts = [];
      if (P.cv) { P.ctx.clearRect(0, 0, P.W, P.H); P.cv.hidden = true; }
      return;
    }
    if (!P.cv) {
      P.cv = h('canvas', 'th-parts');
      P.cv.setAttribute('aria-hidden', 'true');
      document.body.prepend(P.cv);
      if (bgEl) document.body.prepend(bgEl);   // background below the particles
      P.ctx = P.cv.getContext('2d');
      sizeCanvas();
    }
    P.cv.hidden = false;
    P.parts = P.parts.filter((p) => P.mix.some((m) => kinds[m.kind] === p.k));
    startParts();
  }
  document.addEventListener('visibilitychange', startParts);   // hidden tab = still
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { sizeCanvas(); topKey = ''; refresh(); placeDeco(); }, 300);
  });

  // Standard particle kinds (a theme can add its own with DASH_THEMES.kind)
  const pick1 = (list) => list[Math.floor(Math.random() * list.length)];
  kind('snow', {
    init(p) { p.size = 1.4 + Math.random() * 2.4; p.vy = 0.45 + Math.random() * 0.7; p.vx = (Math.random() - 0.5) * 0.3; p.amp = 0.35; p.a = 0.55 + Math.random() * 0.4; },
    draw(ctx, p, s) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, p.size * s, 0, 6.28); ctx.fill(); },
  });
  kind('leaf', {
    init(p) { p.size = 7 + Math.random() * 6; p.vy = 0.5 + Math.random() * 0.5; p.vx = (Math.random() - 0.3) * 0.4; p.vr = (Math.random() - 0.5) * 0.04; p.amp = 0.9; p.sw = 0.025; p.a = 0.85;
      p.c = pick1(['#d9772b', '#c4501f', '#e3a33a', '#a8461c', '#c98a2c']); },
    draw(ctx, p, s) {
      const z = p.size * s;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.moveTo(0, -z);
      ctx.quadraticCurveTo(z * 0.9, -z * 0.3, 0, z);
      ctx.quadraticCurveTo(-z * 0.9, -z * 0.3, 0, -z);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,30,10,.45)';
      ctx.lineWidth = s;
      ctx.beginPath(); ctx.moveTo(0, -z * 0.8); ctx.lineTo(0, z * 1.2); ctx.stroke();
    },
  });
  kind('blossom', {
    init(p) { p.size = 3.5 + Math.random() * 3; p.vy = 0.35 + Math.random() * 0.45; p.vx = 0.15 + Math.random() * 0.3; p.vr = (Math.random() - 0.5) * 0.05; p.amp = 0.7; p.a = 0.85;
      p.c = pick1(['#ffc2d6', '#ffd9e6', '#fff0f5', '#f7a8c4']); },
    draw(ctx, p, s) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.size * s, p.size * 0.6 * s, 0, 0, 6.28); ctx.fill(); },
  });
  kind('heart', {
    init(p) { p.size = 5 + Math.random() * 5; p.vy = 0.4 + Math.random() * 0.4; p.vr = (Math.random() - 0.5) * 0.02; p.amp = 0.5; p.a = 0.8; p.c = pick1(['#ff5f8f', '#ff8fb1', '#e6395f']); },
    draw(ctx, p, s) {
      const z = p.size * s;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.moveTo(0, z * 0.9);
      ctx.bezierCurveTo(-z * 1.4, -z * 0.1, -z * 0.6, -z * 1.1, 0, -z * 0.35);
      ctx.bezierCurveTo(z * 0.6, -z * 1.1, z * 1.4, -z * 0.1, 0, z * 0.9);
      ctx.fill();
    },
  });
  kind('confetti', {
    init(p) { p.size = 4 + Math.random() * 4; p.vy = 0.8 + Math.random() * 0.8; p.vr = (Math.random() - 0.5) * 0.15; p.amp = 0.6; p.c = pick1(['#b48cff', '#ff7aa8', '#ffcf5c', '#7ad7ff', '#9cff8a']); },
    draw(ctx, p, s) { ctx.fillStyle = p.c; ctx.fillRect(-p.size * s / 2, -p.size * s / 4, p.size * s, p.size * s / 2); },
  });
  kind('rain', {
    init(p) { p.size = 10 + Math.random() * 10; p.vy = 7 + Math.random() * 4; p.vx = -0.8; p.amp = 0; p.r = 0.08; p.a = 0.28 + Math.random() * 0.2; },
    draw(ctx, p, s) { ctx.strokeStyle = '#a9c8ff'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, p.size * s); ctx.stroke(); },
  });

  // ---------- House style (since 1.4.0): particles, mark and garland ----------
  // Particles as a line drawing or pixel in --holiday and --ink (colors read from the styles once per refresh)
  const NHC = { holiday: '#d7261e', ink: '#16130f' };
  function nhColors() {
    const cs = getComputedStyle(root);
    NHC.holiday = cs.getPropertyValue('--holiday').trim() || NHC.holiday;
    NHC.ink = cs.getPropertyValue('--ink').trim() || NHC.ink;
  }
  const NH_KINDS = ['snow', 'leaf', 'blossom', 'heart', 'confetti', 'rain'];
  const nhInit = (p, size, vy) => { p.size = size + Math.random() * size * 0.6; p.vy = vy + Math.random() * vy * 0.6; p.vx = (Math.random() - 0.5) * 0.3; p.amp = 0.4; p.a = 0.9; p.c = Math.random() < 0.6 ? 'holiday' : 'ink'; };
  kind('nh-snow', {   // pixel flake: a plus of four blocks
    init(p) { nhInit(p, 2, 0.45); p.vr = 0; p.r = 0; p.c = 'ink'; },
    draw(ctx, p, s) { const z = Math.round(p.size * s); ctx.fillStyle = NHC.ink; ctx.fillRect(-z / 2, -z * 1.5, z, z * 3); ctx.fillRect(-z * 1.5, -z / 2, z * 3, z); },
  });
  kind('nh-leaf', {
    init(p) { nhInit(p, 7, 0.5); p.vr = (Math.random() - 0.5) * 0.04; p.amp = 0.9; p.sw = 0.025; },
    draw(ctx, p, s) {
      const z = p.size * s;
      ctx.strokeStyle = NHC[p.c]; ctx.lineWidth = 1.4 * s;
      ctx.beginPath(); ctx.moveTo(0, -z); ctx.quadraticCurveTo(z * 0.9, -z * 0.3, 0, z); ctx.quadraticCurveTo(-z * 0.9, -z * 0.3, 0, -z); ctx.moveTo(0, -z * 0.6); ctx.lineTo(0, z * 1.2); ctx.stroke();
    },
  });
  kind('nh-blossom', {
    init(p) { nhInit(p, 4, 0.35); p.vx = 0.2; p.amp = 0.7; },
    draw(ctx, p, s) { ctx.strokeStyle = NHC[p.c]; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.arc(0, 0, p.size * s, 0, 6.28); ctx.stroke(); },
  });
  kind('nh-heart', {
    init(p) { nhInit(p, 6, 0.4); p.vr = (Math.random() - 0.5) * 0.02; },
    draw(ctx, p, s) {
      const z = p.size * s;
      ctx.strokeStyle = NHC[p.c]; ctx.lineWidth = 1.4 * s;
      ctx.beginPath(); ctx.moveTo(0, z * 0.9);
      ctx.bezierCurveTo(-z * 1.4, -z * 0.1, -z * 0.6, -z * 1.1, 0, -z * 0.35);
      ctx.bezierCurveTo(z * 0.6, -z * 1.1, z * 1.4, -z * 0.1, 0, z * 0.9); ctx.stroke();
    },
  });
  kind('nh-confetti', {
    init(p) { nhInit(p, 4, 0.8); p.vr = (Math.random() - 0.5) * 0.15; },
    draw(ctx, p, s) { ctx.fillStyle = NHC[p.c]; ctx.fillRect(-p.size * s / 2, -p.size * s / 4, p.size * s, p.size * s / 2); },
  });
  kind('nh-rain', {
    init(p) { p.size = 10 + Math.random() * 8; p.vy = 7 + Math.random() * 4; p.vx = -0.6; p.amp = 0; p.r = 0.08; p.a = 0.35; },
    draw(ctx, p, s) { ctx.strokeStyle = NHC.ink; ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, p.size * s); ctx.stroke(); },
  });
  kind('nh-dot', {   // anything without its own house-style version (pepernoten, eggs, stars): a pixel block
    init(p) { nhInit(p, 3, 0.6); p.vr = 0; p.r = 0; },
    draw(ctx, p, s) { const z = Math.round(p.size * s); ctx.fillStyle = NHC[p.c]; ctx.fillRect(-z / 2, -z / 2, z, z); },
  });
  // Mark (the theme's Japanese word) before the greeting, and the garland above the top bar
  let nhMarkEl = null, nhGarlandEl = null, nhGarlandKey = '';
  function nhTop(F, garland) {
    if (dayEl && !nhMarkEl && greet) {
      nhMarkEl = h('span', 'nh-mark');
      nhMarkEl.hidden = true;
      dayEl.insertBefore(nhMarkEl, greet);
    }
    if (nhMarkEl) {
      nhMarkEl.hidden = !F;
      if (F && nhMarkEl.textContent !== F.mark) nhMarkEl.textContent = F.mark;
    }
    const width = garland && bar ? Math.round(bar.getBoundingClientRect().width) : 0;
    const key = garland ? `${width}` : '';
    if (key === nhGarlandKey) return;
    nhGarlandKey = key;
    if (nhGarlandEl) { nhGarlandEl.remove(); nhGarlandEl = null; }
    if (garland && width > 0) {
      nhGarlandEl = h('div', 'nh-garland-wrap');
      nhGarlandEl.innerHTML = window.DASH_HOUSESTYLE.garlandSvg(width);
      bar.append(nhGarlandEl);
    }
  }

  // ---------- Decoration on the tiles ----------
  // Spec in a theme: { type: 'corner', id, svg, size | w+h, max, corners: ['tr', ...], inset: [x, y], mirror, card, if(data) }
  //                  { type: 'cap', svg, h }  (edge on top of each tile)   { type: 'edge', cls, card? }  (just the border)
  let decoSpecs = [], decoSeed = '', decoKey = '', decoTimer = 0;
  const OCCUPY = 'img, svg, button, input, select, textarea, canvas, video, iframe, .img-box, [role="slider"], a, .w-big, .seg';
  function visible(el) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 120 && r.height > 90;
  }
  // Rectangles of everything you don't want to cover: text (per line), buttons, images, big numbers
  function occupied(card) {
    const cr = card.getBoundingClientRect(), area = cr.width * cr.height, out = [];
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || n.parentElement.closest('.th-deco')) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width && r.height) out.push(r);
    }
    for (const el of card.querySelectorAll(OCCUPY)) {
      if (el.closest('.th-deco')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.width * r.height < area * 0.6) out.push(r);
    }
    return out;
  }
  const hit = (a, b, m = 3) => a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m;
  function rectFor(card, spec, corner) {
    const cr = card.getBoundingClientRect();
    if (spec.type === 'cap') return { left: cr.left, right: cr.right, top: cr.top, bottom: cr.top + (spec.h || 14) };
    const w = spec.w || spec.size, hh = spec.h || spec.size, [ix, iy] = spec.inset || [4, 4];
    const left = corner[1] === 'l' ? cr.left + ix : cr.right - ix - w;
    const top = corner[0] === 't' ? cr.top + iy : cr.bottom - iy - hh;
    return { left, top, right: left + w, bottom: top + hh };
  }
  function placeDeco() {
    clearTimeout(decoTimer);
    if (document.body.classList.contains('booting') || document.body.classList.contains('intro')) { decoTimer = setTimeout(placeDeco, 800); return; }
    const cards = decoSpecs.length ? [...document.querySelectorAll('.dashboard .tile, .dashboard #calendar')].filter(visible) : [];
    const occ = new Map(), occOf = (c) => { if (!occ.has(c)) occ.set(c, occupied(c)); return occ.get(c); };
    const free = (card, r) => !occOf(card).some((o) => hit(o, r));
    const plan = [], used = new Set();
    for (const spec of decoSpecs) {
      const pool = spec.card ? cards.filter((c) => c.id === spec.card) : cards;
      if (spec.type === 'edge') { for (const c of pool) plan.push({ card: c, spec, corner: 'all' }); continue; }
      if (spec.type === 'cap') { for (const c of pool) if (free(c, rectFor(c, spec))) plan.push({ card: c, spec, corner: 'band' }); continue; }
      const r = rng(`${decoSeed}|${spec.id}`);
      // Tiles you can see now first (not in the closed More drawer, not far below the screen)
      // (and in the rotating tile on tall only the part that's showing now)
      const seen = (c) => !c.closest('.desk-more:not(.open)') && !(c.closest('.tall-rot') && !c.classList.contains('on')) && c.getBoundingClientRect().top < innerHeight * 1.5;
      const order = pool.map((c) => [r() + (seen(c) ? 0 : 1), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      let n = spec.max || 1;
      for (const card of order) {
        if (n <= 0) break;
        if (used.has(card)) continue;
        const corners = spec.corners || ['tr', 'br', 'bl', 'tl'];
        const start = Math.floor(r() * (spec.shuffle === false ? 1 : corners.length));
        for (let i = 0; i < corners.length; i++) {
          const corner = corners[(start + i) % corners.length];
          if (!free(card, rectFor(card, spec, corner))) continue;
          plan.push({ card, spec, corner, rot: Math.round((r() - 0.5) * (spec.turn || 0)) });
          used.add(card);
          n--;
          break;
        }
      }
    }
    const key = plan.map((p) => `${p.card.id}:${p.spec.id || p.spec.type}:${p.corner}`).join('|');
    if (key === decoKey && document.querySelectorAll('.th-deco').length === plan.length) return;
    decoKey = key;
    document.querySelectorAll('.th-deco').forEach((el) => el.remove());
    for (const p of plan) {
      const { spec } = p;
      const el = h('div', `th-deco th-${spec.id || spec.type} th-${p.corner}${spec.mirror ? ' th-mirror' : ''}${spec.cls ? ` ${spec.cls}` : ''}`);
      el.setAttribute('aria-hidden', 'true');
      if (spec.type === 'corner') {
        const [ix, iy] = spec.inset || [4, 4];
        el.style.width = `${spec.w || spec.size}px`;
        el.style.height = `${spec.h || spec.size}px`;
        el.style[p.corner[1] === 'l' ? 'left' : 'right'] = `${ix}px`;
        el.style[p.corner[0] === 't' ? 'top' : 'bottom'] = `${iy}px`;
        if (p.rot) el.style.setProperty('--rot', `${p.rot}deg`);
      } else if (spec.type === 'cap') el.style.height = `${spec.h || 14}px`;
      if (spec.svg) el.innerHTML = typeof spec.svg === 'function' ? spec.svg() : spec.svg;
      if (getComputedStyle(p.card).position === 'static') p.card.classList.add('th-host');
      p.card.append(el);
    }
  }
  // Content arrives later (agenda, posters): look again a few times, then every minute
  [2500, 6000, 12000, 25000].forEach((ms) => setTimeout(() => decoSpecs.length && placeDeco(), ms));
  DASH.every(60 * 1000, () => decoSpecs.length && placeDeco());
  window.addEventListener('dash:layout', () => setTimeout(() => { topKey = ''; refresh(); placeDeco(); }, 400));

  // ---------- One-off effects (confetti, fireworks): ~4 s on a canvas over the page, then gone ----------
  function effect(kindName) {
    if (reduced.matches) return;
    const cv = h('canvas', 'th-fx');
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
    const s = devicePixelRatio;
    let colors = kindName === 'confetti' ? ['#b48cff', '#ff7aa8', '#ffcf5c', '#7ad7ff', '#9cff8a'] : ['#f5c542', '#ff7a59', '#7ad7ff', '#ffffff', '#ff5f8f'];
    if (window.DASH_HOUSESTYLE && DASH_HOUSESTYLE.active()) { nhColors(); colors = [NHC.holiday, NHC.holiday, NHC.ink]; }   // house style: holiday color and ink
    let parts = [];
    if (kindName === 'confetti') {
      parts = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 2 * s, vy: (2 + Math.random() * 3) * s,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: (6 + Math.random() * 6) * s, hgt: (3 + Math.random() * 3) * s, c: colors[Math.floor(Math.random() * colors.length)] }));
    }
    const burst = () => {
      const x = W * (0.15 + Math.random() * 0.7), y = H * (0.12 + Math.random() * 0.35), c = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2, v = (2 + Math.random() * 3) * s;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c, spark: true });
      }
    };
    const start = performance.now(), dur = kindName === 'confetti' ? 4500 : 3800;
    let nextBurst = 0;
    (function draw(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      if (kindName === 'fireworks' && t < 2600 && t >= nextBurst) { burst(); nextBurst = t + 380 + Math.random() * 300; }
      for (const p of parts) {
        if (p.spark) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.04 * s; p.vx *= 0.985; p.life -= 0.012;
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x, p.y, 2.5 * s, 2.5 * s);
        } else {
          p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.globalAlpha = t > dur - 800 ? Math.max(0, (dur - t) / 800) : 1;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt); ctx.restore();
        }
      }
      if (t < dur) requestAnimationFrame(draw); else cv.remove();
    })(start);
  }

  // ---------- Apply everything ----------
  let tickTimer = 0;
  function refresh() {
    if (!ready) return;
    topbarParts();
    const s = settings(), data = context(), cur = current(data);
    const layers = cur.layers.filter((t) => t && t.id !== 'default');
    const top = [...layers].reverse();                       // most important first
    const firstWith = (k) => top.find((t) => t[k]);
    const phone = phoneMq.matches, minimal = document.body.classList.contains('minimal');
    const quiet = layers.some((t) => t.quiet), still = reduced.matches || quiet;
    const on = s.all && layers.length > 0;
    const now = viewIso() ? cur.day : new Date();
    const day = cur.test || cur.fixed ? cur.day : now;
    const wx = on && s.weather && (!viewIso() || WX_TEST) ? wxState() : null;
    if (on && s.weather && !viewIso()) loadWx();
    // House style (since 1.4.0): the theme only sets --holiday, a Japanese mark, a garland, line-drawing corners and
    // small particles in the holiday color. No emoji, no own background, no colored top bar (design system › Holidays).
    const NHS = window.DASH_HOUSESTYLE, nh = !!(NHS && NHS.active());
    const holT = nh && on ? top.find((t) => NHS.HOLIDAY[t.id]) : null, F = holT ? NHS.HOLIDAY[holT.id] : null;
    if (F) { root.style.setProperty('--holiday-p', F.color); root.style.setProperty('--holiday-t', F.titleColor); }
    else { root.style.removeProperty('--holiday-p'); root.style.removeProperty('--holiday-t'); }
    nhTop(nh && F, nh && F && F.garland && s.topbar && !phone);

    // Top bar: color of the most important theme that has a top bar style
    const main = top.find((t) => t.topbar);
    const colorFrom = main || firstWith('c1');
    if (colorFrom) {
      const [c1, c2] = colorFrom.colors ? colorFrom.colors(day) : [colorFrom.c1, colorFrom.c2];
      root.style.setProperty('--th1', c1);
      root.style.setProperty('--th2', c2);
    }
    if (main) root.dataset.theme = main.id; else delete root.dataset.theme;
    root.toggleAttribute('data-theme-soft', !!main && main.topbar === 'soft');
    root.dataset.season = (layers.find((t) => t.tier === 'season') || {}).id || '';
    root.classList.toggle('th-still', still);

    // Greeting (string or { text, small }): the most important theme that has something to say
    let g = null;
    for (const t of top) {
      if (!t.greeting) continue;
      try { g = t.greeting(day, { fixed: cur.fixed, data, now }); } catch (e) { console.warn('[theme]', t.id, e); }
      if (g) break;
    }
    if (greet) {
      let text = g && (typeof g === 'string' ? g : g.text);
      if (nh && text) text = NHS.plain(text);
      greet.hidden = !text;
      if (text && greet.textContent !== text) greet.textContent = text;
      greet.classList.toggle('small', !!(g && g.small));
      const v = viewIso();
      viewChip.hidden = !v || !!urlDay;
      if (v) viewChip.textContent = `${nh ? 'view' : '👁'} ${noon(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · back`;
    }
    const icon = nh ? null : firstWith('dayIcon');
    root.classList.toggle('th-icon', !!icon);
    if (icon) root.style.setProperty('--th-icon', `"${icon.dayIcon} "`);

    // Background (also on the phone and in minimal mode)
    const bgT = on && s.bg ? firstWith('bg') : null;
    let bg = bgT ? (typeof bgT.bg === 'function' ? bgT.bg(day) : bgT.bg) : '';
    if (on && s.bg && wx && wx.kind === 'sun' && !(bgT && bgT.noSun)) bg = `radial-gradient(40% 35% at 92% 0%, rgba(255,214,120,.16), transparent 70%)${bg ? `, ${bg}` : ''}`;
    background(nh ? '' : bg);

    // Top bar decoration (not on the phone; in the house style the garland from nhTop)
    const td = on && s.topbar && !phone && !nh ? firstWith('topDeco') : null;
    topDeco(td && td.topDeco, !!(on && s.topbar && !phone && !nh && wx && wx.kind === 'rain'));

    // Tile decoration (not on the phone and not in minimal mode)
    const amount = AMOUNT[s.amount] || AMOUNT.normal;
    const holiday = layers.some((t) => t.tier !== 'season' && t.deco);
    let specs = [];
    if (nh) {
      // House style: one kind of corner (line drawing of the most important theme) on at most three windows, at the bottom so
      // it never covers the title bar; F1 race weekend: checkered border around the F1 window
      if (F && s.deco && !phone && !minimal) {
        specs.push({ type: 'corner', id: `nh-${F.corner}`, cls: 'nh-corner', size: 46, inset: [8, 8], corners: ['br', 'bl'], turn: 0,
          max: Math.min(3, Math.max(1, Math.round(3 * amount.deco))), svg: NHS.cornerSvg(F.corner) });
        if (layers.some((t) => t.id === 'f1')) specs.push({ type: 'edge', id: 'nh-checkered', cls: 'nh-checkered', card: 'w-f1' });
      }
    } else if (on && s.deco && !phone && !minimal) {
      for (const t of top) {
        for (const spec of t.deco || []) {
          if (spec.if && !spec.if(data, wx, cur.day)) continue;
          if (specs.some((x) => x.id === (spec.id || `${t.id}-${spec.type}`))) continue;   // e.g. snow caps from both Christmas and winter
          let max = spec.max ? Math.max(1, Math.round(spec.max * amount.deco)) : spec.max;
          if (t.tier === 'season' && holiday && max) max = Math.max(1, Math.ceil(max / 2));
          specs.push({ ...spec, id: spec.id || `${t.id}-${spec.type}`, max });
        }
      }
    }
    const seed = `${isoDay(cur.day)}|${s.amount}`;
    const specKey = specs.map((x) => `${x.id}:${x.max}`).join();
    if (specKey !== decoSpecs.key || seed !== decoSeed) {
      decoSpecs = specs;
      decoSpecs.key = specKey;
      decoSeed = seed;
      placeDeco();
    }

    // Particles (also in minimal mode; not on the phone, not with reduced motion or in exam week)
    const mix = [];
    if (on && s.particles && !phone && !still) {
      for (const t of layers) for (const p of t.particles || []) mix.push({ kind: p.kind, weight: p.density });
      if (wx && wx.kind === 'snow') mix.push({ kind: 'snow', weight: 0.8 });
      if (wx && wx.kind === 'rain') mix.push({ kind: 'rain', weight: 0.6 });
    }
    let target = Math.min(amount.parts, Math.round(mix.reduce((a, m) => a + m.weight, 0) * amount.parts));
    if (nh) {
      // House style: at most 12, small, as a line drawing or pixel in holiday color/ink (kinds nh-* above)
      for (const m of mix) m.kind = NH_KINDS.includes(m.kind) ? `nh-${m.kind}` : 'nh-dot';
      target = Math.min(12, target);
      nhColors();
    }
    particles(mix, target);

    // One-off effect: once a day per browser (always when testing with ?date/?theme)
    if (on && s.fx && !still) {
      for (const t of top) {
        const fx = t.fx && (typeof t.fx === 'function' ? t.fx(day) : t.fx);
        if (!fx) continue;
        const fxKey = `${t.id}|${isoDay(day)}`;
        if (cur.test || urlDay || store.get('theme.fx') !== fxKey) {
          if (!cur.test && !urlDay) store.set('theme.fx', fxKey);
          if (refresh.fxDone !== fxKey) { refresh.fxDone = fxKey; setTimeout(() => effect(fx), 600); }
        }
        break;
      }
    }

    // Some themes want to update more often (countdown on New Year's Eve)
    const tick = top.map((t) => t.tick && t.tick(day)).find(Boolean);
    clearTimeout(tickTimer);
    if (tick) tickTimer = setTimeout(refresh, tick);
    window.dispatchEvent(new CustomEvent('dash:theme', { detail: { layers: layers.map((t) => t.id) } }));
  }

  // ---------- Load the theme files (in parallel, run in order) ----------
  if (dayEl) {
    let left = FILES.length;
    const done = () => { if (--left === 0) { ready = true; refresh(); } };
    const load = (f, retry) => {
      const el = document.createElement('script');
      el.src = `themes/${f}.js?v=${DASH.VERSION}`;
      el.async = false;
      el.onload = done;
      el.onerror = () => { el.remove(); if (retry) load(f, false); else { console.warn('[theme] loading failed:', f); done(); } };   // retry once
      document.head.append(el);
    };
    for (const f of FILES) load(f, true);
    DASH.every(60 * 1000, refresh);                        // switches by itself at midnight
    window.addEventListener('dash:calendar', refresh);     // birthdays and exams from the agenda arrive later
    window.addEventListener('dash:mood', refresh);         // house style: another mood = another holiday color for the particles
    phoneMq.addEventListener('change', refresh);
    reduced.addEventListener('change', refresh);
    // Minimal mode on/off (topbar.js sets body.minimal)
    new MutationObserver(() => {
      const m = document.body.classList.contains('minimal');
      if (m !== refresh.minimal) { refresh.minimal = m; refresh(); setTimeout(placeDeco, 500); }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // ---------- Theme tab in Settings (settings.js) ----------
  const ORDER = ['autumn', 'winter', 'spring', 'summer', 'halloween', 'sinterklaas', 'christmas', 'newyear', 'kingsday', 'birthday',
    'valentine', 'easter', 'liberationday', 'f1', 'exams', 'default'];
  const SWITCHES = [
    ['particles', 'Falling particles', 'snow, leaves, blossom, hearts, confetti'],
    ['deco', 'Decoration on the tiles', 'snow caps, cobwebs, leaves, blossom'],
    ['topbar', 'Top bar decoration', 'lights, flags, garland'],
    ['bg', 'Background', 'theme gradient, starry sky at New Year'],
    ['weather', 'Include real weather', 'snow, rain or sun right now'],
    ['fx', 'One-off effects', 'fireworks, confetti on load'],
  ];
  function renderTab(el) {
    const s = settings(), redraw = () => { el.replaceChildren(); renderTab(el); };
    const change = (k, v) => { set(k, v); redraw(); };
    const head = (text) => el.append(h('p', 'th-set-h', text));
    const f = forced();

    head('Style');
    const styleRow = h('div', 'th-sw th-amount');
    const styleSeg = h('div', 'seg');
    for (const [k, label] of [['housestyle', 'House style'], ['modern', 'Modern'], ['y2k', 'Y2K (2003)']]) {
      const b = h('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(s.style === k));
      b.onclick = () => change('style', k);
      styleSeg.append(b);
    }
    styleRow.append(h('span', 'th-sw-txt', 'Look of the tiles'), styleSeg);
    el.append(styleRow);
    if (s.style === 'housestyle') {
      const moodRow = h('div', 'th-sw th-amount'), moodSeg = h('div', 'seg');
      for (const [k, label] of [['auto', 'Automatic'], ['digital', 'Digital Future'], ['poster', 'Poster'], ['titlecard', 'Title card']]) {
        const b = h('button', null, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String((s.mood || 'auto') === k));
        b.onclick = () => change('mood', k);
        moodSeg.append(b);
      }
      const moodTxt = h('span', 'th-sw-txt', 'Mood');
      if (window.DASH_HOUSESTYLE) moodTxt.append(h('small', null, `now: ${window.DASH_HOUSESTYLE.describe()}`));
      moodRow.append(moodTxt, moodSeg);
      el.append(moodRow);
    }
    if (urlStyle) el.append(h('p', 'th-set-note', `Fixed by the link right now (?style=${urlStyle}).`));

    head('Pick a theme');
    const auto = h('button', 'th-auto');
    auto.type = 'button';
    auto.setAttribute('aria-pressed', String(s.choice === 'auto'));
    auto.append(h('b', null, 'Automatic'), h('span', null, `follows date and weather · ${describe()}`));
    auto.onclick = () => change('choice', 'auto');
    el.append(auto);
    const grid = h('div', 'th-cards');
    for (const id of ORDER.filter((x) => byId[x]).concat(themes.map((t) => t.id).filter((x) => !ORDER.includes(x)))) {
      const t = byId[id], b = h('button', 'th-card');
      b.type = 'button';
      b.title = `Fix ${t.name}`;
      // House style: the Japanese mark and the holiday color instead of emoji and gradient
      const NF = window.DASH_HOUSESTYLE && DASH_HOUSESTYLE.active() ? DASH_HOUSESTYLE.HOLIDAY[id] || { mark: '', color: '#1b2a8c' } : null;
      b.style.setProperty('--a', NF ? NF.color : t.c1);
      b.style.setProperty('--b', NF ? NF.color : t.c2);
      b.setAttribute('aria-pressed', String(s.choice === id));
      b.append(h('span', `th-card-icon${NF ? ' nh-mark' : ''}`, NF ? NF.mark : t.icon), h('span', 'th-card-name', t.name));
      b.onclick = () => change('choice', id);
      grid.append(b);
    }
    el.append(grid);
    if (f) el.append(h('p', 'th-set-note', `Fixed by the link right now (${byId[f.id].name}); remove ?theme / ?${f.id} from the address to use this.`));

    head('Effects');
    const row = (label, sub, checked, onChange, disabled) => {
      const r = h('label', `th-sw${disabled ? ' off' : ''}`);
      const txt = h('span', 'th-sw-txt');
      txt.append(h('span', null, label));
      if (sub) txt.append(h('small', null, sub));
      const input = h('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      input.checked = checked;
      input.disabled = !!disabled;
      input.onchange = () => onChange(input.checked);
      r.append(txt, input);
      el.append(r);
    };
    row('All effects', 'main switch: everything off at once', s.all, (v) => change('all', v));
    for (const [k, label, sub] of SWITCHES) row(label, sub, s[k], (v) => change(k, v), !s.all);

    const amount = h('div', 'th-sw th-amount');
    const seg = h('div', 'seg');
    for (const [k, label] of [['calm', 'Calm'], ['normal', 'Normal'], ['party', 'Party']]) {
      const b = h('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(s.amount === k));
      b.onclick = () => change('amount', k);
      seg.append(b);
    }
    amount.append(h('span', 'th-sw-txt', 'Amount'), seg);
    el.append(amount);

    head('Font');
    row('Serif digits', 'big numbers in the tiles in a serif face (Source Serif); labels stay as they are', s.serif, (v) => change('serif', v));

    head('View as date');
    const dateRow = h('div', 'th-date');
    const input = h('input');
    input.type = 'date';
    input.value = viewIso() || isoDay(new Date());
    input.disabled = !!urlDay;
    input.onchange = () => { if (input.value) { viewDate(input.value); redraw(); } };
    const back = h('button', 'w-btn ghost', 'back to today');
    back.type = 'button';
    back.disabled = !viewIso() || !!urlDay;
    back.onclick = () => { viewDate(null); redraw(); };
    dateRow.append(input, back);
    el.append(dateRow);
    el.append(h('p', 'th-set-note', urlDay ? 'The date is fixed by ?date= in the address.'
      : 'This shows what a day looks like on Automatic. Only for this tab; the real weather doesn\'t count then.'));
    if (reduced.matches) el.append(h('p', 'th-set-note', 'Reduce motion is on on this computer: only still decoration.'));
    el.append(h('p', 'th-set-note', 'On the phone only the top bar color, greeting and background.'));
  }
  if (window.DASH_SETTINGS) DASH_SETTINGS.add({ id: 'theme', label: 'Theme', order: 10, render: renderTab });

  return { add, kind, util: { isoDay, md, noon, addDays, easter, between, daysUntil, inDays, calEvents, rng, svgUrl, snowCap },
    settings, set, viewDate, viewIso, today, describe, list: () => themes.slice(), refresh, placeDeco, DEFAULTS };
})();
