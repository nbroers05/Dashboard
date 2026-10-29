'use strict';

// Pasen (eerste en tweede paasdag): pastel.
DASH_THEMES.add({
  id: 'pasen', name: 'Pasen', icon: '🐣', tier: 'feest', prio: 80, c1: '#f7d154', c2: '#8fd694', topbar: 'strong',
  when(day) {
    const { easter, addDays, md } = DASH_THEMES.util, e = easter(day.getFullYear());
    return [md(e), md(addDays(e, 1))].includes(md(day));
  },
  greeting: () => 'Vrolijk Pasen 🐣',
});
