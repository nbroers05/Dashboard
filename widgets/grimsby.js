'use strict';

// Grimsby, the AI crow (repo nbroers05/grimsby, site https://nbroers05.github.io/grimsby/), in the rotating tile on tall.
// Light on purpose: not his whole 3D world, only the small cut-out around the place he is now (world/spots/<id>.json,
// 5-70 KB), drawn once into a picture with three.js. The WebGL context is thrown away right after, so nothing keeps
// running. The look (colours, moods, the crow) and the choice of place come from his site (look.js, place.js), so the
// picture always matches the site.
DASH.widget('w-grimsby', (card, body, guard) => {
  const { h } = DASH;
  const SITE = 'https://nbroers05.github.io/grimsby/';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  const SLEEP_AFTER = 2 * 60 * 60 * 1000;           // last run longer ago = the PC is off = he sleeps (same as his site)
  const PIC_W = 380, PIC_H = 260;
  let libs = null, pois = null, data = null, picKey = '', picUrl = '';

  const load3d = () => libs || (libs = Promise.all([import(THREE_URL), import(`${SITE}look.js`), import(`${SITE}place.js`)]));
  const mood = () => (document.documentElement.dataset.mood === 'titlecard' ? 'titlecard' : 'digital');
  const clean = (s) => String(s == null ? '' : s).trim();
  const hm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

  function doing(e) {
    const d = (e && e.detail) || {};
    if (!e) return 'Just woke up.';
    if (e.action === 'search') return `Looked up: ${clean(d.query || d.title).toLowerCase()}`;
    if (e.action === 'diary') return `Wrote about ${clean(d.topic || 'something').toLowerCase()}`;
    if (e.action === 'draw') return `Drew ${clean(d.title || 'something')}`;
    return clean(e.line);
  }

  // One still picture of him at his place
  async function picture(place, asleep, action, m) {
    const [THREE, L, P] = await load3d();
    const spot = await DASH.getJSON(`${SITE}world/spots/${place.poi.id}.json`);
    const scene = new THREE.Scene();
    const look = L.makeLook(THREE);
    scene.add(look.hemi, look.sun);
    look.applyMood(scene, m, [70, 190]);
    const solid = [];
    for (const [name, ints] of Object.entries(spot.layers)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(ints, (v) => v * spot.unit), 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, look.mats[name] || look.mats.walls);
      scene.add(mesh);
      if (['roofs', 'walls', 'greenhouse'].includes(name)) solid.push(mesh);
    }
    const ray = new THREE.Raycaster();
    const heightAt = (x, z) => {
      ray.set(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(solid, false)[0];
      return hit ? hit.point.y : 0;
    };
    const [px, py, pz] = P.perch(place.poi, heightAt, true);
    const crow = look.makeCrow();
    crow.group.position.set(px, py, pz);
    crow.group.rotation.y = -Math.PI / 4 - 0.45;     // side view, turned a little towards us
    look.restPose(crow, asleep, action);
    const ring = look.ring();
    ring.position.set(px, py + 0.25, pz);
    scene.add(crow.group, ring);

    const camera = new THREE.PerspectiveCamera(34, PIC_W / PIC_H, 0.5, 600);
    const aim = new THREE.Vector3(px, py + 2.5, pz);
    camera.position.copy(aim).add(new THREE.Vector3(-0.62, 0.42, 0.66).setLength(34));
    camera.lookAt(aim);
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    try {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(PIC_W, PIC_H, false);
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    } finally {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }

  function render(asleep, place, P) {
    const st = data.state || {};
    const name = clean((st.persona || {}).name) || 'Grimsby';
    const entry = data.log[data.log.length - 1];
    const diary = (st.recent_diary || []).slice(-1)[0];

    const pic = h('a', 'gb-pic');
    pic.href = SITE; pic.target = '_blank'; pic.rel = 'noopener';
    pic.title = `${name}'s site`;
    if (picUrl) {
      const img = h('img');
      img.src = picUrl; img.alt = asleep ? `${name} asleep on his roof` : `${name} at his place in Berkel en Rodenrijs`;
      img.width = PIC_W; img.height = PIC_H;
      pic.append(img);
    } else pic.append(h('span', 'gb-pic-wait', '鳥'));
    if (asleep) pic.append(h('span', 'gb-zzz', 'zzz'));

    const text = h('div', 'gb-text');
    const head = h('div', 'gb-head');
    head.append(h('span', 'gb-name', name), h('span', `gb-state${asleep ? '' : ' awake'}`, asleep ? 'asleep' : 'awake'));
    text.append(head);
    text.append(h('p', 'gb-doing', asleep ? 'Asleep. The computer was off.' : doing(entry)));
    if (place) text.append(h('p', 'gb-where', P.whereText(place, asleep)));
    if (diary && diary.text) {
      const q = h('div', 'gb-diary');
      q.append(h('span', 'gb-label', 'from the diary'), h('p', 'gb-quote', clean(diary.text)));
      text.append(q);
    }
    const foot = h('div', 'gb-foot');
    const mood = clean((st.mood || {}).word);
    foot.append(h('span', 'gb-meta', [st.last_run ? `last awake ${hm(st.last_run)}` : '', mood && !asleep ? `mood: ${mood}` : ''].filter(Boolean).join(' · ')));
    const a = h('a', 'gb-link', 'To his site');
    a.href = SITE; a.target = '_blank'; a.rel = 'noopener';
    foot.append(a);
    text.append(foot);

    const wrap = h('div', 'gb-wrap');
    wrap.append(pic, text);
    body.replaceChildren(wrap);
  }

  async function draw() {
    if (!data) return;
    const st = data.state || {};
    const lastRun = st.last_run ? new Date(st.last_run).getTime() : 0;
    const asleep = !lastRun || Date.now() - lastRun > SLEEP_AFTER;
    const entry = data.log[data.log.length - 1];
    let place = null, P = null;
    try {
      const mods = await load3d();
      P = mods[2];
      if (!pois) pois = (await DASH.getJSON(`${SITE}world/poi.json`)).pois;
      place = P.placeFor(entry, asleep, pois);
      const key = `${place.poi && place.poi.id}|${asleep}|${entry && entry.action}|${mood()}`;
      if (key !== picKey && place.poi) {
        picUrl = await picture(place, asleep, entry && entry.action, mood());
        picKey = key;
      }
    } catch (e) {
      console.warn('[grimsby] no picture, text only', e);   // no WebGL or his site is down: the text still shows
      if (!P) place = null;
    }
    render(asleep, place, P || { whereText: () => '' });
  }

  const load = guard(async () => {
    try {
      const t = Math.floor(Date.now() / 300000);
      const [state, log] = await Promise.all([
        DASH.getJSON(`${SITE}state.json?t=${t}`),
        DASH.getJSON(`${SITE}log.json?t=${t}`),
      ]);
      data = { state, log: (Array.isArray(log) ? log : []).filter((e) => e && e.ok && !e.withheld) };
      await draw();
    } catch (e) {
      console.warn('[grimsby]', e);
      if (!data) body.replaceChildren(DASH.problem('Grimsby\'s site couldn\'t be reached. It tries again in 10 minutes.', 'Try again', load));
    }
  });

  // Day and night: the picture follows the dashboard's mood (html[data-mood], set by housestyle.js)
  new MutationObserver(guard(() => { if (data) draw(); })).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mood'] });
  DASH.every(10 * 60 * 1000, load);
  load();
});
