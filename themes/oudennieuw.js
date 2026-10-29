'use strict';

// Oud en Nieuw (31 december en 1 januari): goud, vuurwerk op oudejaarsdag.
DASH_THEMES.add({
  id: 'oudennieuw', name: 'Oud en Nieuw', icon: '🎆', tier: 'feest', prio: 80, topbar: 'strong',
  c1: '#f5c542', c2: '#ffe9a8', colors: (day) => (DASH_THEMES.util.md(day) === '01-01' ? ['#f5c542', '#fff1b8'] : ['#f5c542', '#ffe9a8']),
  aliases: { oudjaar: '12-31', nieuwjaar: '01-01' },
  when: (day) => ['12-31', '01-01'].includes(DASH_THEMES.util.md(day)),
  greeting: (day) => (DASH_THEMES.util.md(day) === '01-01' ? 'Gelukkig nieuwjaar! 🎆' : 'Fijne jaarwisseling 🥂'),
  fx: (day) => (DASH_THEMES.util.md(day) === '12-31' ? 'vuurwerk' : null),
});
