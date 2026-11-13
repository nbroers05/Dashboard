'use strict';

// My birthday: purple/pink, a greeting with your age, confetti once (like 0.42.0), plus a garland above the top bar.
// Your own birthday is NOT in the code (the repo is public): it comes from the private archive, or once per browser
// ?mybirthday=YYYY-MM-DD (themes.js saves it as theme.birthday, with age). Without that: Google's birthday event
// for you ("Happy birthday!" / "Gefeliciteerd met je verjaardag!") from your agenda (without age).
(() => {
  const { isoDay } = DASH_THEMES.util;
  function own(day, data) {
    if (data.birthday) return data.birthday.slice(5) === isoDay(day).slice(5) ? { age: day.getFullYear() - +data.birthday.slice(0, 4) } : null;
    const hit = data.events.find((e) => e.birthday && /gefeliciteerd|happy birthday/i.test(`${e.birthday} ${e.title || ''}`) && isoDay(new Date(e.start)) === isoDay(day));
    return hit ? { age: null } : null;
  }
  DASH_THEMES.add({
    id: 'birthday', name: 'My birthday', icon: '🎉', tier: 'holiday', prio: 100, c1: '#b48cff', c2: '#ff7aa8', topbar: 'strong',
    when: (day, data) => !!own(day, data),
    greeting(day, { data }) {
      const o = own(day, data);
      return `Happy birthday, Noah!${o && o.age ? ` ${o.age} today` : ''} 🎉`;
    },
    bg: 'radial-gradient(60% 50% at 100% 0%, rgba(180,140,255,.18), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgba(255,122,168,.12), transparent 70%)',
    topDeco: { type: 'garland', colors: ['#b48cff', '#ff7aa8', '#ffcf5c', '#7ad7ff', '#9cff8a'] },
    fx: 'confetti',
  });
})();
