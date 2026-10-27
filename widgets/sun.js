'use strict';

// Zonsopkomst/-ondergang voor Rotterdam, zelf uitgerekend (geen internet nodig).
DASH.widget('w-sun', (card, body, guard) => {
  const { h, fmtTime } = DASH;
  const LAT = 51.9225, LON = 4.4792;

  // Rekenmethode zoals in SunCalc (Vladimir Agafonkin), zonsrand 0,833° onder de horizon
  const RAD = Math.PI / 180, DAY = 86400000, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009, E = RAD * 23.4397;
  const toDays = (ms) => ms / DAY - 0.5 + J1970 - J2000;
  const fromJulian = (j) => (j + 0.5 - J1970) * DAY;

  function sunTimes(ms) {
    const lw = RAD * -LON, phi = RAD * LAT;
    const n = Math.round(toDays(ms) - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = RAD * (357.5291 + 0.98560028 * ds);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(E) * Math.sin(L));
    const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const w = Math.acos((Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    const set = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return { rise: fromJulian(noon - (set - noon)), set: fromJulian(set) };
  }

  const dur = (ms) => {
    const m = Math.round(ms / 60000);
    return `${Math.floor(m / 60)}u ${String(m % 60).padStart(2, '0')}m`;
  };

  function render() {
    const noon = new Date(); noon.setHours(12, 0, 0, 0);
    const today = sunTimes(noon.getTime());
    const yesterday = sunTimes(noon.getTime() - DAY);
    const len = today.set - today.rise;
    const diff = Math.round((len - (yesterday.set - yesterday.rise)) / 1000);
    const abs = Math.abs(diff);
    const diffText = `${Math.floor(abs / 60)} min ${abs % 60} s ${diff < 0 ? 'korter' : 'langer'} dan gisteren`;
    body.replaceChildren(arc(today), h('div', 'w-sub sun-foot', `Daglengte ${dur(len)} · ${diffText}`));
  }

  // Boog van opkomst (links) naar ondergang (rechts), met de zon op de plek van nu
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  function arc(t) {
    const now = Date.now();
    const p = Math.min(1, Math.max(0, (now - t.rise) / (t.set - t.rise)));
    const up = now >= t.rise && now <= t.set;
    const R = 86, CX = 100, CY = 96;
    const a = Math.PI * (1 - p);
    const x = CX + R * Math.cos(a), y = CY - R * Math.sin(a);

    const s = svg('svg', { viewBox: '0 0 200 104', class: 'sun-arc', role: 'img', 'aria-label': `Zon op ${fmtTime(t.rise)}, onder ${fmtTime(t.set)}` });
    s.append(
      svg('line', { x1: 4, y1: CY, x2: 196, y2: CY, class: 'sun-horizon' }),
      svg('path', { d: `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`, class: 'sun-path' }),
    );
    if (p > 0) s.append(svg('path', { d: `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`, class: 'sun-done' }));
    s.append(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 9, class: up ? 'sun-ball' : 'sun-ball down' }));

    const labels = h('div', 'sun-labels');
    const l = h('div'); l.append(h('span', 'w-sub', 'Zon op'), h('b', null, fmtTime(t.rise)));
    const r = h('div'); r.append(h('span', 'w-sub', 'Zon onder'), h('b', null, fmtTime(t.set)));
    labels.append(l, r);

    const wrap = h('div', 'sun-wrap');
    wrap.append(s, labels);
    return wrap;
  }

  DASH.every(60 * 1000, guard(render));
  render();
});
