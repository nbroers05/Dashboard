'use strict';

// Halloween (31 oktober): oranje/paars.
DASH_THEMES.add({
  id: 'halloween', name: 'Halloween', icon: '🎃', tier: 'feest', prio: 80, c1: '#ff8a1f', c2: '#8b5cf6', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '10-31',
  greeting: () => 'Happy Halloween 🎃',
});
