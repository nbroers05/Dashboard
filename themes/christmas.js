'use strict';

// Christmas (15 to 26 December): snow caps on top of all tiles, lights along the top bar that blink softly,
// falling snow. Greeting: 24th "Happy Christmas Eve", 25th/26th "Merry Christmas", the days before "Christmas in n days".
(() => {
  const { md, daysUntil, inDays } = DASH_THEMES.util;
  DASH_THEMES.add({
    id: 'christmas', name: 'Christmas', icon: '🎄', tier: 'holiday', prio: 60, c1: '#2fbf71', c2: '#e63946', topbar: 'strong',
    aliases: { christmaseve: '12-24' },
    when: (day) => DASH_THEMES.util.between(day, '12-15', '12-26'),
    greeting(day, { fixed }) {
      if (md(day) === '12-24') return 'Happy Christmas Eve 🎄';
      if (fixed || ['12-25', '12-26'].includes(md(day))) return 'Merry Christmas 🎄';
      return { text: `Christmas ${inDays(daysUntil(day, '12-25'))}`, small: true };
    },
    bg: 'radial-gradient(60% 50% at 100% 0%, rgba(47,191,113,.14), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(230,57,70,.12), transparent 70%)',
    topDeco: { type: 'lights', colors: ['#ff5a5a', '#ffd25a', '#5aff9b', '#5ab4ff'] },
    deco: [{ type: 'cap', id: 'cap', h: 13, svg: DASH_THEMES.util.snowCap }],
    particles: [{ kind: 'snow', density: 1 }],
  });
})();
