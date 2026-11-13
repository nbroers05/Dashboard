'use strict';

// Liberation Day (5 May): red-white-blue accent, red-white-blue flags above the top bar.
DASH_THEMES.add({
  id: 'liberationday', name: 'Liberation Day', icon: '🕊️', tier: 'holiday', prio: 80, c1: '#e63946', c2: '#5b8def', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '05-05',
  greeting: () => 'Happy Liberation Day 🕊️',
  bg: 'radial-gradient(60% 50% at 100% 0%, rgba(230,57,70,.12), transparent 70%), radial-gradient(60% 50% at 0% 0%, rgba(91,141,239,.12), transparent 70%)',
  topDeco: { type: 'flags', colors: ['#ae1c28', '#ffffff', '#21468b'] },
});
