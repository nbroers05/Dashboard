'use strict';

// Winter (december t/m februari): koele blauwe tint.
DASH_THEMES.add({
  id: 'winter', name: 'Winter', icon: '❄️', tier: 'seizoen', prio: 10, c1: '#7fb3ff', c2: '#2c4a7a',
  when: (day) => [11, 0, 1].includes(day.getMonth()),
});
