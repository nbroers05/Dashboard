'use strict';

// Feestdagen en verjaardag: op speciale dagen krijgt alleen de topbalk (ook in de minimale modus) een themakleur en een
// groet; de rest van het dashboard blijft gewoon. Op je eigen verjaardag één keer confetti, op oudejaarsdag één keer
// vuurwerk (één keer per dag per browser; niets bij "beweging beperken"). Op gewone dagen verandert er niets.
//
// Je eigen verjaardag staat NIET in de code (de repo is openbaar): open één keer per browser
//   …/Dashboard/?mijnverjaardag=JJJJ-MM-DD   (bewaard in localStorage theme.birthday)
// Zonder die instelling: de verjaardag-afspraak "Gefeliciteerd met je verjaardag!" uit je agenda (zonder leeftijd).
//
// Testen: ?datum=2026-11-04 doet alsof het die dag is (alleen voor het thema), of ?thema=<naam>
// (verjaardag, nieuwjaar, valentijn, pasen, koningsdag, bevrijdingsdag, halloween, sinterklaas, kerstavond, kerst, oudjaar).
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  const dayEl = bar && bar.querySelector('.tb-day');
  if (!dayEl) return;
  const params = new URLSearchParams(location.search);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Eenmalig instellen via de link
  const setB = params.get('mijnverjaardag');
  if (setB && /^\d{4}-\d{2}-\d{2}$/.test(setB)) {
    store.set('theme.birthday', setB);
    params.delete('mijnverjaardag');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    document.addEventListener('DOMContentLoaded', () => {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = 'Verjaardag opgeslagen in deze browser 🎂';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 4000);
    });
  }

  const THEMES = {
    verjaardag: { c1: '#b48cff', c2: '#ff7aa8', fx: 'confetti' },
    nieuwjaar: { c1: '#f5c542', c2: '#fff1b8', text: 'Gelukkig nieuwjaar! 🎆' },
    valentijn: { c1: '#ff5f8f', c2: '#ffb0c8', text: 'Fijne Valentijnsdag 💘' },
    pasen: { c1: '#f7d154', c2: '#8fd694', text: 'Vrolijk Pasen 🐣' },
    koningsdag: { c1: '#ff8a1f', c2: '#ffb066', text: 'Fijne Koningsdag 👑' },
    bevrijdingsdag: { c1: '#e63946', c2: '#5b8def', text: 'Fijne Bevrijdingsdag 🕊️' },
    halloween: { c1: '#ff8a1f', c2: '#8b5cf6', text: 'Happy Halloween 🎃' },
    sinterklaas: { c1: '#d62828', c2: '#f5c542', text: 'Fijne pakjesavond 🎁' },
    kerstavond: { c1: '#2fbf71', c2: '#e63946', text: 'Fijne kerstavond 🎄' },
    kerst: { c1: '#2fbf71', c2: '#e63946', text: 'Vrolijk kerstfeest 🎄' },
    oudjaar: { c1: '#f5c542', c2: '#ffe9a8', text: 'Fijne jaarwisseling 🥂', fx: 'vuurwerk' },
  };

  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    const month = Math.floor((hh + l - 7 * m + 114) / 31);
    return new Date(y, month - 1, ((hh + l - 7 * m + 114) % 31) + 1);
  }

  // Eigen verjaardag: ingesteld (met jaar), anders uit de agenda (alleen de dag)
  function ownBirthday(day) {
    const set = store.get('theme.birthday');
    if (set) return set.slice(5) === isoDay(day).slice(5) ? { age: day.getFullYear() - +set.slice(0, 4) } : null;
    const cal = (window.DASH_CALENDAR && window.DASH_CALENDAR.connected ? window.DASH_CALENDAR.events : (store.get('google.events') || {}).events) || [];
    const hit = cal.find((e) => e.birthday && /gefeliciteerd/i.test(`${e.birthday} ${e.title || ''}`) && isoDay(new Date(e.start)) === isoDay(day));
    return hit ? { age: null } : null;
  }

  function themeFor(day) {
    const md = isoDay(day).slice(5), y = day.getFullYear();
    const own = ownBirthday(day);
    if (own) return { id: 'verjaardag', text: `Gefeliciteerd, Noah!${own.age ? ` ${own.age} vandaag` : ''} 🎉` };
    const e = easter(y), plus = (n) => isoDay(new Date(e.getFullYear(), e.getMonth(), e.getDate() + n)).slice(5);
    let king = new Date(y, 3, 27);
    if (king.getDay() === 0) king = new Date(y, 3, 26);
    const map = { '01-01': 'nieuwjaar', '02-14': 'valentijn', [plus(0)]: 'pasen', [plus(1)]: 'pasen', [isoDay(king).slice(5)]: 'koningsdag',
      '05-05': 'bevrijdingsdag', '10-31': 'halloween', '12-05': 'sinterklaas', '12-24': 'kerstavond', '12-25': 'kerst', '12-26': 'kerst', '12-31': 'oudjaar' };
    return map[md] ? { id: map[md] } : null;
  }

  // ---------- Effecten: één keer, op een doek over de pagina, daarna weg ----------
  function effect(kind) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = h('canvas', 'th-fx');
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
    const s = devicePixelRatio;
    const colors = kind === 'confetti' ? ['#b48cff', '#ff7aa8', '#ffcf5c', '#7ad7ff', '#9cff8a'] : ['#f5c542', '#ff7a59', '#7ad7ff', '#ffffff', '#ff5f8f'];
    let parts = [];
    if (kind === 'confetti') {
      parts = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 2 * s, vy: (2 + Math.random() * 3) * s,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: (6 + Math.random() * 6) * s, hgt: (3 + Math.random() * 3) * s, c: colors[Math.floor(Math.random() * colors.length)] }));
    }
    const burst = () => {
      const x = W * (0.15 + Math.random() * 0.7), y = H * (0.12 + Math.random() * 0.35), c = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2, v = (2 + Math.random() * 3) * s;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c, spark: true });
      }
    };
    const start = performance.now(), dur = kind === 'confetti' ? 4500 : 3800;
    let nextBurst = 0;
    (function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      if (kind === 'vuurwerk' && t < 2600 && t >= nextBurst) { burst(); nextBurst = t + 380 + Math.random() * 300; }
      for (const p of parts) {
        if (p.spark) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.04 * s; p.vx *= 0.985; p.life -= 0.012;
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x, p.y, 2.5 * s, 2.5 * s);
        } else {
          p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.globalAlpha = t > dur - 800 ? Math.max(0, (dur - t) / 800) : 1;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt); ctx.restore();
        }
      }
      if (t < dur) requestAnimationFrame(frame); else cv.remove();
    })(start);
  }

  // ---------- Toepassen ----------
  const greet = h('span', 'tb-greet');
  greet.hidden = true;
  dayEl.insertBefore(greet, dayEl.querySelector('.tb-dayline'));
  const forced = params.get('thema') || Object.keys(THEMES).find((k) => params.has(k));
  const fakeDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('datum') || '') ? params.get('datum') : null;
  let shown = null;

  function apply() {
    const day = fakeDay ? new Date(`${fakeDay}T12:00:00`) : new Date();
    let th = forced && THEMES[forced] ? { id: forced } : themeFor(day);
    if (th && th.id === 'verjaardag' && !th.text) {
      const own = ownBirthday(day);
      th.text = `Gefeliciteerd, Noah!${own && own.age ? ` ${own.age} vandaag` : ''} 🎉`;
    }
    const key = th ? `${th.id}|${isoDay(day)}` : '';
    if (key === shown) return;
    shown = key;
    const root = document.documentElement;
    if (!th) {
      delete root.dataset.theme;
      greet.hidden = true;
      return;
    }
    const t = THEMES[th.id];
    root.dataset.theme = th.id;
    root.style.setProperty('--th1', t.c1);
    root.style.setProperty('--th2', t.c2);
    greet.textContent = th.text || t.text;
    greet.hidden = false;
    // Effect één keer per dag per browser (bij testen met ?datum/?thema altijd)
    const fxKey = `${th.id}|${isoDay(day)}`;
    if (t.fx && (forced || fakeDay || store.get('theme.fx') !== fxKey)) {
      if (!forced && !fakeDay) store.set('theme.fx', fxKey);
      setTimeout(() => effect(t.fx), 600);
    }
  }
  apply();
  DASH.every(60 * 1000, apply);                       // om middernacht vanzelf aan/uit
  window.addEventListener('dash:calendar', apply);    // verjaardag uit de agenda komt later binnen
})();
