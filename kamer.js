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
    <button type="button" class="kamer-box">
      <span class="kamer-who">Kamer</span>
      <span class="kamer-line"></span>
    </button>`;
  document.body.prepend(layer);
  document.body.classList.add('kamer-on');
  const cv = layer.querySelector('.kamer-gl');
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
  const setLine = () => {
    line.textContent = mode === 'phone'
      ? `Het is ${clock()}. Tik op je telefoon.`
      : `Het is ${clock()}. Klik op de monitor of druk op Enter.`;
  };
  setLine();

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
  const daypart = () => { const h = new Date().getHours(); return h >= 8 && h < 17 ? 'dag' : h >= 17 && h < 20 ? 'avond' : 'nacht'; };

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

  async function build() {
    THREE = await import(THREE_URL);
    if (done) return;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, 0.01, 50);
    const p = PAL[daypart()];
    scene.background = new THREE.Color(p.ceil);

    const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
    const boxAt = (w, h, d, x, y, z, color, parent = scene) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color) : color);
      m.position.set(x, y, z); parent.add(m); return m;
    };

    // Kamer: x 0..4 (linkermuur op x=0), z 0..4 (achtermuur op z=0), y 0..2.6
    boxAt(4, .02, 4, 2, -.01, 2, p.floor);
    boxAt(4, .02, 4, 2, 2.61, 2, p.ceil);
    boxAt(4, 2.6, .02, 2, 1.3, -.01, p.wallB);
    boxAt(.02, 2.6, 4, -.01, 1.3, 2, p.wallL);
    // Raam met jaloezieën (linkermuur)
    boxAt(.04, 1.2, 1.5, .01, 1.55, 2.0, 0xe8e0c8);
    boxAt(.02, 1.08, 1.38, .03, 1.55, 2.0, new THREE.MeshBasicMaterial({ color: p.sky }));
    for (let i = 0; i < 9; i++) boxAt(.03, .04, 1.36, .05, 2.04 - i * .12, 2.0, 0xd8d0b4);
    const sun = new THREE.DirectionalLight(p.sun, p.sunI);
    sun.position.set(-2, 2.4, 2.2); sun.target.position.set(2, 0, 1.8);
    scene.add(sun, sun.target);
    scene.add(new THREE.AmbientLight(0xffffff, p.amb));
    // Kleed
    boxAt(1.6, .01, 1.2, 1.5, .005, 2.2, 0xb8324a);
    // Bureau tegen de achtermuur
    boxAt(1.5, .05, .7, 1.6, .73, .35, 0x8a6440);
    for (const [lx, lz] of [[.9, .05], [2.3, .05], [.9, .65], [2.3, .65]]) boxAt(.05, .73, .05, lx, .365, lz, 0x5e4229);
    // CRT: beige kast met bol scherm (schermvlak 0,32 × 0,24 = 4:3)
    crt = new THREE.Group(); crt.position.set(1.55, .755, .3); scene.add(crt);
    boxAt(.2, .03, .18, 0, .015, 0, 0xb5ac92, crt);
    boxAt(.42, .38, .42, 0, .22, 0, 0xd8d0b8, crt);
    boxAt(.3, .28, .2, 0, .22, -.28, 0xc9c0a6, crt);
    const tc = document.createElement('canvas'); tc.width = 640; tc.height = 480;
    crtCtx = tc.getContext('2d');
    crtTex = new THREE.CanvasTexture(tc); crtTex.colorSpace = THREE.SRGBColorSpace;
    crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(.32, .24), new THREE.MeshBasicMaterial({ map: crtTex }));
    crtScreen.position.set(0, .23, .211); crt.add(crtScreen);
    boxAt(.012, .008, .005, .17, .05, .212, new THREE.MeshBasicMaterial({ color: 0x4ade80 }), crt);
    const glow = new THREE.PointLight(0x4aa8ff, .6, 1.6); glow.position.set(0, .23, .5); crt.add(glow);
    crtIdle();
    // Toetsenbord, muis, pc-kast, lamp, cd-plank, posters
    boxAt(.44, .025, .15, 1.55, .765, .6, 0xe0d8c0);
    boxAt(.06, .02, .1, 1.95, .76, .6, 0xe0d8c0);
    boxAt(.2, .45, .45, 2.15, .225, .3, 0xd8d0b8);
    boxAt(.04, 1.5, .04, .45, .75, .35, 0xc8c0a8);
    boxAt(.2, .14, .2, .45, 1.55, .35, mat(0xf2b45a, { emissive: 0xf2b45a, emissiveIntensity: .5 }));
    const lamp = new THREE.PointLight(0xffb35c, p.lamp, 3.5); lamp.position.set(.45, 1.4, .45); scene.add(lamp);
    boxAt(.9, .03, .2, 1.6, 1.45, .1, 0x7a5638);
    ['#d84a4a', '#f2d14a', '#3a6ad8', '#e8e8e8', '#2a2a2a', '#55c3a8', '#e0457b', '#f28a3a', '#8a5ad8', '#e8e8e8']
      .forEach((c, i) => boxAt(.025, .14, .12, 1.25 + i * .045, 1.535, .1, new THREE.Color(c).getHex()));
    boxAt(.7, .9, .01, 3.0, 1.6, .005, 0x2b2b6e);
    boxAt(.7, .35, .012, 3.0, 1.32, .006, 0xe0457b);
    boxAt(.4, .55, .01, 3.65, 1.55, .005, 0x55c3a8);
    // PS2 + controller op de vloer
    boxAt(.3, .07, .2, 1.4, .045, 2.1, 0x1c1c24);
    boxAt(.12, .03, .07, 1.7, .025, 2.4, 0x2a2a34);
    // Bed rechts tegen de achtermuur, klaptelefoon op het dekbed
    boxAt(1.0, .35, 2.0, 3.45, .175, 1.05, 0x2c3fa8);
    boxAt(1.0, .1, 2.0, 3.45, .4, 1.05, 0x3f5bd8);
    boxAt(.7, .12, .35, 3.45, .51, .25, 0xf4f4f4);
    boxAt(1.05, .7, .06, 3.45, .35, .02, 0x5e4229);
    // Klaptelefoon: onderkant ligt plat, het klepje scharniert aan de verre kant (kleinere z)
    phone = new THREE.Group(); phone.position.set(3.3, .455, 1.25); phone.rotation.y = -.35; phone.scale.setScalar(1.6); scene.add(phone);
    boxAt(.055, .014, .1, 0, .007, 0, 0xc8ccd8, phone);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) boxAt(.01, .003, .008, -.015 + k * .015, .015, .01 + r * .018, 0x7a8090, phone);
    lid = new THREE.Group(); lid.position.set(0, .016, -.05); phone.add(lid);
    boxAt(.055, .012, .1, 0, .006, .05, 0xc8ccd8, lid);
    boxAt(.03, .002, .018, 0, .0125, .06, new THREE.MeshBasicMaterial({ color: 0x7fd0ff }), lid);   // klein buitenschermpje
    phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(.045, .06), new THREE.MeshBasicMaterial({ color: 0x7fd0ff }));
    phoneScreen.rotation.x = Math.PI / 2;           // naar de onderkant van het klepje, "boven" = weg van het scharnier
    phoneScreen.position.set(0, -.0005, .05); lid.add(phoneScreen);

    onResize();
    addEventListener('resize', onResize);
    cv.addEventListener('pointermove', (e) => { cv.style.cursor = hit(e) ? 'pointer' : ''; });
    cv.addEventListener('click', (e) => { if (hit(e)) enter(); });
    setInterval(() => { if (!busy && !done) { setLine(); crtIdle(); draw(); } }, 20000);
    layer.classList.add('ready');
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
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    mode = modeNow();
    setLine(); crtIdle();
    place();
    draw();
  }

  const ray = () => new THREE.Raycaster();
  function hit(e) {
    if (!renderer || busy) return false;
    const r = cv.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = ray(); rc.setFromCamera(v, camera);
    return rc.intersectObject(mode === 'phone' ? phone : crt, true).length > 0;
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
  let busy = false;
  async function enter() {
    if (busy || done) return;
    if (!renderer) return finish();
    busy = true;
    layer.classList.add('going');
    const W = layer.clientWidth, H = layer.clientHeight;
    const img = drawDash(W, H, mode);
    img.className = 'kamer-copy';

    if (mode === 'phone') {
      phoneScreen.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(img) });
      phoneScreen.material.map.colorSpace = THREE.SRGBColorSpace;
      // Openklappen en inzoomen tegelijk: eerst de eindstand uitrekenen met het klepje open
      lid.rotation.x = -.95 * Math.PI;
      const pose = poseFor(phoneScreen, .045, .06, 'w');
      lid.rotation.x = 0;
      await flyTo(pose, 520, (k) => { lid.rotation.x = -.95 * Math.PI * Math.min(1, k * 1.6); });
      const r = rectOf(phoneScreen, .045, .06);
      grow(img, r, 'scale');
    } else if (mode === 'portrait') {
      screenImage(img, 'rot');
      await flyTo(poseFor(crtScreen, .32, .24, 'w'), 500);
      grow(img, rectOf(crtScreen, .32, .24), 'rotate');
    } else {
      screenImage(img, 'mid');
      await flyTo(poseFor(crtScreen, .32, .24, 'h'), 500);
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
