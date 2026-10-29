'use strict';

// Oud en Nieuw (27 december t/m 1 januari): donker met goud, sterrenhemel in de achtergrond, gouden sterretjes boven de
// topbalk. Op 31 december aftellen in de topbalk (het laatste uur per seconde). Vuurwerk één keer: bij de eerste keer
// laden op 31 december (zoals 0.42.0), om 00:00 en bij de eerste keer laden op 1 januari.
(() => {
  const { md, rng, svgUrl, daysUntil } = DASH_THEMES.util;
  const r = rng('sterren');
  let stars = '';
  for (let i = 0; i < 46; i++) {
    stars += `<circle cx="${(r() * 400).toFixed(1)}" cy="${(r() * 400).toFixed(1)}" r="${(0.4 + r() * 1.1).toFixed(2)}" fill="${r() < 0.25 ? '#ffe39a' : '#fff'}" fill-opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`;
  }
  const SKY = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${stars}</svg>`);
  const left = (now) => {
    const end = new Date(now.getFullYear() + 1, 0, 1).getTime(), ms = end - now.getTime();
    if (ms > 3600000) return `nog ${Math.floor(ms / 3600000)} u ${Math.floor((ms % 3600000) / 60000)} min tot ${now.getFullYear() + 1}`;
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `nog ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} tot ${now.getFullYear() + 1}`;
  };
  DASH_THEMES.add({
    id: 'oudennieuw', name: 'Oud en Nieuw', icon: '🎆', tier: 'feest', prio: 60, topbar: 'strong',
    c1: '#f5c542', c2: '#ffe9a8', colors: (day) => (md(day) === '01-01' ? ['#f5c542', '#fff1b8'] : ['#f5c542', '#ffe9a8']),
    aliases: { oudjaar: '12-31', nieuwjaar: '01-01' },
    when: (day) => DASH_THEMES.util.between(day, '12-27', '01-01'),
    greeting(day, { now }) {
      if (md(day) === '01-01') return 'Gelukkig nieuwjaar! 🎆';
      if (md(day) === '12-31') return `Fijne jaarwisseling 🥂 · ${left(md(now) === '12-31' ? now : day)}`;
      return { text: `Oud en Nieuw over ${daysUntil(day, '12-31')} dagen`, small: true };
    },
    tick: (day) => (md(day) !== '12-31' ? 0 : new Date(day.getFullYear() + 1, 0, 1) - Date.now() < 3600000 ? 1000 : 30000),
    bg: `linear-gradient(rgba(4,5,14,.5), rgba(4,5,14,.3)), radial-gradient(60% 40% at 50% 0%, rgba(245,197,66,.14), transparent 70%), ${SKY}`,
    topDeco: { type: 'stars', colors: ['#f5c542', '#ffe9a8', '#fff'] },
    fx: (day) => (['12-31', '01-01'].includes(md(day)) ? 'vuurwerk' : null),
  });
})();
