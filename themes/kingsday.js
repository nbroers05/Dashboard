'use strict';

// King's Day (27 April, or the 26th when the 27th is a Sunday): orange, flags along the top bar.
DASH_THEMES.add({
  id: 'kingsday', name: "King's Day", icon: '👑', tier: 'holiday', prio: 80, c1: '#ff8a1f', c2: '#ffb066', topbar: 'strong',
  when(day) {
    let king = new Date(day.getFullYear(), 3, 27, 12);
    if (king.getDay() === 0) king = new Date(day.getFullYear(), 3, 26, 12);
    return DASH_THEMES.util.md(king) === DASH_THEMES.util.md(day);
  },
  greeting: () => "Happy King's Day 👑",
  bg: 'radial-gradient(70% 50% at 50% 0%, rgba(255,138,31,.18), transparent 70%)',
  topDeco: { type: 'flags', colors: ['#ff8a1f', '#ae1c28', '#ffffff', '#21468b', '#ff8a1f'] },
});
