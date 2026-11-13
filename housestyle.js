'use strict';
// Noah's house style (since 1.2.0, big idea "House style"; design: the design system "Noah Huisstijl" on claude.ai).
// Styles live in housestyle.css under html.nh; this file does two things:
// 1. Pick the mood (html[data-mood]): on the portrait screen automatically with the sun (sunrise to 12:00 Digital Future,
//    12:00 to sunset Poster, after that Title card), elsewhere Poster (phone in dark mode: Title card).
//    Settings › Theme › Mood fixes it; so does ?mood=digital|poster|titlecard (for that tab, to test).
// 2. Give every tile a window title: file name + Japanese word as data attributes, CSS draws the title bar.
// Sunrise/sunset: from the weather tile (DASH_WEATHER, Open-Meteo), otherwise calculated for Rotterdam.
window.DASH_HOUSESTYLE = (() => {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const urlMood = /^(digital|poster|titlecard)$/.test(params.get('mood') || '') ? params.get('mood') : null;
  const NAMES = { digital: 'Digital Future', poster: 'Poster', titlecard: 'Title card' };

  // Tile → [file name, Japanese word]. Words from the list in the design system (README › Japanese decoration)
  const WINDOWS = {
    'spotify': ['spotify.exe', '音楽'],
    'lyrics': ['lyrics.exe', '歌詞'],
    'w-weather': ['weather.exe', '天気'],
    'w-rain': ['rain.exe', '雨'],
    'w-f1': ['f1.exe', 'レース'],
    'w-ah': ['appie.exe', '仕事'],
    'w-canvas': ['canvas.exe', '締切'],
    'w-alerts': ['notifications.exe', '通知'],
    'w-health': ['steps.exe', '歩数'],
    'w-mail': ['mail.exe', 'メール'],
    'w-episodes': ['episodes.exe', '話数'],
    'w-stars': ['film.exe', '映画'],
    'w-letterboxd': ['watched.exe', '映画'],
    'w-friends': ['friends.exe', '友達'],
    'w-sptop': ['month.exe', '音楽'],
    'w-memory': ['memories.exe', '思い出'],
    'w-checkin': ['checkin.exe', '気分'],
    'w-todo': ['todo.exe', '用事'],
    'w-wishes': ['wishes.exe', '願い'],
    'calendar': ['agenda.exe', '予定'],
  };

  // ---------- Holidays and seasons (design system › Holidays, since 1.4.0) ----------
  // Per theme: mark (Japanese word for the day), holiday color for Poster/Digital Future and for Title card, corner, garland.
  // themes.js uses this in the house style instead of its own colors, emoji and colored decoration.
  const HOLIDAY = {
    christmas: { mark: '聖夜', color: '#1f6b45', titleColor: '#3fae74', corner: 'snow', garland: true },
    newyear: { mark: '新年', color: '#8a6a10', titleColor: '#e0b84a', corner: 'star', garland: true },
    sinterklaas: { mark: '贈物', color: '#b3262c', titleColor: '#ef4b4b', corner: 'present', garland: true },
    halloween: { mark: '南瓜', color: '#b8520c', titleColor: '#ff8a1f', corner: 'pumpkin', garland: true },
    kingsday: { mark: '王様', color: '#c45f00', titleColor: '#ff8a1f', corner: 'crown', garland: true },
    liberationday: { mark: '解放', color: '#b8263a', titleColor: '#ff5a6e', corner: 'dove', garland: true },
    valentine: { mark: '恋', color: '#b0174f', titleColor: '#ff5f8f', corner: 'heart', garland: false },
    easter: { mark: '卵', color: '#6a4fb3', titleColor: '#b9a6ff', corner: 'egg', garland: true },
    birthday: { mark: '誕生日', color: '#7d36a8', titleColor: '#c58af0', corner: 'cake', garland: true },
    exams: { mark: '試験', color: '#16130f', titleColor: '#f2efe8', corner: 'book', garland: false },
    f1: { mark: 'レース', color: '#d7261e', titleColor: '#e3241b', corner: 'flag', garland: false },
    spring: { mark: '春', color: '#3b7f36', titleColor: '#7fd67a', corner: 'blossom', garland: false },
    summer: { mark: '夏', color: '#b35d00', titleColor: '#ffc24a', corner: 'sun', garland: false },
    autumn: { mark: '秋', color: '#9a431b', titleColor: '#e07a3f', corner: 'leaf', garland: false },
    winter: { mark: '冬', color: '#2f6aa0', titleColor: '#8cc0e8', corner: 'flake', garland: false },
  };
  // Corner decoration: line drawing in ink (currentColor), one area (.nh-fill) in --holiday. viewBox 46 × 46
  const CORNERS = {
    snow: '<path d="M2 14 C6 6 14 6 18 10 C22 4 32 4 36 10 C40 8 44 10 44 14 Z" class="nh-fill" opacity=".25"/><path d="M2 14 C6 6 14 6 18 10 C22 4 32 4 36 10 C40 8 44 10 44 14"/><circle cx="12" cy="24" r="1.2"/><circle cx="30" cy="30" r="1.2"/><circle cx="20" cy="36" r="1.2"/>',
    leaf: '<path d="M40 6 C20 6 8 18 8 38 C28 38 40 26 40 6 Z" class="nh-fill" opacity=".9"/><path d="M40 6 C20 6 8 18 8 38 C28 38 40 26 40 6 Z M8 38 L32 14"/>',
    blossom: '<circle cx="24" cy="22" r="4" class="nh-fill"/><path d="M24 18 C20 10 28 10 24 18 M28 22 C36 18 36 26 28 22 M24 26 C28 34 20 34 24 26 M20 22 C12 26 12 18 20 22"/>',
    egg: '<path d="M23 6 C32 6 38 20 38 28 C38 36 31 42 23 42 C15 42 8 36 8 28 C8 20 14 6 23 6 Z"/><path d="M9 24 L15 20 L21 25 L27 20 L33 25 L37 22"/><path d="M9 30 h29" class="nh-fill" stroke="var(--holiday)"/>',
    heart: '<path d="M23 40 C10 30 4 22 8 14 C12 6 20 8 23 14 C26 8 34 6 38 14 C42 22 36 30 23 40 Z" class="nh-fill"/>',
    present: '<rect x="8" y="18" width="30" height="24" class="nh-fill" opacity=".9"/><rect x="8" y="18" width="30" height="24"/><path d="M23 18 V42 M8 26 H38 M23 18 C18 8 10 12 16 18 M23 18 C28 8 36 12 30 18"/>',
    star: '<path d="M23 4 L28 17 L42 18 L31 27 L35 41 L23 33 L11 41 L15 27 L4 18 L18 17 Z" class="nh-fill"/><path d="M23 4 L28 17 L42 18 L31 27 L35 41 L23 33 L11 41 L15 27 L4 18 L18 17 Z"/>',
    crown: '<path d="M6 34 L8 12 L17 22 L23 8 L29 22 L38 12 L40 34 Z" class="nh-fill"/><path d="M6 34 L8 12 L17 22 L23 8 L29 22 L38 12 L40 34 Z M6 40 H40"/>',
    pumpkin: '<path d="M23 12 C10 12 5 20 5 28 C5 37 13 42 23 42 C33 42 41 37 41 28 C41 20 36 12 23 12 Z" class="nh-fill"/><path d="M23 12 C10 12 5 20 5 28 C5 37 13 42 23 42 C33 42 41 37 41 28 C41 20 36 12 23 12 Z M23 12 C17 20 17 34 23 42 M23 12 C29 20 29 34 23 42 M23 12 C23 8 25 5 28 4"/>',
    dove: '<path d="M6 26 C14 26 18 18 26 18 C32 18 34 22 40 20 C36 26 32 30 24 32 C18 34 12 32 6 26 Z" class="nh-fill" opacity=".25"/><path d="M6 26 C14 26 18 18 26 18 C32 18 34 22 40 20 C36 26 32 30 24 32 C18 34 12 32 6 26 Z M24 22 C22 14 26 8 30 6 C30 12 30 16 28 20 M36 20 L42 18"/>',
    cake: '<rect x="8" y="24" width="30" height="16" class="nh-fill" opacity=".9"/><rect x="8" y="24" width="30" height="16"/><path d="M8 30 C13 34 18 26 23 30 C28 34 33 26 38 30 M16 24 V16 M23 24 V14 M30 24 V16"/><path d="M16 12 v1 M23 10 v1 M30 12 v1"/>',
    book: '<path d="M6 10 C14 8 20 10 23 13 C26 10 32 8 40 10 V38 C32 36 26 38 23 40 C20 38 14 36 6 38 Z M23 13 V40"/><path d="M10 18 h8 M10 23 h8 M28 18 h8 M28 23 h8"/>',
    flag: '<path d="M8 42 V6"/><rect x="8" y="6" width="30" height="20"/><path d="M8 6 h7.5 v5 h-7.5z M23 6 h7.5 v5 h-7.5z M15.5 11 h7.5 v5 h-7.5z M30.5 11 h7.5 v5 h-7.5z M8 16 h7.5 v5 h-7.5z M23 16 h7.5 v5 h-7.5z M15.5 21 h7.5 v5 h-7.5z M30.5 21 h7.5 v5 h-7.5z" class="nh-fill" stroke="none"/>',
    sun: '<circle cx="34" cy="12" r="7" class="nh-fill"/><path d="M34 0 v2 M34 22 v2 M22 12 h2 M44 12 h2 M26 4 l1.5 1.5 M40.5 18.5 l1.5 1.5 M26 20 l1.5 -1.5 M40.5 5.5 l1.5 -1.5"/>',
    flake: '<path d="M23 6 V40 M8 14 L38 32 M8 32 L38 14 M19 8 L23 12 L27 8 M19 38 L23 34 L27 38"/>',
  };
  const cornerSvg = (name) => CORNERS[name] ? `<svg class="nh-corner-svg" viewBox="0 0 46 46" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CORNERS[name]}</svg>` : '';
  // Garland above the top bar: a thin line in ink with flags in --holiday (like .nh-garland in the design system)
  function garlandSvg(width) {
    const W = Math.max(300, Math.round(width)), n = Math.max(1, Math.round(W / 300)), seg = W / n;
    let path = 'M0 2', flags = '';
    for (let i = 0; i < n; i++) path += ` Q${(i + 0.5) * seg} 14 ${(i + 1) * seg} 2`;
    for (let x = 14; x < W - 10; x += 24) {
      const t = (x % seg) / seg, y = 2 + 24 * t * (1 - t) * 0.5 * 2 - 0.4;
      flags += `<path class="nh-flag" d="M${x} ${(y + 1).toFixed(1)} l7 0 l-3.5 9 z"/>`;
    }
    return `<svg class="nh-garland" viewBox="0 0 ${W} 22" width="${W}" height="22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="${path}"/>${flags}</svg>`;
  }
  // No emoji in the house style (day line, greeting)
  const plain = (t) => (active() && typeof t === 'string' ? t.replace(/\p{Extended_Pictographic}️?\s?/gu, '').replace(/\s{2,}/g, ' ').trim() : t);

  const settings = () => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('theme.settings') || '{}') || {}; } catch {}
    return s;
  };
  const savedMood = () => { const s = settings(), m = s.mood || s.stand; return m === 'titel' ? 'titlecard' : m; };
  // The chosen style is html.nh-want (themes.js and the script in the head). html.nh = really on: not on the phone
  // (≤ 700px); the phone has its own house-style app.
  const active = () => root.classList.contains('nh');

  // ---------- Sunrise and sunset ----------
  // NOAA approximation (accurate to a few minutes), for Rotterdam; only when the weather tile has nothing yet
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
        if (new Date(rise).toDateString() === now.toDateString()) return { rise, set, from: 'weather' };
      }
    }
    return { ...sunCalc(now), from: 'calculated' };
  }

  // ---------- Mood ----------
  const tall = () => root.classList.contains('portrait-wide') || root.classList.contains('tall-mode');
  const phone = () => matchMedia('(max-width: 700px)').matches;
  function byTime(now = new Date()) {
    const { rise, set } = sunToday(now), t = now.getTime();
    const noon = new Date(now); noon.setHours(12, 0, 0, 0);
    if (t >= rise && t < noon.getTime()) return 'digital';
    if (t >= noon.getTime() && t < set) return 'poster';
    return 'titlecard';
  }
  function choose() {
    if (urlMood) return urlMood;
    const pick = savedMood();
    if (pick && pick !== 'auto' && NAMES[pick]) return pick;
    if (tall()) return byTime();
    if (phone() && matchMedia('(prefers-color-scheme: dark)').matches) return 'titlecard';
    return 'poster';
  }
  function describe() {
    const now = new Date(), s = sunToday(now), f = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const pick = savedMood();
    const why = urlMood ? 'via the link' : (pick && pick !== 'auto') ? 'fixed' : tall() ? `sunrise ${f(s.rise)}, sunset ${f(s.set)}` : 'laptop and phone';
    return `${NAMES[choose()]} (${why})`;
  }

  // ---------- Window titles ----------
  function label() {
    for (const [id, [exe, kanji]] of Object.entries(WINDOWS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.dataset.nhExe = exe;
      el.dataset.nhName = exe.replace(/\.exe$/, '');
      el.dataset.nhKanji = kanji;
      // The tile's heading becomes the title bar (CSS); the same label on it so ::before can show it
      const eyebrow = el.querySelector(':scope > .eyebrow, :scope > .w-row > .eyebrow');
      if (eyebrow) Object.assign(eyebrow.dataset, { nhExe: exe, nhName: exe.replace(/\.exe$/, ''), nhKanji: kanji });
    }
    // Other media cards (YouTube etc. from the helper)
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
    if (!active()) { root.removeAttribute('data-mood'); last = null; return; }
    const mood = choose();
    if (mood !== last) {
      root.dataset.mood = mood;
      last = mood;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = { digital: '#eef5fb', poster: '#efe9dc', titlecard: '#0b0b0d' }[mood];
      window.dispatchEvent(new CustomEvent('dash:mood', { detail: { mood } }));
    }
    label();
  }

  refresh();
  setInterval(refresh, 60 * 1000);
  for (const ev of ['dash:weather', 'dash:layout', 'dash:wake', 'resize']) window.addEventListener(ev, () => refresh());
  document.addEventListener('DOMContentLoaded', refresh);
  // Media cards arrive later (widgets/media.js): keep watching
  new MutationObserver(() => { if (active()) label(); }).observe(document.getElementById('media-stack') || document.body, { childList: true });

  return { refresh, choose, describe, byTime, sunToday, NAMES, HOLIDAY, cornerSvg, garlandSvg, plain, active };
})();
