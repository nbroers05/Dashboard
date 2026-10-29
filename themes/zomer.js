'use strict';

// Zomer (juni t/m augustus): warme gloed bovenaan en zachte zonnestralen achter de topbalk (stilstaand, in de achtergrond).
DASH_THEMES.add({
  id: 'zomer', name: 'Zomer', icon: '☀️', tier: 'seizoen', prio: 10, c1: '#ffc24a', c2: '#ff7a3d', noSun: true,
  when: (day) => [5, 6, 7].includes(day.getMonth()),
  bg: 'radial-gradient(80% 40% at 50% 0%, rgba(255,190,90,.22), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(255,122,61,.08), transparent 70%)',
  css: `html[data-season="zomer"] .th-bg::after { content: ''; position: absolute; inset: 0;
  background: repeating-conic-gradient(from -90deg at 50% -6%, rgba(255, 222, 150, .07) 0deg 3deg, transparent 3deg 11deg);
  -webkit-mask-image: radial-gradient(70% 38% at 50% 0%, #000 20%, transparent 80%); mask-image: radial-gradient(70% 38% at 50% 0%, #000 20%, transparent 80%); }`,
});
