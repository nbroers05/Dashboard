'use strict';

// Zomer (juni t/m augustus): warme gloed.
DASH_THEMES.add({
  id: 'zomer', name: 'Zomer', icon: '☀️', tier: 'seizoen', prio: 10, c1: '#ffc24a', c2: '#ff7a3d',
  when: (day) => [5, 6, 7].includes(day.getMonth()),
});
