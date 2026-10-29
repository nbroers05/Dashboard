'use strict';

// Valentijn (14 februari): roze.
DASH_THEMES.add({
  id: 'valentijn', name: 'Valentijn', icon: '💘', tier: 'feest', prio: 80, c1: '#ff5f8f', c2: '#ffb0c8', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '02-14',
  greeting: () => 'Fijne Valentijnsdag 💘',
});
