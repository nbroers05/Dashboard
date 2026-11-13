'use strict';

// Winter (December to February; Christmas and New Year go above it): cool blue tint, frost edges along the tiles,
// snow caps from 1 to 26 December, and a breath cloud by the weather when it's below 3 degrees outside (real weather, Open-Meteo).
DASH_THEMES.add({
  id: 'winter', name: 'Winter', icon: '❄️', tier: 'season', prio: 10, c1: '#7fb3ff', c2: '#2c4a7a',
  when: (day) => [11, 0, 1].includes(day.getMonth()),
  bg: 'radial-gradient(70% 55% at 100% 0%, rgba(110,160,255,.16), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(150,200,255,.1), transparent 70%)',
  deco: [
    { type: 'edge', id: 'frost', cls: 'th-frost' },
    { type: 'cap', id: 'cap', h: 13, svg: DASH_THEMES.util.snowCap, if: (data, wx, day) => day.getMonth() === 11 && day.getDate() <= 26 },
    { type: 'corner', id: 'breath', card: 'w-weather', w: 46, h: 30, inset: [14, 10], max: 1, corners: ['br', 'tr'],
      if: (data) => data.wx && data.wx.temp != null && data.wx.temp < 3,
      svg: '<svg viewBox="0 0 46 30"><g fill="rgba(235,244,255,.55)"><circle cx="12" cy="18" r="8"/><circle cx="23" cy="13" r="10"/><circle cx="34" cy="18" r="8"/><rect x="12" y="18" width="22" height="8" rx="4"/></g></svg>' },
  ],
  css: `.th-frost { box-shadow: inset 0 0 0 1.5px rgba(200, 228, 255, .3), inset 0 0 14px rgba(190, 225, 255, .14); }
.th-breath > svg { animation: th-breath 4s ease-out both; }
@keyframes th-breath { from { opacity: 0; transform: translateX(-8px) scale(.7); } to { opacity: 1; transform: none; } }`,
});
