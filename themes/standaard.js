'use strict';

// Standaard: het dashboard zoals altijd, zonder versiering.
//
// ---------- Zo ziet een themabestand eruit (één bestand per thema; nieuw thema = nieuw bestand + naam in FILES in themes.js) ----------
// DASH_THEMES.add({
//   id: 'herfst', name: 'Herfst', icon: '🍂',         // kaartje in Instellingen › Thema
//   tier: 'seizoen' | 'feest' | 'event',              // Automatisch: hoogste prio wint; een feestdag/event gaat boven het seizoen
//   prio: 60,                                          // verjaardag 100, één dag 80, periode 60, tentamen 50, F1 40, seizoen 10
//   when(day, data) { ... },                           // geldt dit thema op die dag? data = { events, f1, birthday, wx }
//   c1, c2 | colors(day),                              // themakleuren (--th1/--th2)
//   topbar: 'strong' | 'soft',                         // topbalk gekleurd zoals de feestdagen (0.42.0), of alleen een rustige rand
//   greeting(day, { fixed, data, now }),               // groet boven de dagregel: tekst of { text, small: true }
//   dayIcon: '🎃',                                     // icoontje vooraan in de dagregel
//   bg: 'css' | (day) => 'css',                        // achtergrond (onder alles)
//   topDeco: { type: 'lights'|'flags'|'garland'|'stars', colors: [...] },
//   deco: [{ type: 'corner'|'cap'|'edge', ... }],      // versiering op de vakken (zie placeDeco in themes.js)
//   particles: [{ kind: 'blad', density: 0.3 }],       // deel van het maximum (Normaal 30, Feestje 60, Rustig 10)
//   fx: 'confetti' | 'vuurwerk' | (day) => ...,        // eenmalig effect, één keer per dag per browser
//   quiet: true,                                       // alles wat beweegt uit (tentamenweek)
//   css: '...',                                        // eigen opmaak, wordt één keer in de pagina gezet
//   aliases: { kerstavond: '12-24' },                  // ?kerstavond = dit thema alsof het 24 december is
// });
DASH_THEMES.add({ id: 'standaard', name: 'Standaard', icon: '◻️', tier: 'basis', c1: '#8a8aa0', c2: '#4a4a58' });
