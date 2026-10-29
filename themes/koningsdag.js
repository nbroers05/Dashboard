'use strict';

// Koningsdag (27 april, of 26 als de 27e op zondag valt): oranje.
DASH_THEMES.add({
  id: 'koningsdag', name: 'Koningsdag', icon: '👑', tier: 'feest', prio: 80, c1: '#ff8a1f', c2: '#ffb066', topbar: 'strong',
  when(day) {
    let king = new Date(day.getFullYear(), 3, 27, 12);
    if (king.getDay() === 0) king = new Date(day.getFullYear(), 3, 26, 12);
    return DASH_THEMES.util.md(king) === DASH_THEMES.util.md(day);
  },
  greeting: () => 'Fijne Koningsdag 👑',
});
