'use strict';

// Tentamenweek: een week (ma-zo) met een tentamen in je agenda.
DASH_THEMES.add({
  id: 'tentamen', name: 'Tentamenweek', icon: '📚', tier: 'event', prio: 50, c1: '#8fa3bf', c2: '#56657a',
  when() { return false; },
});
