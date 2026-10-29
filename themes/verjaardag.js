'use strict';

// Mijn verjaardag: paars/roze, groet met leeftijd, één keer confetti (zoals 0.42.0).
// Je eigen verjaardag staat NIET in de code (de repo is openbaar): één keer per browser ?mijnverjaardag=JJJJ-MM-DD
// (themes.js bewaart hem als theme.birthday, met leeftijd). Zonder die instelling: de verjaardag-afspraak
// "Gefeliciteerd met je verjaardag!" uit je agenda (zonder leeftijd).
(() => {
  const { isoDay } = DASH_THEMES.util;
  function own(day, data) {
    if (data.birthday) return data.birthday.slice(5) === isoDay(day).slice(5) ? { age: day.getFullYear() - +data.birthday.slice(0, 4) } : null;
    const hit = data.events.find((e) => e.birthday && /gefeliciteerd/i.test(`${e.birthday} ${e.title || ''}`) && isoDay(new Date(e.start)) === isoDay(day));
    return hit ? { age: null } : null;
  }
  DASH_THEMES.add({
    id: 'verjaardag', name: 'Mijn verjaardag', icon: '🎉', tier: 'feest', prio: 100, c1: '#b48cff', c2: '#ff7aa8', topbar: 'strong',
    when: (day, data) => !!own(day, data),
    greeting(day, { data }) {
      const o = own(day, data);
      return `Gefeliciteerd, Noah!${o && o.age ? ` ${o.age} vandaag` : ''} 🎉`;
    },
    fx: 'confetti',
  });
})();
