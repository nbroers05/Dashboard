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
    'w-wishes': ['wishes.exe', '願い'],
    'w-msg': ['berichten.exe', '手紙'],
    'calendar': ['agenda.exe', '予定'],
  };

  // ---------- Feestdagen en seizoenen (design system › Feestdagen, sinds 1.4.0) ----------
  // Per thema: teken (Japans woord voor de dag), feestkleur voor Poster/Digital Future en voor Titelkaart, hoek, slinger.
  // themes.js gebruikt dit in de huisstijl in plaats van eigen kleuren, emoji en gekleurde versiering.
  const FEEST = {
    kerst: { teken: '聖夜', feest: '#1f6b45', feestTitel: '#3fae74', hoek: 'sneeuw', slinger: true },
    oudennieuw: { teken: '新年', feest: '#8a6a10', feestTitel: '#e0b84a', hoek: 'ster', slinger: true },
    sinterklaas: { teken: '贈物', feest: '#b3262c', feestTitel: '#ef4b4b', hoek: 'cadeau', slinger: true },
    halloween: { teken: '南瓜', feest: '#b8520c', feestTitel: '#ff8a1f', hoek: 'pompoen', slinger: true },
    koningsdag: { teken: '王様', feest: '#c45f00', feestTitel: '#ff8a1f', hoek: 'kroon', slinger: true },
    bevrijdingsdag: { teken: '解放', feest: '#b8263a', feestTitel: '#ff5a6e', hoek: 'duif', slinger: true },
    valentijn: { teken: '恋', feest: '#b0174f', feestTitel: '#ff5f8f', hoek: 'hart', slinger: false },
    pasen: { teken: '卵', feest: '#6a4fb3', feestTitel: '#b9a6ff', hoek: 'ei', slinger: true },
    verjaardag: { teken: '誕生日', feest: '#7d36a8', feestTitel: '#c58af0', hoek: 'taart', slinger: true },
    tentamen: { teken: '試験', feest: '#16130f', feestTitel: '#f2efe8', hoek: 'boek', slinger: false },
    f1: { teken: 'レース', feest: '#d7261e', feestTitel: '#e3241b', hoek: 'vlag', slinger: false },
    lente: { teken: '春', feest: '#3b7f36', feestTitel: '#7fd67a', hoek: 'bloesem', slinger: false },
    zomer: { teken: '夏', feest: '#b35d00', feestTitel: '#ffc24a', hoek: 'zon', slinger: false },
    herfst: { teken: '秋', feest: '#9a431b', feestTitel: '#e07a3f', hoek: 'blad', slinger: false },
    winter: { teken: '冬', feest: '#2f6aa0', feestTitel: '#8cc0e8', hoek: 'vlok', slinger: false },
  };
  // Hoekversiering: lijntekening in ink (currentColor), één vlak (.vul) in --feest. viewBox 46 × 46
  const HOEKEN = {
    sneeuw: '<path d="M2 14 C6 6 14 6 18 10 C22 4 32 4 36 10 C40 8 44 10 44 14 Z" class="vul" opacity=".25"/><path d="M2 14 C6 6 14 6 18 10 C22 4 32 4 36 10 C40 8 44 10 44 14"/><circle cx="12" cy="24" r="1.2"/><circle cx="30" cy="30" r="1.2"/><circle cx="20" cy="36" r="1.2"/>',
    blad: '<path d="M40 6 C20 6 8 18 8 38 C28 38 40 26 40 6 Z" class="vul" opacity=".9"/><path d="M40 6 C20 6 8 18 8 38 C28 38 40 26 40 6 Z M8 38 L32 14"/>',
    bloesem: '<circle cx="24" cy="22" r="4" class="vul"/><path d="M24 18 C20 10 28 10 24 18 M28 22 C36 18 36 26 28 22 M24 26 C28 34 20 34 24 26 M20 22 C12 26 12 18 20 22"/>',
    ei: '<path d="M23 6 C32 6 38 20 38 28 C38 36 31 42 23 42 C15 42 8 36 8 28 C8 20 14 6 23 6 Z"/><path d="M9 24 L15 20 L21 25 L27 20 L33 25 L37 22"/><path d="M9 30 h29" class="vul" stroke="var(--feest)"/>',
    hart: '<path d="M23 40 C10 30 4 22 8 14 C12 6 20 8 23 14 C26 8 34 6 38 14 C42 22 36 30 23 40 Z" class="vul"/>',
    cadeau: '<rect x="8" y="18" width="30" height="24" class="vul" opacity=".9"/><rect x="8" y="18" width="30" height="24"/><path d="M23 18 V42 M8 26 H38 M23 18 C18 8 10 12 16 18 M23 18 C28 8 36 12 30 18"/>',
    ster: '<path d="M23 4 L28 17 L42 18 L31 27 L35 41 L23 33 L11 41 L15 27 L4 18 L18 17 Z" class="vul"/><path d="M23 4 L28 17 L42 18 L31 27 L35 41 L23 33 L11 41 L15 27 L4 18 L18 17 Z"/>',
    kroon: '<path d="M6 34 L8 12 L17 22 L23 8 L29 22 L38 12 L40 34 Z" class="vul"/><path d="M6 34 L8 12 L17 22 L23 8 L29 22 L38 12 L40 34 Z M6 40 H40"/>',
    pompoen: '<path d="M23 12 C10 12 5 20 5 28 C5 37 13 42 23 42 C33 42 41 37 41 28 C41 20 36 12 23 12 Z" class="vul"/><path d="M23 12 C10 12 5 20 5 28 C5 37 13 42 23 42 C33 42 41 37 41 28 C41 20 36 12 23 12 Z M23 12 C17 20 17 34 23 42 M23 12 C29 20 29 34 23 42 M23 12 C23 8 25 5 28 4"/>',
    duif: '<path d="M6 26 C14 26 18 18 26 18 C32 18 34 22 40 20 C36 26 32 30 24 32 C18 34 12 32 6 26 Z" class="vul" opacity=".25"/><path d="M6 26 C14 26 18 18 26 18 C32 18 34 22 40 20 C36 26 32 30 24 32 C18 34 12 32 6 26 Z M24 22 C22 14 26 8 30 6 C30 12 30 16 28 20 M36 20 L42 18"/>',
    taart: '<rect x="8" y="24" width="30" height="16" class="vul" opacity=".9"/><rect x="8" y="24" width="30" height="16"/><path d="M8 30 C13 34 18 26 23 30 C28 34 33 26 38 30 M16 24 V16 M23 24 V14 M30 24 V16"/><path d="M16 12 v1 M23 10 v1 M30 12 v1"/>',
    boek: '<path d="M6 10 C14 8 20 10 23 13 C26 10 32 8 40 10 V38 C32 36 26 38 23 40 C20 38 14 36 6 38 Z M23 13 V40"/><path d="M10 18 h8 M10 23 h8 M28 18 h8 M28 23 h8"/>',
    vlag: '<path d="M8 42 V6"/><rect x="8" y="6" width="30" height="20"/><path d="M8 6 h7.5 v5 h-7.5z M23 6 h7.5 v5 h-7.5z M15.5 11 h7.5 v5 h-7.5z M30.5 11 h7.5 v5 h-7.5z M8 16 h7.5 v5 h-7.5z M23 16 h7.5 v5 h-7.5z M15.5 21 h7.5 v5 h-7.5z M30.5 21 h7.5 v5 h-7.5z" class="vul" stroke="none"/>',
    zon: '<circle cx="34" cy="12" r="7" class="vul"/><path d="M34 0 v2 M34 22 v2 M22 12 h2 M44 12 h2 M26 4 l1.5 1.5 M40.5 18.5 l1.5 1.5 M26 20 l1.5 -1.5 M40.5 5.5 l1.5 -1.5"/>',
    vlok: '<path d="M23 6 V40 M8 14 L38 32 M8 32 L38 14 M19 8 L23 12 L27 8 M19 38 L23 34 L27 38"/>',
  };
  const hoekSvg = (name) => HOEKEN[name] ? `<svg class="nh-hoek-svg" viewBox="0 0 46 46" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HOEKEN[name]}</svg>` : '';
  // Slinger boven de topbalk: dunne lijn in ink met vlaggetjes in --feest (zoals .nh-slinger in het design system)
  function slingerSvg(width) {
    const W = Math.max(300, Math.round(width)), n = Math.max(1, Math.round(W / 300)), seg = W / n;
    let path = 'M0 2', flags = '';
    for (let i = 0; i < n; i++) path += ` Q${(i + 0.5) * seg} 14 ${(i + 1) * seg} 2`;
    for (let x = 14; x < W - 10; x += 24) {
      const t = (x % seg) / seg, y = 2 + 24 * t * (1 - t) * 0.5 * 2 - 0.4;
      flags += `<path class="vlag" d="M${x} ${(y + 1).toFixed(1)} l7 0 l-3.5 9 z"/>`;
    }
    return `<svg class="nh-slinger" viewBox="0 0 ${W} 22" width="${W}" height="22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="${path}"/>${flags}</svg>`;
  }
  // Geen emoji in de huisstijl (dagregel, groet)
  const plain = (t) => (active() && typeof t === 'string' ? t.replace(/\p{Extended_Pictographic}️?\s?/gu, '').replace(/\s{2,}/g, ' ').trim() : t);

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

  return { refresh, choose, describe, byTime, sunToday, NAMES, FEEST, hoekSvg, slingerSvg, plain, active };
})();
