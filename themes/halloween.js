'use strict';

// Halloween (24 t/m 31 oktober): oranje/paars, spinnenweb in een hoek van een paar vakken, een spinnetje dat één keer
// langzaam aan een draadje zakt (bij beweging beperken hangt hij meteen stil), lampjes boven de topbalk, pompoen in de
// dagregel. Groet "Happy Halloween" op de 31e, de dagen ervoor "Halloween over n dagen".
(() => {
  const { daysUntil, inDays } = DASH_THEMES.util;
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  // Web vanuit de hoek linksboven (0,0); andere hoeken worden gespiegeld
  function web(R) {
    const ang = [2, 22, 45, 68, 88].map((a) => (a * Math.PI) / 180);
    let d = '';
    for (const a of ang) d += `M0 0L${p(R, a)}`;
    for (const r of [R * 0.24, R * 0.43, R * 0.63, R * 0.84]) {
      for (let i = 0; i < ang.length - 1; i++) d += `M${p(r, ang[i])}Q${p(r * 0.84, (ang[i] + ang[i + 1]) / 2)} ${p(r, ang[i + 1])}`;
    }
    return `<svg viewBox="0 0 ${R} ${R}"><path d="${d}" fill="none" stroke="rgba(236,232,248,.5)" stroke-width="1"/></svg>`;
  }
  const SPIDER = '<i class="th-thread"></i><svg class="th-bug" viewBox="0 0 20 18"><g stroke="#1b1424" stroke-width="1.3" fill="none" stroke-linecap="round">'
    + '<path d="M7 8 2 4M7 10 1 10M7 12 2 16M13 8l5-4M13 10h6M13 12l5 4"/></g><ellipse cx="10" cy="10" rx="4.2" ry="5" fill="#1b1424"/>'
    + '<circle cx="10" cy="5.6" r="2.6" fill="#1b1424"/><circle cx="9" cy="5.2" r=".7" fill="#ff8a1f"/><circle cx="11" cy="5.2" r=".7" fill="#ff8a1f"/></svg>';

  DASH_THEMES.add({
    id: 'halloween', name: 'Halloween', icon: '🎃', tier: 'feest', prio: 60, c1: '#ff8a1f', c2: '#8b5cf6', topbar: 'strong',
    when: (day) => DASH_THEMES.util.between(day, '10-24', '10-31'),
    greeting(day, { fixed }) {
      const n = daysUntil(day, '10-31');
      return fixed || n === 0 ? 'Happy Halloween 🎃' : { text: `Halloween ${inDays(n)}`, small: true };
    },
    dayIcon: '🎃',
    bg: 'radial-gradient(60% 50% at 100% 0%, rgba(139,92,246,.2), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(255,138,31,.15), transparent 70%)',
    topDeco: { type: 'lights', colors: ['#ff8a1f', '#8b5cf6', '#ffb347', '#b48cff'] },
    deco: [
      { type: 'corner', id: 'spin', size: 64, inset: [0, 0], mirror: true, max: 2, corners: ['tr', 'tl', 'br', 'bl'], svg: () => web(64) },
      { type: 'corner', id: 'spider', w: 22, h: 60, inset: [64, 0], max: 1, corners: ['tr', 'tl'], svg: SPIDER },
    ],
    css: `
.th-spider .th-thread { position: absolute; left: 10px; top: 0; width: 1px; height: calc(100% - 14px); background: rgba(236, 232, 248, .55); transform-origin: top; animation: th-thread 7s cubic-bezier(.2, .7, .3, 1) both; }
.th-spider > svg.th-bug { position: absolute; left: 1px; bottom: 0; width: 20px; height: 18px; transform: none; animation: th-drop 7s cubic-bezier(.2, .7, .3, 1) both; }
@keyframes th-thread { from { transform: scaleY(.04); } to { transform: scaleY(1); } }
@keyframes th-drop { from { transform: translateY(-44px); } to { transform: translateY(0); } }`,
  });
})();
