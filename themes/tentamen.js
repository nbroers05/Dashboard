'use strict';

// Tentamenweek: de week (ma t/m zo) waarin je agenda een tentamen heeft (titel met tentamen, hertentamen, toets of exam).
// Alleen uit de agenda in je browser, niets uit het archief. Gedempt: alles wat beweegt gaat uit (ook bij een feestdag),
// alleen een rustige rand om de topbalk.
DASH_THEMES.add({
  id: 'tentamen', name: 'Tentamenweek', icon: '📚', tier: 'event', prio: 50, c1: '#8fa3bf', c2: '#56657a', topbar: 'soft', quiet: true,
  when(day, data) {
    const { isoDay, addDays } = DASH_THEMES.util;
    const mon = addDays(day, -((day.getDay() + 6) % 7));
    const from = isoDay(mon), to = isoDay(addDays(mon, 6));
    return data.events.some((e) => {
      if (!/\b(her)?tentamen|\btoets\b|\bexam(en)?\b/i.test(e.title || '') || e.birthday) return false;
      const d = isoDay(new Date(e.start));
      return d >= from && d <= to;
    });
  },
});
