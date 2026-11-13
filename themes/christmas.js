'use strict';

// Kerst (15 t/m 26 december): sneeuwkapjes bovenop alle vakken, lampjes langs de topbalk die zachtjes knipperen,
// vallende sneeuw. Groet: 24 "Fijne kerstavond", 25/26 "Vrolijk kerstfeest", de dagen ervoor "Kerst over n dagen".
(() => {
  const { md, daysUntil, inDays } = DASH_THEMES.util;
  DASH_THEMES.add({
    id: 'kerst', name: 'Kerst', icon: '🎄', tier: 'feest', prio: 60, c1: '#2fbf71', c2: '#e63946', topbar: 'strong',
    aliases: { kerstavond: '12-24' },
    when: (day) => DASH_THEMES.util.between(day, '12-15', '12-26'),
    greeting(day, { fixed }) {
      if (md(day) === '12-24') return 'Fijne kerstavond 🎄';
      if (fixed || ['12-25', '12-26'].includes(md(day))) return 'Vrolijk kerstfeest 🎄';
      return { text: `Kerst ${inDays(daysUntil(day, '12-25'))}`, small: true };
    },
    bg: 'radial-gradient(60% 50% at 100% 0%, rgba(47,191,113,.14), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(230,57,70,.12), transparent 70%)',
    topDeco: { type: 'lights', colors: ['#ff5a5a', '#ffd25a', '#5aff9b', '#5ab4ff'] },
    deco: [{ type: 'cap', id: 'kapje', h: 13, svg: DASH_THEMES.util.snowCap }],
    particles: [{ kind: 'sneeuw', density: 1 }],
  });
})();
