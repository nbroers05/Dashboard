'use strict';

// Bevrijdingsdag (5 mei): rood-wit-blauw.
DASH_THEMES.add({
  id: 'bevrijdingsdag', name: 'Bevrijdingsdag', icon: '🕊️', tier: 'feest', prio: 80, c1: '#e63946', c2: '#5b8def', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '05-05',
  greeting: () => 'Fijne Bevrijdingsdag 🕊️',
});
