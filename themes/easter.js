'use strict';

// Easter (Easter Sunday and Easter Monday): pastel, an egg in a corner of a few tiles, a pastel garland above the top bar.
(() => {
  const EGGS = [['#f7d154', '#8fd694'], ['#b9a6ff', '#ffd1e3'], ['#8fd6f0', '#f7d154']];
  let k = 0;
  const egg = () => {
    const [a, b] = EGGS[k++ % EGGS.length];
    return `<svg viewBox="0 0 26 32"><path d="M13 1C6 1 1 12 1 20a12 12 0 0 0 24 0C25 12 20 1 13 1z" fill="${a}"/>`
      + `<path d="M2.5 15q5 4 10.5 0t10.5 0" stroke="${b}" stroke-width="3" fill="none"/><circle cx="8" cy="23" r="1.6" fill="${b}"/><circle cx="14" cy="25" r="1.6" fill="${b}"/><circle cx="19" cy="22" r="1.6" fill="${b}"/></svg>`;
  };
  DASH_THEMES.add({
    id: 'easter', name: 'Easter', icon: '🐣', tier: 'holiday', prio: 80, c1: '#f7d154', c2: '#8fd694', topbar: 'strong',
    when(day) {
      const { easter, addDays, md } = DASH_THEMES.util, e = easter(day.getFullYear());
      return [md(e), md(addDays(e, 1))].includes(md(day));
    },
    greeting: () => 'Happy Easter 🐣',
    bg: 'radial-gradient(60% 50% at 100% 0%, rgba(247,209,84,.13), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(185,166,255,.12), transparent 70%)',
    topDeco: { type: 'garland', colors: ['#f7d154', '#8fd694', '#b9a6ff', '#ffd1e3'] },
    deco: [{ type: 'corner', id: 'egg', w: 22, h: 27, inset: [12, 10], max: 2, turn: 24, corners: ['br', 'tr', 'bl'], svg: egg }],
  });
})();
