'use strict';

// Default: the dashboard as always, without decoration.
//
// ---------- What a theme file looks like (one file per theme; new theme = new file + name in FILES in themes.js) ----------
// DASH_THEMES.add({
//   id: 'autumn', name: 'Autumn', icon: '🍂',          // card in Settings › Theme
//   tier: 'season' | 'holiday' | 'event',              // Automatic: highest prio wins; a holiday/event goes above the season
//   prio: 60,                                          // birthday 100, one day 80, period 60, exams 50, F1 40, season 10
//   when(day, data) { ... },                           // does this theme apply on that day? data = { events, f1, birthday, wx }
//   c1, c2 | colors(day),                              // theme colors (--th1/--th2)
//   topbar: 'strong' | 'soft',                         // top bar colored like the holidays (0.42.0), or just a calm border
//   greeting(day, { fixed, data, now }),               // greeting above the day line: text or { text, small: true }
//   dayIcon: '🎃',                                     // icon at the start of the day line
//   bg: 'css' | (day) => 'css',                        // background (below everything)
//   topDeco: { type: 'lights'|'flags'|'garland'|'stars', colors: [...] },
//   deco: [{ type: 'corner'|'cap'|'edge', ... }],      // decoration on the tiles (see placeDeco in themes.js)
//   particles: [{ kind: 'leaf', density: 0.3 }],       // share of the maximum (Normal 30, Party 60, Calm 10)
//   fx: 'confetti' | 'fireworks' | (day) => ...,       // one-off effect, once a day per browser
//   quiet: true,                                       // everything that moves off (exam week)
//   css: '...',                                        // own styles, put in the page once
//   aliases: { christmaseve: '12-24' },                // ?christmaseve = this theme as if it's 24 December
// });
DASH_THEMES.add({ id: 'default', name: 'Default', icon: '◻️', tier: 'base', c1: '#8a8aa0', c2: '#4a4a58' });
