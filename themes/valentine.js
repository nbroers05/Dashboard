'use strict';

// Valentine's Day (14 February): pink accent, a heart in a corner of a few tiles and now and then a falling heart.
DASH_THEMES.add({
  id: 'valentine', name: "Valentine's Day", icon: '💘', tier: 'holiday', prio: 80, c1: '#ff5f8f', c2: '#ffb0c8', topbar: 'strong',
  when: (day) => DASH_THEMES.util.md(day) === '02-14',
  greeting: () => "Happy Valentine's Day 💘",
  bg: 'radial-gradient(60% 50% at 100% 0%, rgba(255,95,143,.16), transparent 70%)',
  topDeco: { type: 'garland', colors: ['#ff5f8f', '#ffb0c8', '#e6395f'] },
  deco: [{ type: 'corner', id: 'heart', size: 24, inset: [12, 12], max: 2, turn: 30, corners: ['tr', 'br', 'bl', 'tl'],
    svg: '<svg viewBox="0 0 24 24"><path d="M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z" fill="#ff5f8f"/></svg>' }],
  particles: [{ kind: 'heart', density: 0.25 }],
});
