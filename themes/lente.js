'use strict';

// Lente (maart t/m mei): frisgroen, bloesem op een hoek van een paar vakken, af en toe een blaadje bloesem.
DASH_THEMES.add({
  id: 'lente', name: 'Lente', icon: '🌸', tier: 'seizoen', prio: 10, c1: '#7fd67a', c2: '#ffb7d0',
  when: (day) => [2, 3, 4].includes(day.getMonth()),
  bg: 'radial-gradient(70% 55% at 0% 0%, rgba(127,214,122,.13), transparent 70%), radial-gradient(60% 50% at 100% 100%, rgba(255,183,208,.11), transparent 70%)',
  deco: [{ type: 'corner', id: 'bloesem', size: 44, inset: [0, 0], mirror: true, max: 3, corners: ['tr', 'tl', 'br', 'bl'],
    svg: '<svg viewBox="0 0 44 44"><path d="M0 4C10 8 18 14 26 26" stroke="#6b4a32" stroke-width="2" fill="none" stroke-linecap="round"/>'
      + '<g fill="#ffc8da"><circle cx="13" cy="9" r="4"/><circle cx="18" cy="13" r="4"/><circle cx="12" cy="15" r="4"/><circle cx="17" cy="7" r="3.4"/></g><circle cx="15" cy="11" r="1.8" fill="#e8708f"/>'
      + '<g fill="#ffe0ea"><circle cx="27" cy="22" r="3.4"/><circle cx="31" cy="26" r="3.4"/><circle cx="26" cy="28" r="3.4"/></g><circle cx="28" cy="25" r="1.5" fill="#e8708f"/>'
      + '<path d="M6 6q4-6 8-2-4 4-8 2z" fill="#7fd67a"/></svg>' }],
  particles: [{ kind: 'bloesem', density: 0.25 }],
});
