'use strict';

// Sinterklaas (15 november t/m 5 december): rood/goud, slinger boven de topbalk, af en toe een vallende pepernoot,
// een cadeautje in een hoek. Op 5 december de groet "Fijne pakjesavond", de dagen ervoor "Pakjesavond over n dagen".
(() => {
  const { daysUntil, inDays } = DASH_THEMES.util;
  DASH_THEMES.kind('pepernoot', {
    init(p) { p.size = 4 + Math.random() * 2.5; p.vy = 0.9 + Math.random() * 0.6; p.vr = (Math.random() - 0.5) * 0.06; p.amp = 0.2; p.a = 0.9; },
    draw(ctx, p, s) {
      const z = p.size * s;
      ctx.fillStyle = '#9a5a2a';
      ctx.beginPath(); ctx.ellipse(0, 0, z, z * 0.82, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,170,.35)';
      ctx.beginPath(); ctx.ellipse(-z * 0.3, -z * 0.3, z * 0.35, z * 0.25, 0, 0, 6.28); ctx.fill();
    },
  });
  DASH_THEMES.add({
    id: 'sinterklaas', name: 'Sinterklaas', icon: '🎁', tier: 'feest', prio: 60, c1: '#d62828', c2: '#f5c542', topbar: 'strong',
    when: (day) => DASH_THEMES.util.between(day, '11-15', '12-05'),
    greeting(day, { fixed }) {
      const n = daysUntil(day, '12-05');
      return fixed || n === 0 ? 'Fijne pakjesavond 🎁' : { text: `Pakjesavond ${inDays(n)}`, small: true };
    },
    bg: 'radial-gradient(60% 50% at 100% 0%, rgba(214,40,40,.17), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(245,197,66,.1), transparent 70%)',
    topDeco: { type: 'garland', colors: ['#d62828', '#f5c542', '#ffffff', '#d62828'] },
    deco: [{ type: 'corner', id: 'cadeau', size: 30, inset: [10, 10], max: 1, turn: 16, corners: ['br', 'tr', 'bl'],
      svg: '<svg viewBox="0 0 30 30"><rect x="4" y="11" width="22" height="16" rx="2" fill="#d62828"/><rect x="2" y="7" width="26" height="6" rx="1.5" fill="#e84a4a"/>'
        + '<rect x="13" y="7" width="4" height="20" fill="#f5c542"/><path d="M15 7c-3-6-9-5-7-1 1 2 5 1 7 1zm0 0c3-6 9-5 7-1-1 2-5 1-7 1z" fill="none" stroke="#f5c542" stroke-width="2"/></svg>' }],
    particles: [{ kind: 'pepernoot', density: 0.2 }],
  });
})();
