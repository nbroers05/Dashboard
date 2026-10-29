'use strict';

// Lente (maart t/m mei): frisgroen.
DASH_THEMES.add({
  id: 'lente', name: 'Lente', icon: '🌸', tier: 'seizoen', prio: 10, c1: '#7fd67a', c2: '#ffb7d0',
  when: (day) => [2, 3, 4].includes(day.getMonth()),
});
