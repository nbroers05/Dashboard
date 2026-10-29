'use strict';

// Bevrijdingsdag (5 mei): rood-wit-blauw accent, vlaggetjes in rood-wit-blauw boven de topbalk.
DASH_THEMES.add({
  id: 'bevrijdingsdag', name: 'Bevrijdingsdag', icon: '🕊️', tier: 'feest', prio: 80, c1: '#e63946', c2: '#5b8def', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '05-05',
  greeting: () => 'Fijne Bevrijdingsdag 🕊️',
  bg: 'radial-gradient(60% 50% at 100% 0%, rgba(230,57,70,.12), transparent 70%), radial-gradient(60% 50% at 0% 0%, rgba(91,141,239,.12), transparent 70%)',
  topDeco: { type: 'flags', colors: ['#ae1c28', '#ffffff', '#21468b'] },
});
