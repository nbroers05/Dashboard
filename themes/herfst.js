'use strict';

// Herfst (september t/m november): warme oranje/bruine tint.
DASH_THEMES.add({
  id: 'herfst', name: 'Herfst', icon: '🍂', tier: 'seizoen', prio: 10, c1: '#d9772b', c2: '#7a3f1d',
  when: (day) => [8, 9, 10].includes(day.getMonth()),
});
