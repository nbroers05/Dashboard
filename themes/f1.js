'use strict';

// F1-raceweekend (vrijdag t/m zondag van een Grand Prix): rood accent (rustige rode rand om de topbalk) en een geblokte
// finishvlag-rand om het F1-vak. Komt uit het F1-schema dat het F1-vak al bewaart (localStorage f1.schedule.v2);
// nog nooit het F1-vak geladen in deze browser = geen raceweekend.
DASH_THEMES.add({
  id: 'f1', name: 'F1-raceweekend', icon: '🏁', tier: 'event', prio: 40, c1: '#e10600', c2: '#ffffff', topbar: 'soft',
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
    return race && !fixed ? { text: `Raceweekend: GP ${race.gp} 🏁`, small: true } : null;
  },
  deco: [{ type: 'edge', id: 'finish', card: 'w-f1', cls: 'th-checker' }],
  css: `.th-checker { padding: 5px; opacity: .85; background: repeating-conic-gradient(#f2f2f2 0 25%, #151515 0 50%) 0 0 / 10px 10px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }`,
});
