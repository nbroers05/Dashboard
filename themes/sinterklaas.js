'use strict';

// Sinterklaas (5 december): rood/goud.
DASH_THEMES.add({
  id: 'sinterklaas', name: 'Sinterklaas', icon: '🎁', tier: 'feest', prio: 80, c1: '#d62828', c2: '#f5c542', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '12-05',
  greeting: () => 'Fijne pakjesavond 🎁',
});
