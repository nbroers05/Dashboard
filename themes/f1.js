'use strict';

// F1-raceweekend (vrijdag t/m zondag van een Grand Prix), uit het F1-schema dat het F1-vak bewaart (f1.schedule.v2).
DASH_THEMES.add({
  id: 'f1', name: 'F1-raceweekend', icon: '🏁', tier: 'event', prio: 40, c1: '#e10600', c2: '#ffffff',
  when() { return false; },
});
