'use strict';

// Kerst (24-26 december).
DASH_THEMES.add({
  id: 'kerst', name: 'Kerst', icon: '🎄', tier: 'feest', prio: 80, c1: '#2fbf71', c2: '#e63946', topbar: 'strong',
  aliases: { kerstavond: '12-24' },
  when: (day) => ['12-24', '12-25', '12-26'].includes(DASH_THEMES.util.md(day)),
  greeting: (day) => (DASH_THEMES.util.md(day) === '12-24' ? 'Fijne kerstavond 🎄' : 'Vrolijk kerstfeest 🎄'),
});
