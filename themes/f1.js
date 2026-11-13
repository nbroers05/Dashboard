'use strict';

// F1 race weekend (Friday to Sunday of a Grand Prix): red accent (calm red border around the top bar) and a checkered
// finish-flag border around the F1 tile. Comes from the F1 schedule the F1 tile already saves (localStorage f1.schedule.v2);
// the F1 tile never loaded in this browser = no race weekend.
DASH_THEMES.add({
  id: 'f1', name: 'F1 race weekend', icon: '🏁', tier: 'event', prio: 40, c1: '#e10600', c2: '#ffffff', topbar: 'soft',
  when(day, data) {
    const { isoDay, addDays } = DASH_THEMES.util, today = isoDay(day);
    return data.f1.some((s) => {
      if (s.name !== 'Race') return false;
      const race = new Date(s.start);
      return today >= isoDay(addDays(race, -2)) && today <= isoDay(race);
    });
  },
  greeting(day, { data, fixed }) {
    const { isoDay } = DASH_THEMES.util;
    const race = data.f1.find((s) => s.name === 'Race' && isoDay(new Date(s.start)) >= isoDay(day));
    return race && !fixed ? { text: `Race weekend: GP ${race.gp} 🏁`, small: true } : null;
  },
  deco: [{ type: 'edge', id: 'finish', card: 'w-f1', cls: 'th-checker' }],
  css: `.th-checker { padding: 5px; opacity: .85; background: repeating-conic-gradient(#f2f2f2 0 25%, #151515 0 50%) 0 0 / 10px 10px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }`,
});
