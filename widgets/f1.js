'use strict';

// Aftelklok naar de volgende F1-sessie via de Jolpica-API (opvolger van Ergast).
// Circuit-omtrek: bacinger/f1-circuits (MIT-licentie). Vlag: flagcdn.com.
DASH.widget('w-f1', (card, body, guard) => {
  const { h, store, fmtTime, fmtDay } = DASH;
  const KEY = 'f1.schedule.v2';
  const CIRCUITS = 'https://cdn.jsdelivr.net/gh/bacinger/f1-circuits@master/f1-circuits.geojson';
  const SESSIONS = [
    ['FirstPractice', 'Vrije training 1', 60],
    ['SecondPractice', 'Vrije training 2', 60],
    ['ThirdPractice', 'Vrije training 3', 60],
    ['SprintQualifying', 'Sprintkwalificatie', 45],
    ['SprintShootout', 'Sprintkwalificatie', 45],
    ['Sprint', 'Sprint', 45],
    ['Qualifying', 'Kwalificatie', 60],
  ];
  // Reserve als het circuit niet in de set staat
  const COUNTRY = {
    Australia: 'au', Bahrain: 'bh', China: 'cn', Japan: 'jp', 'Saudi Arabia': 'sa', USA: 'us', 'United States': 'us',
    Italy: 'it', Monaco: 'mc', Spain: 'es', Canada: 'ca', Austria: 'at', UK: 'gb', 'United Kingdom': 'gb', Hungary: 'hu',
    Belgium: 'be', Netherlands: 'nl', Azerbaijan: 'az', Singapore: 'sg', Mexico: 'mx', Brazil: 'br', Qatar: 'qa', UAE: 'ae',
    'United Arab Emirates': 'ae', Portugal: 'pt', France: 'fr', Germany: 'de', Turkey: 'tr',
  };

  let sessions = [];
  let circuits = null;
  let countdown = null;

  function toSessions(races) {
    const out = [];
    for (const r of races) {
      const gp = r.raceName.replace(/\s*Grand Prix$/i, '');
      const loc = r.Circuit.Location || {};
      const base = { gp, circuit: r.Circuit.circuitName, country: loc.country, lat: +loc.lat, lon: +loc.long };
      const add = (obj, name, min) => {
        if (!obj || !obj.date) return;
        const start = Date.parse(`${obj.date}T${obj.time || '12:00:00Z'}`);
        out.push({ ...base, name, start, end: start + min * 60000 });
      };
      for (const [k, name, min] of SESSIONS) add(r[k], name, min);
      add(r, 'Race', 120);
    }
    return out.sort((a, b) => a.start - b.start);
  }

  async function fetchYear(year) {
    const data = await DASH.getJSON(`https://api.jolpi.ca/ergast/f1/${year}/races/?format=json&limit=100`);
    return toSessions(data.MRData.RaceTable.Races || []);
  }

  const load = guard(async () => {
    const cached = store.get(KEY);
    if (cached && Date.now() - cached.at < 6 * 3600000) sessions = cached.sessions;
    else {
      try {
        const year = new Date().getFullYear();
        sessions = await fetchYear(year);
        if (!sessions.some((s) => s.end > Date.now())) sessions = sessions.concat(await fetchYear(year + 1));
        store.set(KEY, { at: Date.now(), sessions });
      } catch (e) {
        if (!cached) throw e;
        sessions = cached.sessions;
      }
    }
    render();
    // Circuitvormen los laden: lukt dat niet, dan blijft de rest gewoon staan
    if (!circuits) {
      DASH.getJSON(CIRCUITS).then((g) => { circuits = g.features || []; render(); }).catch(() => {});
    }
  });

  // Circuit dat het dichtst bij de coördinaten van de race ligt (binnen ±30 km)
  function findCircuit(s) {
    if (!circuits || !Number.isFinite(s.lat)) return null;
    let best = null, bestD = Infinity;
    for (const f of circuits) {
      const pts = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
      const [lon, lat] = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      const d = Math.hypot((lon - s.lon) * Math.cos(lat * Math.PI / 180), lat - s.lat);
      if (d < bestD) { bestD = d; best = { f, pts }; }
    }
    return bestD < 0.3 ? best : null;
  }

  function trackSvg(pts) {
    const lat0 = pts[0][1] * Math.PI / 180;
    const xy = pts.map(([lon, lat]) => [lon * Math.cos(lat0), -lat]);
    const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX, hgt = Math.max(...ys) - minY;
    const S = 200 / Math.max(w, hgt);
    const pad = 10;
    const vw = w * S + pad * 2, vh = hgt * S + pad * 2;
    const d = xy.map((p, i) => `${i ? 'L' : 'M'}${((p[0] - minX) * S + pad).toFixed(1)} ${((p[1] - minY) * S + pad).toFixed(1)}`).join(' ') + 'Z';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`);
    svg.setAttribute('role', 'img');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    const start = document.createElementNS(NS, 'circle');
    start.setAttribute('cx', ((xy[0][0] - minX) * S + pad).toFixed(1));
    start.setAttribute('cy', ((xy[0][1] - minY) * S + pad).toFixed(1));
    start.setAttribute('r', 5);
    svg.append(path, start);
    return svg;
  }

  function render() {
    const now = Date.now();
    const s = sessions.find((x) => x.end > now);
    clearInterval(countdown);
    if (!s) {
      body.replaceChildren(h('p', 'w-note', 'Geen sessies meer gepland. Tot volgend seizoen!'));
      return;
    }
    const live = s.start <= now;
    const match = findCircuit(s);
    const code = match ? match.f.properties.id.slice(0, 2) : COUNTRY[s.country];

    const head = h('div', 'f1-head');
    head.append(DASH.img(code ? `https://flagcdn.com/w320/${code}.png` : null, 'f1-flag', code ? code.toUpperCase() : '🏁'));
    const txt = h('div');
    txt.style.minWidth = '0';
    txt.append(h('div', 'w-mid', `GP ${s.gp}`), h('div', 'w-sub', `${s.name} · ${fmtDay(s.start)} ${fmtTime(s.start)}`));
    head.append(txt);

    const track = h('div', 'f1-track');
    if (match) {
      const svg = trackSvg(match.pts);
      svg.setAttribute('aria-label', match.f.properties.Name);
      track.append(svg);
      track.title = match.f.properties.Name;
    }

    const foot = h('div', 'w-row');
    const count = h('div', 'f1-count');
    foot.append(count);
    if (live) foot.append(h('span', 'w-pill live', 'Nu bezig'));
    const vbtn = h('button', 'w-btn', '▶ Stream');
    vbtn.onclick = openVideo;
    foot.append(vbtn);
    body.replaceChildren(head, track, foot);

    // "3d 4h 35min"; seconden pas op de dag zelf (of tijdens de sessie)
    const tick = () => {
      const target = live ? s.end : s.start;
      const ms = target - Date.now();
      if (ms <= 0) return render();
      const sameDay = DASH.startOfDay(target) === DASH.startOfDay(Date.now());
      const d = Math.floor(ms / 86400000);
      const hh = Math.floor(ms / 3600000) % 24;
      const mm = Math.floor(ms / 60000) % 60;
      const ss = Math.floor(ms / 1000) % 60;
      const units = [];
      if (d) units.push([d, 'd']);
      if (d || hh) units.push([hh, 'h']);
      units.push([mm, 'min']);
      if (sameDay || live) units.push([ss, 's']);
      const parts = live ? [h('small', null, 'nog ')] : [];
      for (const [v, u] of units) parts.push(document.createTextNode(v), h('small', null, u), document.createTextNode(' '));
      count.replaceChildren(...parts);
    };
    tick();
    countdown = setInterval(guard(tick), 1000);
  }

  // ---------- Stream-pop-up ----------
  // Plak een link of een embed-code; die wordt in deze browser onthouden.
  const VKEY = 'f1.stream';
  let pop = null;

  // Link of embed-code → veilige embed-URL. We maken zelf het iframe; geplakte code wordt nooit zo uitgevoerd.
  function toEmbed(input) {
    let s = input.trim();
    const iframe = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
    if (iframe) s = iframe[1].replace(/&amp;/g, '&');
    let u;
    try { u = new URL(s); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let m;
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}${start(u)}`;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}${start(u)}`;
      if ((m = u.pathname.match(/^\/(shorts|live)\/([\w-]+)/))) return `https://www.youtube.com/embed/${m[2]}`;
      if (u.pathname === '/playlist' && u.searchParams.get('list')) return `https://www.youtube.com/embed/videoseries?list=${u.searchParams.get('list')}`;
      if (u.pathname.startsWith('/embed/')) return u.href;
    }
    if (host === 'vimeo.com' && (m = u.pathname.match(/^\/(\d+)/))) return `https://player.vimeo.com/video/${m[1]}`;
    if (host === 'twitch.tv') {
      const parent = location.hostname;
      if ((m = u.pathname.match(/^\/videos\/(\d+)/))) return `https://player.twitch.tv/?video=${m[1]}&parent=${parent}`;
      if ((m = u.pathname.match(/^\/([\w]+)\/?$/))) return `https://player.twitch.tv/?channel=${m[1]}&parent=${parent}`;
    }
    return u.href; // andere sites: de link zelf (werkt als die site insluiten toestaat)
  }
  function start(u) {
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (!t) return '';
    const sec = /^\d+$/.test(t) ? t : String((+(t.match(/(\d+)h/) || [0, 0])[1]) * 3600 + (+(t.match(/(\d+)m/) || [0, 0])[1]) * 60 + (+(t.match(/(\d+)s/) || [0, 0])[1]));
    return `?start=${sec}`;
  }

  function openVideo() {
    if (!pop) buildVideo();
    pop.show();
    pop.open();
  }

  function buildVideo() {
    pop = DASH.panel('Stream', 'var(--c-f1)');
    pop.dialog.classList.add('panel-wide');
    const wrap = h('div', 'vid-body');
    const stage = h('div', 'vid-stage');
    const own = h('form', 'vid-own');
    const area = h('input');
    area.placeholder = 'Plak een link (YouTube, Vimeo, Twitch) of een embed-code (<iframe …>)';
    area.setAttribute('aria-label', 'Link of embed-code');
    const save = h('button', 'w-btn', 'Afspelen');
    const clear = h('button', 'w-btn ghost', 'Wissen');
    clear.type = 'button';
    const msg = h('span', 'vid-msg');
    own.append(area, save, clear, msg);
    wrap.append(stage, own);
    pop.body.append(wrap);

    const state = () => store.get(VKEY) || { src: null, input: '' };
    function frame(src) {
      const f = h('iframe', 'vid-frame');
      f.src = src;
      f.title = 'F1-video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      return f;
    }
    function draw() {
      const s = state();
      area.value = s.input || '';
      if (s.src) stage.replaceChildren(frame(s.src));
      else stage.replaceChildren(h('div', 'vid-empty', 'Plak hieronder een link of embed-code en klik op Afspelen.'));
    }
    own.onsubmit = (e) => {
      e.preventDefault();
      const src = toEmbed(area.value);
      if (!src) { msg.textContent = 'Geen geldige https-link of embed-code.'; msg.className = 'vid-msg bad'; return; }
      msg.textContent = '';
      store.set(VKEY, { src, input: area.value.trim() });
      draw();
    };
    clear.onclick = () => { store.set(VKEY, { src: null, input: '' }); msg.textContent = ''; draw(); };
    // Sluiten = video stoppen
    pop.dialog.addEventListener('close', () => stage.replaceChildren());
    pop.show = draw;
  }

  DASH.every(60 * 60 * 1000, load);
  load();
});
