// Kamer als startscherm (groot idee "Kamer als startscherm", stap 1: blokkenkamer met de drie overgangen).
// Start in de app (html.app) altijd, in de browser alleen met ?kamer. Niet bij ?mini, ?code (Spotify-inlog komt terug),
// #dashboard of een ander diep adres, de minimale modus, of zonder WebGL. Het dashboard laadt er gewoon onder.
// Eén kamer, drie camera's, gekozen op de vorm van het scherm:
//   liggend  = de kamerhoek; inzoomen tot de CRT de hoogte vult, de zijkanten van het dashboard schuiven uit het scherm
//   staand   = zittend aan het bureau; inzoomen tot de CRT de breedte vult, dan kantelt het beeld een kwartslag
//   telefoon = bij het bed (≤ 700px breed, staand); de klaptelefoon klapt open en het schermpje groeit tot het hele scherm
// Tijdens de overgang toont het scherm een vaste tekening van het dashboard in Y2K-stijl (drawDash); daarna het echte.
(() => {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const SKIP_HASH = /^#(dashboard|feeds|mydata|games|canvas|agenda|checkin)/;
  const minimal = (() => { try { return JSON.parse(localStorage.getItem('dash.minimal')) === true; } catch { return false; } })();
  const want = (root.classList.contains('app') || params.has('kamer'))
    && !params.has('mini') && !params.has('code') && !SKIP_HASH.test(location.hash) && !minimal;
  if (!want) return;
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  if (!gl) return;

  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Laag over het dashboard (meteen, zodat het dashboard niet eerst flitst) ----------
  const layer = document.createElement('div');
  layer.className = 'kamer';
  layer.innerHTML = `
    <canvas class="kamer-gl" aria-label="Kamer: klik op de monitor (of druk op Enter) om het dashboard te openen"></canvas>
    <div class="kamer-grain" aria-hidden="true"></div>
    <button type="button" class="kamer-box">
      <span class="kamer-who">Kamer</span>
      <span class="kamer-line"></span>
    </button>`;
  document.body.prepend(layer);
  document.body.classList.add('kamer-on');
  const cv = layer.querySelector('.kamer-gl');
  const grain = layer.querySelector('.kamer-grain');
  const box = layer.querySelector('.kamer-box');
  const line = layer.querySelector('.kamer-line');

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    stopLoop();
    layer.remove();
    document.body.classList.remove('kamer-on');
    removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    try { renderer?.dispose(); renderer?.forceContextLoss(); } catch {}
    window.dispatchEvent(new Event('resize'));   // indelingen opnieuw laten meten
    window.dispatchEvent(new CustomEvent('dash:kamer', { detail: 'dashboard' }));
  }

  // ---------- Modus uit de vorm van het scherm ----------
  const modeNow = () => {
    const w = layer.clientWidth || innerWidth, h = layer.clientHeight || innerHeight;
    if (w <= 700 && h >= w) return 'phone';
    return h > w ? 'portrait' : 'landscape';
  };
  let mode = modeNow();

  const two = (n) => String(n).padStart(2, '0');
  const clock = () => { const d = new Date(); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  const who = layer.querySelector('.kamer-who');
  let said = null, typing = 0;
  // Tekst verschijnt letter voor letter, zoals in een DS-spel (één keer per bericht; niet bij minder beweging)
  function type(text) {
    clearInterval(typing);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { line.textContent = text; return; }
    let i = 0;
    line.textContent = '';
    typing = setInterval(() => { line.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typing); }, 18);
  }
  const setLine = () => {
    if (said) return;
    who.textContent = 'Kamer';
    clearInterval(typing);
    line.textContent = mode === 'phone'
      ? `Het is ${clock()}. Tik op je telefoon.`
      : `Het is ${clock()}. Klik op de monitor of druk op Enter.`;
  };
  setLine();

  // ---------- Wat de voorwerpen zeggen (gegevens die het dashboard al heeft) ----------
  const DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const when = (ms) => {
    const d = new Date(ms), t = `${two(d.getHours())}:${two(d.getMinutes())}`;
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const diff = Math.floor((new Date(d).setHours(0, 0, 0, 0) - day0) / 864e5);
    return diff === 0 ? `vandaag ${t}` : diff === 1 ? `morgen ${t}` : `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${t}`;
  };
  const nextAH = () => {
    const ev = (window.DASH_CALENDAR?.events || []).filter((e) => window.DASH?.isAH(e) && e.start > Date.now()).sort((a, b) => a.start - b.start)[0];
    return ev ? when(ev.start) : null;
  };
  const SAY = {
    async raam() {
      const temp = window.DASH_WEATHER?.current?.temperature_2m;
      const t = temp != null ? ` ${Math.round(temp)}°C.` : '';
      try {
        const r = await window.DASH.radar();
        const MIN = window.DASH.RAIN_MIN || .1;
        const slots = r.slots || [];
        const wetNow = slots[0] && slots[0].mmh >= MIN;
        if (wetNow) {
          const dry = slots.find((x) => x.mmh < MIN);
          return dry ? `Het regent. Droog om ${when(dry.start).replace(/^vandaag /, '')}, zegt Buienradar.${t}` : `Het regent, en de komende 2 uur blijft dat zo.${t}`;
        }
        const wet = slots.find((x) => x.mmh >= MIN);
        return wet ? `Nog droog. Om ${when(wet.start).replace(/^vandaag /, '')} begint het te regenen.${t}` : `Droog buiten, de komende 2 uur ook.${t}`;
      } catch { return temp != null ? `Buiten is het${t}` : 'Het weer is nog niet geladen.'; }
    },
    poster() {
      const tr = window.DASH_TRACK;
      return tr ? `Nu op Spotify: ${tr.name} van ${tr.artist}.` : 'Op Spotify speelt nu niets.';
    },
    async cds() {
      try {
        const d = await window.DASH.getJSON(`data/letterboxd.json?t=${Math.floor(Date.now() / 900000)}`);
        const f = d.logs && d.logs[0];
        if (!f) return 'Nog niets gelogd op Letterboxd.';
        const stars = f.rating ? `${String(f.rating).replace('.', ',')} ${f.rating === 1 ? 'ster' : 'sterren'}` : 'zonder cijfer';
        return `Laatst gelogd op Letterboxd: ${f.title} (${f.year}), ${stars}${f.liked ? ', met een hartje' : ''}.`;
      } catch { return 'Letterboxd is nog niet geladen.'; }
    },
    ps2() {
      let d = null; try { d = JSON.parse(localStorage.getItem('episodes.data')); } catch {}
      const rows = (d && d.rows) || [];
      if (!rows.length) return 'Episodes Left heeft hier nog geen gegevens (de extensie werkt alleen in Firefox).';
      const total = rows.reduce((n, r) => n + (r.left || 0), 0);
      const top = rows.slice().sort((a, b) => (b.left || 0) - (a.left || 0))[0];
      return total ? `Episodes Left: nog ${total} ${total === 1 ? 'aflevering' : 'afleveringen'}, de meeste van ${top.title} (${top.left}).` : 'Episodes Left: je bent overal bij.';
    },
    bed() {
      const ah = nextAH();
      return `Bed for sleeping in. ${ah ? `Volgende AH-dienst: ${ah}.` : 'Geen AH-dienst in de agenda.'}`;
    },
    phone() {
      const n = (window.DASH?.allAlerts?.() || []).length;
      return n ? `Je mobiel. ${n} ${n === 1 ? 'melding' : 'meldingen'}.` : 'Je mobiel. Niks nieuws.';
    },
  };
  async function say(key) {
    said = key;
    who.textContent = 'Noah';
    type('…');
    let text;
    try { text = await SAY[key](); } catch { text = '…'; }
    if (said === key) type(text);
  }

  // ---------- Vaste tekening van het dashboard (Y2K) ----------
  // Zelfde grove indeling als het echte dashboard in die modus: vensters met blauwe titelbalk op een blauw bureaublad.
  function drawDash(W, H, m) {
    const c = document.createElement('canvas');
    const s = Math.min(1, 1400 / Math.max(W, H));          // hooguit ~1400px, groter levert niets op
    c.width = Math.round(W * s); c.height = Math.round(H * s);
    const x = c.getContext('2d');
    x.scale(c.width / W, c.height / H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a3d8f'); g.addColorStop(1, '#081436');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const u = m === 'phone' ? W / 408 : m === 'portrait' ? W / 1350 : H / 1149;   // 1 = één CSS-pixel bij Noahs maten
    const bar = 22 * u;
    const win = (wx, wy, ww, wh, cream = '#f1ecdf') => {
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(wx + 3 * u, wy + 3 * u, ww, wh);
      x.fillStyle = cream; x.fillRect(wx, wy, ww, wh);
      const t = x.createLinearGradient(0, wy, 0, wy + bar);
      t.addColorStop(0, '#4b95f7'); t.addColorStop(.15, '#1f63dc'); t.addColorStop(1, '#0d45b6');
      x.fillStyle = t; x.fillRect(wx, wy, ww, bar);
      x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(wx + 8 * u, wy + 8 * u, Math.min(ww * .35, 90 * u), 6 * u);
      x.fillStyle = '#c33a14'; x.fillRect(wx + ww - 18 * u, wy + 4 * u, 14 * u, 14 * u);
      // tekstregels
      x.fillStyle = 'rgba(21,19,15,.22)';
      for (let ty = wy + bar + 14 * u, i = 0; ty < wy + wh - 12 * u && i < 6; ty += 18 * u, i++) x.fillRect(wx + 12 * u, ty, (ww - 24 * u) * (i % 2 ? .6 : .85), 7 * u);
      x.strokeStyle = '#2b2820'; x.lineWidth = Math.max(1, u); x.strokeRect(wx, wy, ww, wh);
    };
    const topbar = (tx, ty, tw, th) => {
      x.fillStyle = '#16307a'; x.fillRect(tx, ty, tw, th);
      x.strokeStyle = '#0a1f6e'; x.strokeRect(tx, ty, tw, th);
      x.fillStyle = '#3cff7a'; x.font = `${Math.round(th * .55)}px VT323, monospace`; x.textBaseline = 'middle';
      x.fillText(clock(), tx + 14 * u, ty + th / 2);
    };
    const taskbar = (h) => {
      const t = x.createLinearGradient(0, H - h, 0, H);
      t.addColorStop(0, '#3f7ff0'); t.addColorStop(.5, '#2559cc'); t.addColorStop(1, '#173c96');
      x.fillStyle = t; x.fillRect(0, H - h, W, h);
      x.fillStyle = '#3c9a3c'; x.fillRect(0, H - h, 90 * u, h);
    };
    const P = 12 * u, G = 10 * u;
    if (m === 'phone') {
      topbar(P, P, W - 2 * P, 92 * u);
      let y = P + 92 * u + G;
      for (const h of [96, 96, 90, 90, 100]) { win(P, y, W - 2 * P, h * u); y += h * u + G; }
      const t = x.createLinearGradient(0, H - 72 * u, 0, H);
      t.addColorStop(0, '#2f6ae8'); t.addColorStop(1, '#173c96');
      x.fillStyle = t; x.fillRect(0, H - 72 * u, W, 72 * u);
    } else if (m === 'portrait') {
      topbar(P, P, W - 2 * P, 70 * u);
      let y = P + 70 * u + G;
      win(P, y, W - 2 * P, 300 * u); y += 300 * u + G;
      const w3 = (W - 2 * P - 2 * G) / 3;
      for (let i = 0; i < 3; i++) win(P + i * (w3 + G), y, w3, 300 * u);
      y += 300 * u + G;
      const w2 = (W - 2 * P - G) / 2;
      for (let i = 0; i < 2; i++) win(P + i * (w2 + G), y, w2, 240 * u);
      y += 240 * u + G;
      win(P, y, W - 2 * P, 300 * u); y += 300 * u + G;
      win(P, y, W - 2 * P, H - y - 46 * u);
      taskbar(34 * u);
    } else {
      const rail = 56 * u;
      x.fillStyle = '#0f2a6e'; x.fillRect(0, 0, rail, H);
      for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(16 * u, (80 + i * 50) * u, 24 * u, 24 * u); }
      const L = rail + P, Wd = W - L - P;
      topbar(L, P, Wd, 70 * u);
      const top = P + 70 * u + G, bot = H - 34 * u - P - 40 * u;
      const cw = [Wd * .24, Wd * .46, Wd * .30].map((v) => v - G * 2 / 3);
      let cx = L;
      const cols = [[.35, .35, .30], [.38, .62], [.3, .3, .4]];
      cols.forEach((parts, i) => {
        let y = top;
        const hh = bot - top - G * (parts.length - 1);
        parts.forEach((p) => { win(cx, y, cw[i], hh * p); y += hh * p + G; });
        cx += cw[i] + G;
      });
      taskbar(34 * u);
    }
    return c;
  }

  // ---------- Three.js ----------
  let THREE, renderer, scene, camera, crt, phone, lid, crtScreen, phoneScreen, crtTex, crtCtx;
  let sun, amb, lamp, patch, skyCanvas, skyTex;
  let raf = 0, tween = null;
  const loop = () => {
    raf = 0;
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.t0) / tween.ms);
      tween.step(t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // easeInOutCubic
      if (t >= 1) { const end = tween.end; tween = null; end?.(); }
    }
    renderer.render(scene, camera);
    if (tween) raf = requestAnimationFrame(loop);
  };
  const draw = () => { if (renderer && !raf) raf = requestAnimationFrame(loop); };
  const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; tween = null; };
  const animate = (ms, step, end) => new Promise((res) => {
    if (still) { step(1); end?.(); draw(); return res(); }
    tween = { t0: performance.now(), ms, step, end: () => { end?.(); res(); } };
    draw();
  });

  // Kleuren per dagdeel (zoals de klikbare mockup); later uit de echte zonnetijden
  const PAL = {
    nacht: { wallL: 0x2a2352, wallB: 0x352b63, floor: 0x4a3426, ceil: 0x1b1638, sky: 0x0c1236, sun: 0x7fa8ff, sunI: .25, amb: .35, lamp: 1.6 },
    avond: { wallL: 0x4a2f4f, wallB: 0x5a3a5e, floor: 0x5a3c2a, ceil: 0x3a2440, sky: 0xf08a5d, sun: 0xffb38a, sunI: .9, amb: .45, lamp: 1.1 },
    dag: { wallL: 0x9c94c4, wallB: 0xaaa3d0, floor: 0x8a6446, ceil: 0xc9c3e6, sky: 0x8fd0ff, sun: 0xfff6d8, sunI: 1.6, amb: .7, lamp: .2 },
  };
  // ---------- Zon en weer ----------
  // Zonnestand voor Rotterdam (zelfde formules als SunCalc), zodat de kamer niet op het weervak hoeft te wachten.
  // Testen: ?kamertijd=17:30 (met ?datum=JJJJ-MM-DD van de thema's) en ?kamerweer=regen|bewolkt|zon.
  const HOME = { lat: 51.9225, lon: 4.4792 };
  const now = () => {
    const t = /^(\d{1,2}):(\d{2})$/.exec(params.get('kamertijd') || ''), day = params.get('datum');
    if (!t && !day) return new Date();
    const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00`) : new Date();
    if (t) d.setHours(+t[1], +t[2], 0, 0);
    return d;
  };
  function sunPos(date) {
    const rad = Math.PI / 180, e = rad * 23.4397;
    const d = date / 864e5 - .5 + 2440588 - 2451545;
    const M = rad * (357.5291 + .98560028 * d);
    const L = M + rad * (1.9148 * Math.sin(M) + .02 * Math.sin(2 * M) + .0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(L) * Math.sin(e)), ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const phi = rad * HOME.lat, H = rad * (280.16 + 360.9856235 * d) + rad * HOME.lon - ra;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;   // vanaf het noorden, met de klok mee
    return { alt: alt / rad, az: az / rad };
  }
  // Kleuren tussen de dagdelen in: nacht → avond rond zonsondergang (-8° .. 0°), avond → dag (0° .. 12°)
  const COLORS = ['wallL', 'wallB', 'floor', 'ceil', 'sky', 'sun'];
  function palAt(alt) {
    const mix = (a, b, t) => {
      const o = {};
      for (const k in a) o[k] = COLORS.includes(k) ? new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHex() : a[k] + (b[k] - a[k]) * t;
      return o;
    };
    const cl = (x) => Math.max(0, Math.min(1, x));
    return alt < 0 ? mix(PAL.nacht, PAL.avond, cl((alt + 8) / 8)) : mix(PAL.avond, PAL.dag, cl(alt / 12));
  }
  const daypart = () => { const a = sunPos(now()).alt; return a > 6 ? 'dag' : a > -6 ? 'avond' : 'nacht'; };
  // Weer: 'zon', 'bewolkt' of 'regen' (Buienradar nu, anders de weercode van het weervak)
  let weather = { kind: 'zon', mm: 0 };

  function crtIdle() {
    const W = crtTex.image.width, H = crtTex.image.height;
    crtCtx.fillStyle = '#1d4fb8'; crtCtx.fillRect(0, 0, W, H);
    crtCtx.fillStyle = 'rgba(0,0,0,.25)';
    for (let y = 0; y < H; y += 4) crtCtx.fillRect(0, y, W, 2);
    crtCtx.fillStyle = '#fff'; crtCtx.textAlign = 'center'; crtCtx.textBaseline = 'middle';
    crtCtx.font = `${Math.round(H * .3)}px VT323, monospace`; crtCtx.fillText(clock(), W / 2, H * .45);
    crtCtx.fillStyle = '#d6ecff'; crtCtx.font = `${Math.round(H * .1)}px VT323, monospace`;
    crtCtx.fillText(mode === 'phone' ? '' : 'klik om op te starten', W / 2, H * .72);
    crtTex.needsUpdate = true;
  }

  // ---------- PS1-look ----------
  // Laag renderen (± 240 pixels op de korte kant) en met image-rendering: pixelated opschalen; vertices springen naar
  // een grof raster (wiebelen als de camera beweegt); 15-bits kleur met een 4×4-ditherpatroon; pixeltexturen met
  // NearestFilter; vaste korrel erover. Tijdens het inzoomen loopt de resolutie op tot scherp, zodat het scherm
  // naadloos overgaat in de DOM-kopie.
  const LOW = 240;
  const baseScale = () => Math.max(2, Math.min(layer.clientWidth, layer.clientHeight) / LOW);
  let scale = 2;
  const PSX = { uSnap: { value: null } };
  function setRes(s) {
    scale = s;
    const w = layer.clientWidth, h = layer.clientHeight;
    renderer.setPixelRatio(1);
    renderer.setSize(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)), false);
    // raster voor de vertices: de helft van de lage basisresolutie, zoals de PS1 zonder subpixels
    const b = baseScale();
    PSX.uSnap.value.set(w / b / 2, h / b / 2);
  }
  function psx(m, { dither = true } = {}) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSnap = PSX.uSnap;
      sh.vertexShader = 'uniform vec2 uSnap;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + .5) / uSnap * gl_Position.w;');
      if (dither) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
        `#include <dithering_fragment>
  {
    vec2 q = mod(floor(gl_FragCoord.xy), 4.);
    float i = q.x + q.y * 4.;
    float b = mod(i * 7. + floor(i / 4.) * 3., 16.) / 16. - .47;
    gl_FragColor.rgb = floor(gl_FragColor.rgb * 31. + b + .5) / 31.;
  }`);
    };
    m.customProgramCacheKey = () => (dither ? 'psx-d' : 'psx');
    return m;
  }

  // Pixeltexturen (4-32 px), getekend op een canvas
  function pix(w, h, paint, rx = 1, ry = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    paint(x, w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    return t;
  }
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const shade = (n, f) => '#' + new THREE.Color(n).multiplyScalar(f).getHexString();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const speckle = (x, w, h, base, n = .08) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * .35; i++) {
      x.fillStyle = rnd() < .5 ? `rgba(0,0,0,${n})` : `rgba(255,255,255,${n * .7})`;
      x.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
    }
  };
  const wallpaper = (base) => (x, w, h) => {
    speckle(x, w, h, base, .05);
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, 0, 3, h);
    x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(9, 7, 2, 2);
  };

  async function build() {
    THREE = await import(THREE_URL);
    if (done) return;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'low-power' });
    PSX.uSnap.value = new THREE.Vector2(160, 120);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, 0.01, 50);
    const p = PAL[daypart()];
    scene.background = new THREE.Color(p.ceil);
    scene.fog = new THREE.Fog(p.ceil, 4.5, 9);

    const T = {
      floor: pix(32, 32, (x, w) => {      // planken
        for (let r = 0; r < 4; r++) { x.save(); x.translate(0, r * 8); speckle(x, w, 8, shade(p.floor, .9 + (r % 2) * .15)); x.restore(); }
        x.fillStyle = 'rgba(0,0,0,.35)';
        for (let r = 0; r < 4; r++) { x.fillRect(0, r * 8 + 7, w, 1); x.fillRect((r * 13) % w, r * 8, 1, 7); }
      }, 6, 6),
      wallB: pix(16, 16, wallpaper(hex(p.wallB)), 20, 13),
      wallL: pix(16, 16, wallpaper(hex(p.wallL)), 20, 13),
      ceil: pix(16, 16, (x, w, h) => speckle(x, w, h, hex(p.ceil), .06), 10, 10),
      wood: pix(32, 16, (x, w, h) => { speckle(x, w, h, '#8a6440', .1); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 5, w, 1); x.fillRect(0, 11, w, 1); }, 2, 1),
      beige: pix(16, 16, (x, w, h) => speckle(x, w, h, '#d8d0b8', .06)),
      duvet: pix(16, 16, (x, w, h) => { x.fillStyle = '#3f5bd8'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8ecff'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); }, 8, 16),
      rug: pix(8, 8, (x, w, h) => { x.fillStyle = '#b8324a'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8566a'; x.fillRect(0, 0, 4, 4); x.fillRect(4, 4, 4, 4); }, 12, 9),
      keys: pix(32, 8, (x, w, h) => {
        x.fillStyle = '#e0d8c0'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#b5ac92';
        for (let r = 0; r < 3; r++) for (let k = 0; k < 15; k++) x.fillRect(1 + k * 2 + (r % 2), 1 + r * 2, 1, 1);
      }),
      blinds: pix(4, 16, (x, w, h) => { x.fillStyle = '#d8d0b4'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 3; y < h; y += 4) x.fillRect(0, y, w, 1); }),
      poster1: pix(16, 20, (x, w, h) => {
        x.fillStyle = '#2b2b6e'; x.fillRect(0, 0, w, h); x.fillStyle = '#e0457b'; x.fillRect(0, 12, w, 8);
        x.fillStyle = '#f2d14a'; x.fillRect(5, 4, 6, 5); x.fillStyle = '#fff'; x.fillRect(2, 15, 12, 1); x.fillRect(2, 17, 8, 1);
      }),
      poster2: pix(12, 16, (x, w, h) => { x.fillStyle = '#55c3a8'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(3, 4, 6, 6); x.fillStyle = '#1a1450'; x.fillRect(2, 12, 8, 2); }),
      ps2: pix(16, 8, (x, w, h) => {
        x.fillStyle = '#1c1c24'; x.fillRect(0, 0, w, h); x.fillStyle = '#2c2c38';
        for (let y = 1; y < h; y += 2) x.fillRect(0, y, w, 1);
        x.fillStyle = '#3a6ad8'; x.fillRect(12, 3, 2, 1);
      }),
    };
    const mat = (c, extra = {}) => psx(new THREE.MeshLambertMaterial(typeof c === 'number' ? { color: c, ...extra } : { map: c, ...extra }));
    const basic = (o) => psx(new THREE.MeshBasicMaterial(o), { dither: false });
    const tag = (key, m) => { m.userData.say = key; return m; };
    const boxAt = (w, h, d, x, y, z, c, parent = scene) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), c instanceof THREE.Material ? c : mat(c));
      m.position.set(x, y, z); parent.add(m); return m;
    };

    // Kamer: x 0..4 (linkermuur op x=0), z 0..4 (achtermuur op z=0), y 0..2.6
    boxAt(4, .02, 4, 2, -.01, 2, T.floor);
    boxAt(4, .02, 4, 2, 2.61, 2, T.ceil);
    boxAt(4, 2.6, .02, 2, 1.3, -.01, T.wallB);
    boxAt(.02, 2.6, 4, -.01, 1.3, 2, T.wallL);
    // Raam met jaloezieën (linkermuur)
    tag('raam', boxAt(.04, 1.2, 1.5, .01, 1.55, 2.0, T.beige));
    skyCanvas = document.createElement('canvas'); skyCanvas.width = 48; skyCanvas.height = 36;
    skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.magFilter = skyTex.minFilter = THREE.NearestFilter; skyTex.generateMipmaps = false; skyTex.colorSpace = THREE.SRGBColorSpace;
    tag('raam', boxAt(.02, 1.08, 1.38, .03, 1.55, 2.0, basic({ map: skyTex })));
    for (let i = 0; i < 9; i++) tag('raam', boxAt(.03, .04, 1.36, .05, 2.04 - i * .12, 2.0, T.blinds));
    sun = new THREE.DirectionalLight(p.sun, p.sunI);
    sun.position.set(-2, 2.4, 2.2); sun.target.position.set(2, 0, 1.8);
    scene.add(sun, sun.target);
    amb = new THREE.AmbientLight(0xffffff, p.amb); scene.add(amb);
    // Lichtvlek door het raam op de vloer (met de lamellen erin), vorm volgt de zon
    const slats = pix(4, 16, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; for (let y = 2; y < h; y += 4) x.fillRect(0, y, w, 1); });
    patch = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: slats, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide }));
    patch.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    patch.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    patch.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    patch.renderOrder = 2; patch.frustumCulled = false;
    scene.add(patch);
    // Kleed
    boxAt(1.6, .01, 1.2, 1.5, .005, 2.2, T.rug);
    // Bureau tegen de achtermuur
    boxAt(1.5, .05, .7, 1.6, .73, .35, T.wood);
    for (const [lx, lz] of [[.9, .05], [2.3, .05], [.9, .65], [2.3, .65]]) boxAt(.05, .73, .05, lx, .365, lz, 0x5e4229);
    // CRT: beige kast met bol scherm (schermvlak 0,32 × 0,24 = 4:3)
    crt = new THREE.Group(); crt.position.set(1.55, .755, .3); scene.add(crt);
    boxAt(.2, .03, .18, 0, .015, 0, 0xb5ac92, crt);
    boxAt(.42, .38, .42, 0, .22, 0, T.beige, crt);
    boxAt(.3, .28, .2, 0, .22, -.28, T.beige, crt);
    const tc = document.createElement('canvas'); tc.width = 640; tc.height = 480;
    crtCtx = tc.getContext('2d');
    crtTex = new THREE.CanvasTexture(tc); crtTex.colorSpace = THREE.SRGBColorSpace;
    crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(.32, .24), basic({ map: crtTex }));
    crtScreen.position.set(0, .23, .211); crt.add(crtScreen);
    boxAt(.012, .008, .005, .17, .05, .212, basic({ color: 0x4ade80 }), crt);
    const glow = new THREE.PointLight(0x4aa8ff, .6, 1.6); glow.position.set(0, .23, .5); crt.add(glow);
    crtIdle();
    // Toetsenbord, muis, pc-kast, lamp, cd-plank, posters
    boxAt(.44, .025, .15, 1.55, .765, .6, T.keys);
    boxAt(.06, .02, .1, 1.95, .76, .6, 0xe0d8c0);
    boxAt(.2, .45, .45, 2.15, .225, .3, T.beige);
    boxAt(.04, 1.5, .04, .45, .75, .35, 0xc8c0a8);
    boxAt(.2, .14, .2, .45, 1.55, .35, mat(0xf2b45a, { emissive: 0xf2b45a, emissiveIntensity: .5 }));
    lamp = new THREE.PointLight(0xffb35c, p.lamp, 3.5); lamp.position.set(.45, 1.4, .45); scene.add(lamp);
    tag('cds', boxAt(.9, .03, .2, 1.6, 1.45, .1, T.wood));
    ['#d84a4a', '#f2d14a', '#3a6ad8', '#e8e8e8', '#2a2a2a', '#55c3a8', '#e0457b', '#f28a3a', '#8a5ad8', '#e8e8e8']
      .forEach((c, i) => tag('cds', boxAt(.025, .14, .12, 1.25 + i * .045, 1.535, .1, new THREE.Color(c).getHex())));
    tag('poster', boxAt(.7, .9, .01, 3.0, 1.6, .005, T.poster1));
    tag('poster', boxAt(.4, .55, .01, 3.65, 1.55, .005, T.poster2));
    // PS2 + controller op de vloer
    tag('ps2', boxAt(.3, .07, .2, 1.4, .045, 2.1, T.ps2));
    tag('ps2', boxAt(.12, .03, .07, 1.7, .025, 2.4, 0x2a2a34));
    // Onzichtbaar, groter klikvlak: de PS2 is van een afstand maar een paar pixels
    tag('ps2', boxAt(.7, .25, .6, 1.5, .12, 2.25, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
    // Bed rechts tegen de achtermuur, klaptelefoon op het dekbed
    tag('bed', boxAt(1.0, .35, 2.0, 3.45, .175, 1.05, 0x2c3fa8));
    tag('bed', boxAt(1.0, .1, 2.0, 3.45, .4, 1.05, T.duvet));
    tag('bed', boxAt(.7, .12, .35, 3.45, .51, .25, 0xf4f4f4));
    tag('bed', boxAt(1.05, .7, .06, 3.45, .35, .02, T.wood));
    // Klaptelefoon: onderkant ligt plat, het klepje scharniert aan de verre kant (kleinere z)
    phone = new THREE.Group(); phone.position.set(3.3, .455, 1.25); phone.rotation.y = -.35; phone.scale.setScalar(1.6); scene.add(phone);
    boxAt(.055, .014, .1, 0, .007, 0, 0xc8ccd8, phone);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) boxAt(.01, .003, .008, -.015 + k * .015, .015, .01 + r * .018, 0x7a8090, phone);
    lid = new THREE.Group(); lid.position.set(0, .016, -.05); phone.add(lid);
    boxAt(.055, .012, .1, 0, .006, .05, 0xc8ccd8, lid);
    boxAt(.03, .002, .018, 0, .0125, .06, basic({ color: 0x7fd0ff }), lid);   // klein buitenschermpje
    phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(.045, .06), basic({ color: 0x7fd0ff }));
    phoneScreen.rotation.x = Math.PI / 2;           // naar de onderkant van het klepje, "boven" = weg van het scharnier
    phoneScreen.position.set(0, -.0005, .05); lid.add(phoneScreen);

    // Vaste korrel over het beeld (beweegt niet), even grof als de lage pixels
    const g = document.createElement('canvas'); g.width = g.height = 64;
    const gx = g.getContext('2d');
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = Math.floor(rnd() * 255); gx.fillStyle = `rgb(${v},${v},${v})`; gx.fillRect(x, y, 1, 1); }
    grain.style.backgroundImage = `url(${g.toDataURL()})`;

    onResize();
    addEventListener('resize', onResize);
    cv.addEventListener('pointermove', (e) => { cv.style.cursor = hit(e) ? 'pointer' : ''; });
    cv.addEventListener('click', (e) => {
      const h = hit(e);
      if (h === 'enter') enter();
      else if (h) say(h);
      else if (said) { said = null; setLine(); }
    });
    applySky();
    refreshWeather();
    addEventListener('dash:weather', refreshWeather);
    setInterval(() => { if (!busy && !done) { setLine(); crtIdle(); applySky(); } }, 20000);   // setLine laat een bericht staan
    setInterval(() => { if (!busy && !done) refreshWeather(); }, 5 * 60000);
    layer.classList.add('ready');
  }

  // Raam op de linkermuur (x = 0) kijkt naar het zuidwesten; vanuit de kamer gezien is +z rechts van het raam
  const WINDOW_AZ = 225;
  const WIN = { y0: 1.01, y1: 2.09, z0: 1.31, z1: 2.69 };
  async function refreshWeather() {
    const force = params.get('kamerweer');
    if (/^(regen|bewolkt|zon)$/.test(force || '')) { weather = { kind: force, mm: force === 'regen' ? 1.5 : 0 }; return applySky(); }
    const code = window.DASH_WEATHER?.current?.weather_code;
    let kind = code == null ? 'zon' : code >= 51 ? 'regen' : code >= 2 ? 'bewolkt' : 'zon', mm = 0;
    try {
      const r = await window.DASH?.radar();
      const first = r && r.slots && r.slots[0];
      if (first) { mm = first.mmh; if (mm >= (window.DASH.RAIN_MIN || .1)) kind = 'regen'; else if (kind === 'regen') kind = 'bewolkt'; }
    } catch {}
    weather = { kind, mm };
    applySky();
  }
  function applySky() {
    if (!renderer || done) return;
    const t = now(), sp = sunPos(t), q = palAt(sp.alt);
    const grey = weather.kind === 'regen' ? .75 : weather.kind === 'bewolkt' ? .45 : 0;
    const sky = new THREE.Color(q.sky).lerp(new THREE.Color(sp.alt > 0 ? 0x8a93a3 : 0x1c2030), grey);
    // Zon door het raam: alleen als hij boven de horizon staat en aan de kant van het raam
    const rad = Math.PI / 180, rel = (sp.az - WINDOW_AZ) * rad, h = Math.max(sp.alt, 0) * rad;
    const toSun = new THREE.Vector3(-Math.cos(rel) * Math.cos(h), Math.sin(h), Math.sin(rel) * Math.cos(h));
    const facing = Math.max(0, Math.cos(rel));
    const strength = sp.alt > 0 ? Math.min(1, sp.alt / 6) * facing * (1 - grey) : 0;
    sun.color.set(q.sun);
    sun.intensity = q.sunI * (1 - grey * .6);
    sun.position.set(1.2 + toSun.x * 5, 1.2 + Math.max(.3, toSun.y) * 5, 2 + toSun.z * 5);
    amb.intensity = q.amb * (1 - grey * .25);
    lamp.intensity = q.lamp;
    scene.background.set(q.ceil); scene.fog.color.set(q.ceil);
    // Lichtvlek: de hoeken van het raam langs de zonnestraal op de vloer (of de muur ertegenover) geprojecteerd
    const pos = patch.geometry.attributes.position;
    if (strength > .02 && toSun.y > .02) {
      const d = toSun.clone().negate();
      const corners = [[WIN.y1, WIN.z0], [WIN.y1, WIN.z1], [WIN.y0, WIN.z1], [WIN.y0, WIN.z0]];
      const hits = corners.map(([y, z]) => { const k = (y - .012) / -d.y; return [d.x * k, z, d.z * k]; });   // tot de vloer
      // Lage zon (herfst/winter) zou ver achter het bed uitkomen: de vlek in dezelfde vorm terugschalen naar de vloer voor het raam
      const f = Math.min(1, 2.3 / Math.max(...hits.map((q) => q[0])));
      hits.forEach(([px, z, dz], i) => pos.setXYZ(i, Math.max(.02, px * f), .012, Math.min(3.98, Math.max(.02, z + dz * f))));
      pos.needsUpdate = true;
      patch.material.color.set(q.sun);
      patch.material.opacity = .55 * strength;
      patch.visible = true;
    } else patch.visible = false;
    // Lucht in het raam: verloop, maan 's nachts, regen als strepen op het glas (staan stil)
    const x = skyCanvas.getContext('2d'), W = skyCanvas.width, H = skyCanvas.height;
    const top = sky.clone().multiplyScalar(.75), g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#' + top.getHexString()); g.addColorStop(1, '#' + sky.getHexString());
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (sp.alt < -4 && weather.kind === 'zon') { x.fillStyle = '#e8ecff'; x.fillRect(10, 6, 5, 5); x.fillStyle = 'rgba(255,255,255,.7)'; for (const [a, b] of [[30, 4], [38, 12], [22, 15], [42, 3]]) x.fillRect(a, b, 1, 1); }
    if (sp.alt > 0 && weather.kind === 'zon' && facing > .2) { x.fillStyle = '#fff6d0'; x.fillRect(Math.round(24 - Math.sin(rel) * 18), Math.round(H - 6 - Math.min(sp.alt, 40) / 40 * (H - 12)), 5, 5); }
    if (weather.kind !== 'zon') { x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) x.fillRect((i * 9 + 3) % W, 3 + (i % 3) * 4, 10, 3); }
    if (weather.kind === 'regen') {
      x.fillStyle = 'rgba(200,225,255,.75)';
      let sd = 3;
      const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const n = Math.min(40, 10 + Math.round((weather.mm || 1) * 8));
      for (let i = 0; i < n; i++) { const a = Math.floor(r() * W), b = Math.floor(r() * (H - 4)); x.fillRect(a, b, 1, 2 + Math.floor(r() * 3)); }
    }
    skyTex.needsUpdate = true;
    draw();
  }

  // ---------- Camera's ----------
  const VIEWS = {
    landscape: { pos: [3.7, 1.75, 3.9], look: [1.3, .85, .55], fov: 55 },
    portrait: { pos: [1.55, 1.2, 1.45], look: [1.55, 1.0, .3], fov: 62 },
    phone: { pos: [3.38, 1.02, 1.8], look: [3.28, .45, 1.08], fov: 58 },
  };
  function place() {
    const v = VIEWS[mode];
    camera.fov = v.fov;
    camera.up.set(0, 1, 0);
    camera.position.set(...v.pos);
    camera.lookAt(...v.look);
    camera.updateProjectionMatrix();
  }
  function onResize() {
    if (busy) return;
    const w = layer.clientWidth, h = layer.clientHeight;
    setRes(baseScale());
    grain.style.backgroundSize = `${64 * scale}px`;
    camera.aspect = w / h;
    mode = modeNow();
    setLine(); crtIdle();
    place();
    draw();
  }

  const ray = () => new THREE.Raycaster();
  // Wat er onder de muis ligt: 'enter' (monitor, of de telefoon op de telefoon), een voorwerp dat iets zegt, of null
  function hit(e) {
    if (!renderer || busy) return null;
    const r = cv.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = ray(); rc.setFromCamera(v, camera);
    const first = rc.intersectObject(scene, true)[0];
    if (!first) return null;
    for (let o = first.object; o; o = o.parent) {
      if (o === crt) return mode === 'phone' ? null : 'enter';
      if (o === phone) return mode === 'phone' ? 'enter' : 'phone';
      if (o.userData.say) return o.userData.say;
    }
    return null;
  }

  // Camera recht voor een schermvlak, op de afstand waarop het de breedte ('w') of hoogte ('h') van het beeld vult
  function poseFor(screen, sw, sh, fill) {
    screen.updateWorldMatrix(true, false);
    const c = new THREE.Vector3(), q = new THREE.Quaternion();
    screen.getWorldPosition(c); screen.getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const sc = new THREE.Vector3(); screen.getWorldScale(sc);
    sw *= sc.x; sh *= sc.y;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const d = fill === 'h' ? sh / (2 * tan) : sw / (2 * tan * camera.aspect);
    return { pos: c.clone().addScaledVector(n, d), look: c, up };
  }
  // Rechthoek van het schermvlak in CSS-pixels van de laag
  function rectOf(screen, sw, sh) {
    const W = layer.clientWidth, H = layer.clientHeight;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
      const v = new THREE.Vector3(a * sw / 2, b * sh / 2, 0);
      screen.localToWorld(v); v.project(camera);
      return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
    });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const l = Math.min(...xs), t = Math.min(...ys);
    return { l, t, w: Math.max(...xs) - l, h: Math.max(...ys) - t };
  }
  function flyTo(pose, ms, also) {
    const p0 = camera.position.clone(), u0 = camera.up.clone();
    const l0 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(p0.distanceTo(pose.look)).add(p0);
    return animate(ms, (k) => {
      camera.position.lerpVectors(p0, pose.pos, k);
      camera.up.lerpVectors(u0, pose.up, k).normalize();
      camera.lookAt(new THREE.Vector3().lerpVectors(l0, pose.look, k));
      also?.(k);
    });
  }

  // Het scherm in 3D krijgt dezelfde tekening als de DOM-kopie straks, in dezelfde stand
  function screenImage(img, orient) {
    const W = crtTex.image.width, H = crtTex.image.height;
    crtCtx.fillStyle = '#0f2c6e'; crtCtx.fillRect(0, 0, W, H);
    crtCtx.save();
    if (orient === 'rot') {          // staand dashboard, een kwartslag gedraaid (bovenkant links)
      const s = Math.min(W / img.height, H / img.width);
      crtCtx.translate(W / 2, H / 2); crtCtx.rotate(-Math.PI / 2);
      crtCtx.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
    } else {                         // liggend: het middenstuk ter breedte van het scherm
      const sw = img.height * W / H;
      crtCtx.drawImage(img, (img.width - sw) / 2, 0, sw, img.height, 0, 0, W, H);
    }
    crtCtx.restore();
    crtTex.needsUpdate = true;
  }

  // ---------- Overgang ----------
  // Van lage PS1-resolutie naar scherp naarmate de camera het scherm nadert (eind = gewone pixels, net als de DOM-kopie)
  let base0 = 2;
  const sharpen = (k) => {
    const e = k * k;
    setRes(base0 + (1 - base0) * e);
    grain.style.opacity = String(.3 * (1 - e));
  };
  let busy = false;
  async function enter() {
    if (busy || done) return;
    if (!renderer) return finish();
    busy = true;
    layer.classList.add('going');
    const W = layer.clientWidth, H = layer.clientHeight;
    const img = drawDash(W, H, mode);
    img.className = 'kamer-copy';
    base0 = baseScale();
    renderer.setPixelRatio(1);

    if (mode === 'phone') {
      phoneScreen.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(img) });
      phoneScreen.material.map.colorSpace = THREE.SRGBColorSpace;
      // Openklappen en inzoomen tegelijk: eerst de eindstand uitrekenen met het klepje open
      lid.rotation.x = -.95 * Math.PI;
      const pose = poseFor(phoneScreen, .045, .06, 'w');
      lid.rotation.x = 0;
      await flyTo(pose, 520, (k) => { lid.rotation.x = -.95 * Math.PI * Math.min(1, k * 1.6); sharpen(k); });
      const r = rectOf(phoneScreen, .045, .06);
      grow(img, r, 'scale');
    } else if (mode === 'portrait') {
      screenImage(img, 'rot');
      await flyTo(poseFor(crtScreen, .32, .24, 'w'), 500, sharpen);
      grow(img, rectOf(crtScreen, .32, .24), 'rotate');
    } else {
      screenImage(img, 'mid');
      await flyTo(poseFor(crtScreen, .32, .24, 'h'), 500, sharpen);
      grow(img, rectOf(crtScreen, .32, .24), 'slide');
    }
  }

  // DOM-kopie van het scherm groeit tot het hele beeld, dan verdwijnt de laag en staat het echte dashboard er
  function grow(img, r, how) {
    const W = layer.clientWidth, H = layer.clientHeight;
    const wrap = document.createElement('div');
    wrap.className = 'kamer-copies';
    const ms = still ? 0 : 380;
    const opts = { duration: ms, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' };
    const anims = [];
    if (how === 'slide') {
      // Middenstuk staat precies in het scherm; linker- en rechterdeel schuiven er aan de zijkanten uit
      const part = (x0, x1, cls) => {
        const c = document.createElement('canvas');
        c.width = Math.round((x1 - x0) / W * img.width); c.height = img.height;
        c.getContext('2d').drawImage(img, x0 / W * img.width, 0, c.width, img.height, 0, 0, c.width, c.height);
        c.className = `kamer-part ${cls}`;
        Object.assign(c.style, { left: `${x0}px`, width: `${x1 - x0}px`, height: `${H}px` });
        wrap.append(c);
        return c;
      };
      const l = Math.max(0, r.l), rr = Math.min(W, r.l + r.w);
      const left = part(0, l, 'side'), right = part(rr, W, 'side'), mid = part(l, rr, 'mid');
      const sy = r.h / H;
      mid.style.transformOrigin = 'top';
      anims.push(mid.animate([{ transform: `translateY(${r.t}px) scaleY(${sy})` }, { transform: 'none' }], opts));
      anims.push(left.animate([{ transform: `translateX(${l}px)` }, { transform: 'none' }], opts));
      anims.push(right.animate([{ transform: `translateX(${-(W - rr)}px)` }, { transform: 'none' }], opts));
    } else {
      Object.assign(img.style, { width: `${W}px`, height: `${H}px` });
      wrap.append(img);
      const cx = r.l + r.w / 2 - W / 2, cy = r.t + r.h / 2 - H / 2;
      const from = how === 'rotate'
        ? `translate(${cx}px, ${cy}px) rotate(-90deg) scale(${Math.min(r.w / H, r.h / W)})`
        : `translate(${cx}px, ${cy}px) scale(${r.w / W}, ${r.h / H})`;
      anims.push(img.animate([{ transform: from }, { transform: 'none' }], opts));
    }
    layer.append(wrap);
    cv.style.visibility = 'hidden';
    Promise.all(anims.map((a) => a.finished)).then(() => {
      document.body.classList.remove('kamer-on');
      window.dispatchEvent(new Event('resize'));
      const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 0 : 180, fill: 'forwards' });
      fade.finished.then(finish);
    });
  }

  // ---------- Bediening ----------
  function onKey(e) {
    if (busy || done || e.target.closest?.('input, textarea, dialog')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
  }
  addEventListener('keydown', onKey);
  box.addEventListener('click', () => enter());
  // #dashboard tijdens de kamer = meteen door
  addEventListener('hashchange', () => { if (location.hash === '#dashboard') finish(); });

  build().catch(() => finish());   // Three.js niet te laden: gewoon het dashboard
})();
