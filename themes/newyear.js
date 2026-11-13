'use strict';

// New Year (27 December to 1 January): dark with gold, a starry sky in the background, golden stars above the
// top bar. On 31 December a countdown in the top bar (the last hour per second). Fireworks once: the first time it
// loads on 31 December (like 0.42.0), at 00:00 and the first time it loads on 1 January.
(() => {
  const { md, rng, svgUrl, daysUntil } = DASH_THEMES.util;
  const r = rng('stars');
  let stars = '';
  for (let i = 0; i < 46; i++) {
    stars += `<circle cx="${(r() * 400).toFixed(1)}" cy="${(r() * 400).toFixed(1)}" r="${(0.4 + r() * 1.1).toFixed(2)}" fill="${r() < 0.25 ? '#ffe39a' : '#fff'}" fill-opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`;
  }
  const SKY = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${stars}</svg>`);
  const left = (now) => {
    const end = new Date(now.getFullYear() + 1, 0, 1).getTime(), ms = end - now.getTime();
    if (ms > 3600000) return `${Math.floor(ms / 3600000)} h ${Math.floor((ms % 3600000) / 60000)} min to ${now.getFullYear() + 1}`;
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} to ${now.getFullYear() + 1}`;
  };
  DASH_THEMES.add({
    id: 'newyear', name: 'New Year', icon: '🎆', tier: 'holiday', prio: 60, topbar: 'strong',
    c1: '#f5c542', c2: '#ffe9a8', colors: (day) => (md(day) === '01-01' ? ['#f5c542', '#fff1b8'] : ['#f5c542', '#ffe9a8']),
    aliases: { newyearseve: '12-31', newyearsday: '01-01' },
    when: (day) => DASH_THEMES.util.between(day, '12-27', '01-01'),
    greeting(day, { now }) {
      if (md(day) === '01-01') return 'Happy New Year! 🎆';
      if (md(day) === '12-31') return `Happy New Year's Eve 🥂 · ${left(md(now) === '12-31' ? now : day)}`;
      return { text: `New Year's Eve in ${daysUntil(day, '12-31')} days`, small: true };
    },
    tick: (day) => (md(day) !== '12-31' ? 0 : new Date(day.getFullYear() + 1, 0, 1) - Date.now() < 3600000 ? 1000 : 30000),
    bg: `linear-gradient(rgba(4,5,14,.5), rgba(4,5,14,.3)), radial-gradient(60% 40% at 50% 0%, rgba(245,197,66,.14), transparent 70%), ${SKY}`,
    topDeco: { type: 'stars', colors: ['#f5c542', '#ffe9a8', '#fff'] },
    fx: (day) => (['12-31', '01-01'].includes(md(day)) ? 'fireworks' : null),
  });
})();
