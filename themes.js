'use strict';

// Thema's (sinds 0.44.0; bouwt voort op de feestdagenversie 0.42.0). Statisch geladen, werkt ook met ?mini=1.
// Elk thema is een eigen bestand in themes/ (uitleg bovenin themes/standaard.js) en meldt zich met DASH_THEMES.add({...}).
// Dit bestand kiest welk thema er nu geldt en tekent het:
//   - topbalk: kleur (html[data-theme] + --th1/--th2), groet .tb-greet, icoontje in de dagregel, versiering erboven (.th-top)
//   - achtergrond (.th-bg) en één gedeeld doek voor vallende deeltjes (.th-parts) ACHTER de vakken, dus nooit over tekst
//   - versiering op de vakken (.th-deco): alleen in een hoek of rand waar geen tekst, knop of plaatje zit (free())
//   - eenmalige effecten (confetti, vuurwerk) één keer per dag per browser (theme.fx), op een doek over de pagina
// Automatisch: een feestdag gaat boven het seizoen, het echte weer (Open-Meteo, 20 min cache) komt erbovenop.
// Telefoon (≤ 700px): alleen topbalkkleur, groet en achtergrond. Minimale modus: geen deeltjes en geen vakversiering.
// Beweging beperken: alleen stilstaand (geen deeltjes, geen effecten, niets knippert). Tentamenweek: ook alles stil.
// Instellingen (tabje Thema in settings.js) staan in localStorage theme.settings; "Bekijk als datum" in sessionStorage.
//
// Testen: ?datum=JJJJ-MM-DD doet alsof het die dag is, ?thema=<naam> of ?<naam> zet een thema vast (effect dan altijd),
// ?weer=sneeuw|regen|zon|koud doet alsof het zulk weer is.
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
  const FILES = ['standaard', 'herfst', 'winter', 'lente', 'zomer', 'halloween', 'sinterklaas', 'kerst', 'oudennieuw',
    'valentijn', 'pasen', 'koningsdag', 'bevrijdingsdag', 'verjaardag', 'f1', 'tentamen'];

  // ---------- Eigen verjaardag eenmalig instellen via de link (staat niet in de code: de repo is openbaar) ----------
  const setB = params.get('mijnverjaardag');
  if (setB && /^\d{4}-\d{2}-\d{2}$/.test(setB)) {
    store.set('theme.birthday', setB);
    params.delete('mijnverjaardag');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    document.addEventListener('DOMContentLoaded', () => {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = 'Verjaardag opgeslagen in deze browser 🎂';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 4000);
    });
  }

  // ---------- Hulpjes voor de themabestanden ----------
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    const month = Math.floor((hh + l - 7 * m + 114) / 31);
    return new Date(y, month - 1, ((hh + l - 7 * m + 114) % 31) + 1, 12);
  }
  // 'MM-DD' tussen van en tot (ook over de jaarwisseling heen)
  const between = (d, from, to) => { const x = md(d); return from <= to ? x >= from && x <= to : x >= from || x <= to; };
  const daysUntil = (d, mmdd) => {
    let t = noon(`${d.getFullYear()}-${mmdd}`);
    if (t < noon(isoDay(d))) t = noon(`${d.getFullYear() + 1}-${mmdd}`);
    return Math.round((t - noon(isoDay(d))) / 86400000);
  };
  const inDays = (n) => (n === 1 ? 'morgen' : `over ${n} dagen`);
  // Agenda: live uit calendar.js, anders de bewaarde (minimale modus)
  const calEvents = () => (window.DASH_CALENDAR && window.DASH_CALENDAR.connected ? window.DASH_CALENDAR.events : (store.get('google.events') || {}).events) || [];
  // Seeded toeval: dezelfde dag geeft dezelfde vakken en hoeken
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

  // ---------- Registratie ----------
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

  // ---------- Instellingen ----------
  const DEFAULTS = { choice: 'auto', all: true, particles: true, deco: true, topbar: true, bg: true, weather: true, fx: true, amount: 'normaal' };
  const AMOUNT = { rustig: { parts: 10, deco: 0.5 }, normaal: { parts: 30, deco: 1 }, feestje: { parts: 60, deco: 1.6 } };
  const settings = () => ({ ...DEFAULTS, ...(store.get('theme.settings') || {}) });
  function set(key, value) {
    const s = settings();
    s[key] = value;
    store.set('theme.settings', s);
    refresh();
  }
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} },
  };
  const urlDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('datum') || '') ? params.get('datum') : null;
  const viewIso = () => urlDay || session.get('theme.viewDate');
  function viewDate(iso) { session.set('theme.viewDate', iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null); refresh(); }
  const today = () => (viewIso() ? noon(viewIso()) : new Date());

  // ---------- Welk thema ----------
  function forced() {
    const name = params.get('thema') || [...params.keys()].find((k) => byId[k] || aliases[k]);
    if (!name) return null;
    if (aliases[name]) return aliases[name];
    return byId[name] ? { id: name } : null;
  }
  // Gegevens die de when()-regels mogen gebruiken (één keer per keer kiezen opgehaald)
  function context() {
    const f1 = store.get('f1.schedule.v2');
    return { events: calEvents(), f1: (f1 && f1.sessions) || [], birthday: store.get('theme.birthday'), wx: wxState() };
  }
  function pick(day, data) {
    const hits = themes.filter((t) => { try { return t.when && t.when(day, data); } catch (e) { console.warn('[thema]', t.id, e); return false; } });
    const season = hits.filter((t) => t.tier === 'seizoen').sort((a, b) => b.prio - a.prio)[0];
    return [season, ...hits.filter((t) => t.tier !== 'seizoen').sort((a, b) => a.prio - b.prio)].filter(Boolean);
  }
  function current(data) {
    const s = settings(), f = forced(), day = today();
    if (f) return { layers: [byId[f.id]], fixed: true, test: true, day: f.md ? noon(`${day.getFullYear()}-${f.md}`) : day };
    if (s.choice !== 'auto' && byId[s.choice]) return { layers: [byId[s.choice]], fixed: true, day };
    return { layers: pick(day, data), fixed: false, day };
  }
  const names = (l) => l.filter((t) => t.id !== 'standaard').map((t) => t.name).join(' + ') || 'Standaard';
  // "nu: Herfst + Halloween · vanaf zo: Herfst"
  function describe() {
    const data = context(), day = today(), now = pick(day, data);
    const key = (l) => l.map((t) => t.id).join();
    let text = `nu: ${names(now)}`;
    for (let i = 1; i <= 120; i++) {
      const d = addDays(day, i), l = pick(d, data);
      if (key(l) === key(now)) continue;
      const when = i < 7 ? d.toLocaleDateString('nl-NL', { weekday: 'short' }) : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
      text += ` · vanaf ${when}: ${names(l)}`;
      break;
    }
    const w = settings().weather && !viewIso() ? wxState() : null;
    if (w && w.kind) text += ` · echt weer: ${w.kind}`;
    return text;
  }

  // ---------- Echt weer ----------
  const WX_TEST = params.get('weer');
  function wxState() {
    if (WX_TEST) return { kind: WX_TEST === 'koud' ? null : WX_TEST, temp: WX_TEST === 'koud' || WX_TEST === 'sneeuw' ? -1 : 14 };
    const c = store.get('theme.wx');
    return c && Date.now() - c.at < 3 * 3600000 ? c : null;
  }
  let wxBusy = false;
  async function loadWx() {
    const c = store.get('theme.wx');
    if (WX_TEST || wxBusy || (c && Date.now() - c.at < 20 * 60000)) return;
    wxBusy = true;
    try {
      const d = await DASH.getJSON('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
        latitude: DASH.HOME.lat, longitude: DASH.HOME.lon, current: 'temperature_2m,weather_code,is_day', timezone: 'Europe/Amsterdam' }));
      const code = d.current.weather_code;
      const kindOf = [71, 73, 75, 77, 85, 86].includes(code) ? 'sneeuw' : (code >= 51 && code <= 67) || (code >= 80 && code <= 99) ? 'regen'
        : code <= 1 && d.current.is_day ? 'zon' : null;
      store.set('theme.wx', { at: Date.now(), kind: kindOf, temp: d.current.temperature_2m });
      refresh();
    } catch (e) {
      console.warn('[thema] weer lukt niet:', e);
    } finally {
      wxBusy = false;
    }
  }

  // ---------- Topbalk: groet, kleur, dagregel-icoon, versiering ----------
  let greet = null, viewChip = null, topEl = null, dropsEl = null;
  function topbarParts() {
    if (greet || !dayEl) return;
    greet = h('span', 'tb-greet');
    greet.hidden = true;
    dayEl.insertBefore(greet, dayEl.querySelector('.tb-dayline'));
    viewChip = h('button', 'th-view');
    viewChip.type = 'button';
    viewChip.hidden = true;
    viewChip.title = 'Terug naar vandaag';
    viewChip.onclick = () => viewDate(null);
    dayEl.insertBefore(viewChip, greet);
  }
  // Lampjes, vlaggetjes of een slinger net boven de topbalk (in de ruimte erboven, nooit over tekst)
  function garland(type, colors, width) {
    const W = Math.max(200, Math.round(width)), H = 30, span = W > 900 ? 240 : 160;
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
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${cord}${items}</svg>`;
  }
  function drops(width) {
    const r = rng('regen'), W = Math.round(width);
    let s = '';
    for (let i = 0; i < Math.round(W / 70); i++) {
      const x = 20 + r() * (W - 40), sz = 3 + r() * 2.5;
      s += `<path d="M${x} ${10 - sz * 1.6} Q${x + sz} ${10 - sz * 0.2} ${x} ${10 + sz * 0.6} Q${x - sz} ${10 - sz * 0.2} ${x} ${10 - sz * 1.6}Z" fill="rgba(170,210,255,.75)"/>`;
    }
    return `<svg viewBox="0 0 ${W} 16" width="${W}" height="16" aria-hidden="true">${s}</svg>`;
  }
  let topKey = '';
  function topDeco(spec, rain) {
    const width = bar ? bar.getBoundingClientRect().width - 48 : 0;
    const key = spec ? `${spec.type}|${spec.colors}|${Math.round(width / 40)}|${rain}` : `|${rain}|${Math.round(width / 40)}`;
    if (key === topKey) return;
    topKey = key;
    if (topEl) { topEl.remove(); topEl = null; }
    if (dropsEl) { dropsEl.remove(); dropsEl = null; }
    if (spec && width > 0) {
      topEl = h('div', `th-top th-top-${spec.type}`);
      topEl.setAttribute('aria-hidden', 'true');
      topEl.innerHTML = garland(spec.type, spec.colors, width);
      bar.append(topEl);
    }
    if (rain && width > 0) {
      dropsEl = h('div', 'th-drops');
      dropsEl.setAttribute('aria-hidden', 'true');
      dropsEl.innerHTML = drops(width);
      bar.append(dropsEl);
    }
  }

  // ---------- Achtergrond ----------
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

  // ---------- Vallende deeltjes: één doek achter de vakken ----------
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
      if (bgEl) document.body.prepend(bgEl);   // achtergrond onder de deeltjes
      P.ctx = P.cv.getContext('2d');
      sizeCanvas();
    }
    P.cv.hidden = false;
    P.parts = P.parts.filter((p) => P.mix.some((m) => kinds[m.kind] === p.k));
    startParts();
  }
  document.addEventListener('visibilitychange', startParts);   // verborgen tabblad = stil
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { sizeCanvas(); topKey = ''; refresh(); placeDeco(); }, 300);
  });

  // Standaardsoorten deeltjes (een thema kan er zelf een bij maken met DASH_THEMES.kind)
  const pick1 = (list) => list[Math.floor(Math.random() * list.length)];
  kind('sneeuw', {
    init(p) { p.size = 1.4 + Math.random() * 2.4; p.vy = 0.45 + Math.random() * 0.7; p.vx = (Math.random() - 0.5) * 0.3; p.amp = 0.35; p.a = 0.55 + Math.random() * 0.4; },
    draw(ctx, p, s) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, p.size * s, 0, 6.28); ctx.fill(); },
  });
  kind('blad', {
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
  kind('bloesem', {
    init(p) { p.size = 3.5 + Math.random() * 3; p.vy = 0.35 + Math.random() * 0.45; p.vx = 0.15 + Math.random() * 0.3; p.vr = (Math.random() - 0.5) * 0.05; p.amp = 0.7; p.a = 0.85;
      p.c = pick1(['#ffc2d6', '#ffd9e6', '#fff0f5', '#f7a8c4']); },
    draw(ctx, p, s) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.size * s, p.size * 0.6 * s, 0, 0, 6.28); ctx.fill(); },
  });
  kind('hartje', {
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
  kind('regen', {
    init(p) { p.size = 10 + Math.random() * 10; p.vy = 7 + Math.random() * 4; p.vx = -0.8; p.amp = 0; p.r = 0.08; p.a = 0.28 + Math.random() * 0.2; },
    draw(ctx, p, s) { ctx.strokeStyle = '#a9c8ff'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, p.size * s); ctx.stroke(); },
  });

  // ---------- Versiering op de vakken ----------
  // Spec in een thema: { type: 'corner', id, svg, size | w+h, max, corners: ['tr', ...], inset: [x, y], mirror, card, if(data) }
  //                   { type: 'cap', svg, h }  (rand bovenop elk vak)   { type: 'edge', cls, card? }  (alleen de rand zelf)
  let decoSpecs = [], decoSeed = '', decoKey = '', decoTimer = 0;
  const OCCUPY = 'img, svg, button, input, select, textarea, canvas, video, iframe, .img-box, [role="slider"], a, .w-big, .seg';
  function visible(el) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 120 && r.height > 90;
  }
  // Rechthoeken van alles wat je niet wilt bedekken: tekst (per regel), knoppen, plaatjes, grote getallen
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
      if (spec.type === 'cap') { for (const c of pool) if (free(c, rectFor(c, spec))) plan.push({ card: c, spec, corner: 'top' }); continue; }
      const r = rng(`${decoSeed}|${spec.id}`);
      const order = pool.map((c) => [r(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
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
  // Inhoud komt later binnen (agenda, posters): een paar keer opnieuw kijken, daarna elke minuut
  [2500, 6000, 12000, 25000].forEach((ms) => setTimeout(() => decoSpecs.length && placeDeco(), ms));
  DASH.every(60 * 1000, () => decoSpecs.length && placeDeco());
  window.addEventListener('dash:layout', () => setTimeout(placeDeco, 400));

  // ---------- Eenmalige effecten (confetti, vuurwerk): ~4 s op een doek over de pagina, daarna weg ----------
  function effect(kindName) {
    if (reduced.matches) return;
    const cv = h('canvas', 'th-fx');
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
    const s = devicePixelRatio;
    const colors = kindName === 'confetti' ? ['#b48cff', '#ff7aa8', '#ffcf5c', '#7ad7ff', '#9cff8a'] : ['#f5c542', '#ff7a59', '#7ad7ff', '#ffffff', '#ff5f8f'];
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
      if (kindName === 'vuurwerk' && t < 2600 && t >= nextBurst) { burst(); nextBurst = t + 380 + Math.random() * 300; }
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

  // ---------- Alles samen toepassen ----------
  let tickTimer = 0;
  function refresh() {
    if (!ready) return;
    topbarParts();
    const s = settings(), data = context(), cur = current(data);
    const layers = cur.layers.filter((t) => t && t.id !== 'standaard');
    const top = [...layers].reverse();                       // belangrijkste eerst
    const firstWith = (k) => top.find((t) => t[k]);
    const phone = phoneMq.matches, minimal = document.body.classList.contains('minimal');
    const quiet = layers.some((t) => t.quiet), still = reduced.matches || quiet;
    const on = s.all && layers.length > 0;
    const now = viewIso() ? cur.day : new Date();
    const day = cur.test || cur.fixed ? cur.day : now;
    const wx = on && s.weather && (!viewIso() || WX_TEST) ? wxState() : null;
    if (on && s.weather && !viewIso()) loadWx();

    // Topbalk: kleur van het belangrijkste thema met een topbalkstijl
    const main = top.find((t) => t.topbar);
    const colorFrom = main || firstWith('c1');
    if (colorFrom) {
      const [c1, c2] = colorFrom.colors ? colorFrom.colors(day) : [colorFrom.c1, colorFrom.c2];
      root.style.setProperty('--th1', c1);
      root.style.setProperty('--th2', c2);
    }
    if (main) root.dataset.theme = main.id; else delete root.dataset.theme;
    root.toggleAttribute('data-theme-soft', !!main && main.topbar === 'soft');
    root.dataset.season = (layers.find((t) => t.tier === 'seizoen') || {}).id || '';
    root.classList.toggle('th-still', still);

    // Groet (string of { text, small }): het belangrijkste thema dat iets te zeggen heeft
    let g = null;
    for (const t of top) {
      if (!t.greeting) continue;
      try { g = t.greeting(day, { fixed: cur.fixed, data, now }); } catch (e) { console.warn('[thema]', t.id, e); }
      if (g) break;
    }
    if (greet) {
      const text = g && (typeof g === 'string' ? g : g.text);
      greet.hidden = !text;
      if (text && greet.textContent !== text) greet.textContent = text;
      greet.classList.toggle('small', !!(g && g.small));
      const v = viewIso();
      viewChip.hidden = !v || !!urlDay;
      if (v) viewChip.textContent = `👁 ${noon(v).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })} · terug`;
    }
    const icon = firstWith('dayIcon');
    root.classList.toggle('th-icon', !!icon);
    if (icon) root.style.setProperty('--th-icon', `"${icon.dayIcon} "`);

    // Achtergrond (ook op de telefoon en in de minimale modus)
    const bgT = on && s.bg ? firstWith('bg') : null;
    let bg = bgT ? (typeof bgT.bg === 'function' ? bgT.bg(day) : bgT.bg) : '';
    if (on && s.bg && wx && wx.kind === 'zon' && !(bgT && bgT.noSun)) bg = `radial-gradient(40% 35% at 92% 0%, rgba(255,214,120,.16), transparent 70%)${bg ? `, ${bg}` : ''}`;
    background(bg);

    // Topbalk-versiering (niet op de telefoon)
    const td = on && s.topbar && !phone ? firstWith('topDeco') : null;
    topDeco(td && td.topDeco, !!(on && s.topbar && !phone && wx && wx.kind === 'regen'));

    // Vakversiering (niet op de telefoon en niet in de minimale modus)
    const amount = AMOUNT[s.amount] || AMOUNT.normaal;
    const holiday = layers.some((t) => t.tier !== 'seizoen' && t.deco);
    let specs = [];
    if (on && s.deco && !phone && !minimal) {
      for (const t of top) {
        for (const spec of t.deco || []) {
          if (spec.if && !spec.if(data, wx)) continue;
          let max = spec.max ? Math.max(1, Math.round(spec.max * amount.deco)) : spec.max;
          if (t.tier === 'seizoen' && holiday && max) max = Math.max(1, Math.ceil(max / 2));
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

    // Deeltjes (niet op de telefoon, niet minimaal, niet bij beweging beperken of tentamenweek)
    const mix = [];
    if (on && s.particles && !phone && !minimal && !still) {
      for (const t of layers) for (const p of t.particles || []) mix.push({ kind: p.kind, weight: p.density });
      if (wx && wx.kind === 'sneeuw') mix.push({ kind: 'sneeuw', weight: 0.8 });
      if (wx && wx.kind === 'regen') mix.push({ kind: 'regen', weight: 0.6 });
    }
    const target = Math.min(amount.parts, Math.round(mix.reduce((a, m) => a + m.weight, 0) * amount.parts));
    particles(mix, target);

    // Eenmalig effect: één keer per dag per browser (bij testen met ?datum/?thema altijd)
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

    // Sommige thema's willen vaker bijwerken (aftellen op oudejaarsdag)
    const tick = top.map((t) => t.tick && t.tick(day)).find(Boolean);
    clearTimeout(tickTimer);
    if (tick) tickTimer = setTimeout(refresh, tick);
    window.dispatchEvent(new CustomEvent('dash:theme', { detail: { layers: layers.map((t) => t.id) } }));
  }

  // ---------- Themabestanden laden (parallel, uitvoeren in volgorde) ----------
  if (dayEl) {
    let left = FILES.length;
    const done = () => { if (--left === 0) { ready = true; refresh(); } };
    for (const f of FILES) {
      const el = document.createElement('script');
      el.src = `themes/${f}.js?v=${DASH.VERSION}`;
      el.async = false;
      el.onload = done;
      el.onerror = () => { console.warn('[thema] laden mislukt:', f); done(); };
      document.head.append(el);
    }
    DASH.every(60 * 1000, refresh);                        // om middernacht vanzelf om
    window.addEventListener('dash:calendar', refresh);     // verjaardag en tentamens uit de agenda komen later binnen
    phoneMq.addEventListener('change', refresh);
    reduced.addEventListener('change', refresh);
    // Minimale modus aan/uit (topbar.js zet body.minimal)
    new MutationObserver(() => {
      const m = document.body.classList.contains('minimal');
      if (m !== refresh.minimal) { refresh.minimal = m; refresh(); setTimeout(placeDeco, 500); }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  return { add, kind, util: { isoDay, md, noon, addDays, easter, between, daysUntil, inDays, calEvents, rng, svgUrl },
    settings, set, viewDate, viewIso, today, describe, list: () => themes.slice(), refresh, placeDeco, DEFAULTS };
})();
