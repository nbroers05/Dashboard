'use strict';

// Herfst (september t/m november): warme oranje/bruine tint, een blaadje op een hoek van een paar vakken,
// af en toe een vallend blad (deeltjes 'blad', achter de vakken).
(() => {
  const COLORS = ['#d9772b', '#c4501f', '#e3a33a', '#b5652a'];
  let k = 0;
  const leaf = () => {
    const c = COLORS[k++ % COLORS.length];
    return `<svg viewBox="0 0 40 40"><path d="M20 3C26 9 33 12 35 20c-5 1-8 4-8 10-3-2-5-1-7 4-2-5-4-6-7-4 0-6-3-9-8-10C7 12 14 9 20 3Z" fill="${c}"/>`
      + '<path d="M20 9v29" stroke="rgba(70,30,10,.6)" stroke-width="1.4" stroke-linecap="round"/></svg>';
  };
  DASH_THEMES.add({
    id: 'herfst', name: 'Herfst', icon: '🍂', tier: 'seizoen', prio: 10, c1: '#d9772b', c2: '#7a3f1d',
    when: (day) => [8, 9, 10].includes(day.getMonth()),
    bg: 'radial-gradient(70% 55% at 0% 0%, rgba(217,119,43,.15), transparent 70%), radial-gradient(60% 50% at 100% 100%, rgba(150,75,30,.17), transparent 70%)',
    deco: [{ type: 'corner', id: 'blad', size: 30, inset: [9, 9], max: 3, turn: 70, corners: ['tr', 'br', 'bl', 'tl'], svg: leaf }],
    particles: [{ kind: 'blad', density: 0.3 }],
  });
})();
