'use strict';
// Noah Huisstijl (sinds 1.2.0, groot idee "Huisstijl"; ontwerp: design system "Noah Huisstijl" op claude.ai).
// Opmaak staat in huisstijl.css onder html.nh; dit bestand doet twee dingen:
// 1. De stand kiezen (html[data-stand]): op het staande scherm vanzelf met de zon (zon op tot 12:00 Digital Future,
//    12:00 tot zon onder Poster, daarna Titelkaart), elders Poster (telefoon in donker: Titelkaart).
//    Instellingen › Thema › Stand zet hem vast; ?stand=digital|poster|titel ook (voor dat tabblad, om te testen).
// 2. Elk vak een venstertitel geven: bestandsnaam + Japans woord als data-attributen, CSS tekent de titelbalk.
// Zon op/onder: uit het weervak (DASH_WEATHER, Open-Meteo), anders zelf uitgerekend voor Rotterdam.
window.DASH_HUISSTIJL = (() => {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const urlStand = /^(digital|poster|titel)$/.test(params.get('stand') || '') ? params.get('stand') : null;
  const NAMES = { digital: 'Digital Future', poster: 'Poster', titel: 'Titelkaart' };

  // Vak → [bestandsnaam, Japans woord]. Woorden uit de lijst in het design system (README › Japanse versiering)
  const WINDOWS = {
    'spotify': ['spotify.exe', '音楽'],
    'lyrics': ['tekst.exe', '歌詞'],
    'w-weather': ['weer.exe', '天気'],
    'w-rain': ['regen.exe', '雨'],
    'w-f1': ['f1.exe', 'レース'],
    'w-ah': ['appie.exe', '仕事'],
    'w-canvas': ['canvas.exe', '締切'],
    'w-alerts': ['meldingen.exe', '通知'],
    'w-health': ['stappen.exe', '歩数'],
    'w-mail': ['mail.exe', 'メール'],
    'w-episodes': ['episodes.exe', '話数'],
    'w-stars': ['film.exe', '映画'],
    'w-letterboxd': ['gekeken.exe', '映画'],
    'w-friends': ['vrienden.exe', '友達'],
    'w-sptop': ['maand.exe', '音楽'],
    'w-memory': ['vroeger.exe', '思い出'],
    'w-checkin': ['checkin.exe', '気分'],
    'w-todo': ['todo.exe', '用事'],
    'w-wishes': ['wensen.exe', '願い'],
    'w-msg': ['berichten.exe', '手紙'],
    'calendar': ['agenda.exe', '予定'],
  };

  const settings = () => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('theme.settings') || '{}') || {}; } catch {}
    return s;
  };
  // Gekozen stijl staat als html.nh-want (themes.js en het script in de head). html.nh = echt aan: nog niet op de telefoon
  // (≤ 700px), want de telefoonkaartjes zijn nog niet omgezet; die krijgen de huisstijl met de Telefoon-app.
  const active = () => root.classList.contains('nh');

  // ---------- Zon op en onder ----------
  // NOAA-benadering (nauwkeurig op een paar minuten), voor Rotterdam; alleen als het weervak nog niks heeft
  function sunCalc(date) {
    const lat = 51.92, lon = 4.48, rad = Math.PI / 180;
    const start = Date.UTC(date.getFullYear(), 0, 0);
    const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
    const g = 2 * Math.PI / 365 * (day - 1);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
    const utcMin = (sign) => 720 - 4 * (lon + sign * ha) - eq;
    const at = (min) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + min * 6e4;
    return { rise: at(utcMin(1)), set: at(utcMin(-1)) };
  }
  function sunToday(now) {
    const wx = window.DASH_WEATHER;
    if (wx?.daily?.sunrise && wx.daily.sunset) {
      for (let i = 0; i < wx.daily.sunrise.length; i++) {
        const rise = wx.daily.sunrise[i] * 1000, set = wx.daily.sunset[i] * 1000;
        if (new Date(rise).toDateString() === now.toDateString()) return { rise, set, from: 'weer' };
      }
    }
    return { ...sunCalc(now), from: 'berekend' };
  }

  // ---------- Stand ----------
  const tall = () => root.classList.contains('portrait-wide') || root.classList.contains('tall-mode');
  const phone = () => matchMedia('(max-width: 700px)').matches;
  function byTime(now = new Date()) {
    const { rise, set } = sunToday(now), t = now.getTime();
    const noon = new Date(now); noon.setHours(12, 0, 0, 0);
    if (t >= rise && t < noon.getTime()) return 'digital';
    if (t >= noon.getTime() && t < set) return 'poster';
    return 'titel';
  }
  function choose() {
    if (urlStand) return urlStand;
    const pick = settings().stand;
    if (pick && pick !== 'auto' && NAMES[pick]) return pick;
    if (tall()) return byTime();
    if (phone() && matchMedia('(prefers-color-scheme: dark)').matches) return 'titel';
    return 'poster';
  }
  function describe() {
    const now = new Date(), s = sunToday(now), f = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const why = urlStand ? 'via de link' : (settings().stand && settings().stand !== 'auto') ? 'vastgezet' : tall() ? `zon op ${f(s.rise)}, onder ${f(s.set)}` : 'laptop en telefoon';
    return `${NAMES[choose()]} (${why})`;
  }

  // ---------- Venstertitels ----------
  function label() {
    for (const [id, [exe, kanji]] of Object.entries(WINDOWS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.dataset.nhExe = exe;
      el.dataset.nhName = exe.replace(/\.exe$/, '');
      el.dataset.nhKanji = kanji;
      // Het kopje van het vak wordt de titelbalk (CSS); hetzelfde label erop zodat ::before het kan tonen
      const eyebrow = el.querySelector(':scope > .eyebrow, :scope > .w-row > .eyebrow');
      if (eyebrow) Object.assign(eyebrow.dataset, { nhExe: exe, nhName: exe.replace(/\.exe$/, ''), nhKanji: kanji });
    }
    // Andere mediakaarten (YouTube enz. uit het hulpprogramma)
    for (const card of document.querySelectorAll('.media-card:not([data-nh-exe])')) {
      const app = (card.dataset.mediaId || card.querySelector('.app-badge')?.textContent || 'media').toLowerCase();
      const name = /youtube/.test(app) ? 'youtube' : /spotify/.test(app) ? 'spotify' : 'media';
      Object.assign(card.dataset, { nhExe: `${name}.exe`, nhName: name, nhKanji: name === 'spotify' ? '音楽' : '動画' });
    }
  }

  let last = null;
  function refresh() {
    const on = root.classList.contains('nh-want') && !phone();
    if (on !== active()) {
      root.classList.toggle('nh', on);
      if (!on) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0e0e0f');
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
    if (!active()) { root.removeAttribute('data-stand'); last = null; return; }
    const stand = choose();
    if (stand !== last) {
      root.dataset.stand = stand;
      last = stand;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = { digital: '#eef5fb', poster: '#efe9dc', titel: '#0b0b0d' }[stand];
      window.dispatchEvent(new CustomEvent('dash:stand', { detail: { stand } }));
    }
    label();
  }

  refresh();
  setInterval(refresh, 60 * 1000);
  for (const ev of ['dash:weather', 'dash:layout', 'dash:wake', 'resize']) window.addEventListener(ev, () => refresh());
  document.addEventListener('DOMContentLoaded', refresh);
  // Mediakaarten komen later (widgets/media.js): even meekijken
  new MutationObserver(() => { if (active()) label(); }).observe(document.getElementById('media-stack') || document.body, { childList: true });

  return { refresh, choose, describe, byTime, sunToday, NAMES };
})();
