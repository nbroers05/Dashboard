'use strict';

// Weer in Rotterdam via Open-Meteo (geen sleutel nodig), met een fietscheck voor je volgende AH-dienst.
// Iconen: Meteocons van Bas Milius (MIT-licentie), geanimeerd.
DASH.widget('w-weather', (card, body, guard) => {
  const { h, fmtTime, fmtDay, nl } = DASH;
  const LAT = 51.9225, LON = 4.4792;
  const BIKE_MIN = 25;
  const Q = 15 * 60 * 1000;
  const ICONS = 'https://cdn.jsdelivr.net/gh/basmilius/weather-icons@2.0.0/production/fill/all/';

  const URL_ = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: LAT, longitude: LON,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    minutely_15: 'precipitation',
    hourly: 'precipitation_probability',
    forecast_days: 7,
    timezone: 'Europe/Amsterdam',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  });

  let wx = null;
  let calendar = null;

  // [omschrijving, Meteocons-icoon overdag, 's nachts, emoji als het icoon niet laadt]
  const CODES = {
    0: ['Helder', 'clear-day', 'clear-night', '☀️'], 1: ['Overwegend helder', 'clear-day', 'clear-night', '🌤️'],
    2: ['Half bewolkt', 'partly-cloudy-day', 'partly-cloudy-night', '⛅'], 3: ['Bewolkt', 'overcast', 'overcast', '☁️'],
    45: ['Mist', 'fog-day', 'fog-night', '🌫️'], 48: ['Rijpmist', 'fog-day', 'fog-night', '🌫️'],
    51: ['Lichte motregen', 'drizzle', 'drizzle', '🌦️'], 53: ['Motregen', 'drizzle', 'drizzle', '🌦️'], 55: ['Dichte motregen', 'drizzle', 'drizzle', '🌧️'],
    56: ['IJzel', 'sleet', 'sleet', '🧊'], 57: ['IJzel', 'sleet', 'sleet', '🧊'],
    61: ['Lichte regen', 'rain', 'rain', '🌦️'], 63: ['Regen', 'rain', 'rain', '🌧️'], 65: ['Zware regen', 'rain', 'rain', '🌧️'],
    66: ['IJzel', 'sleet', 'sleet', '🧊'], 67: ['IJzel', 'sleet', 'sleet', '🧊'],
    71: ['Lichte sneeuw', 'snow', 'snow', '🌨️'], 73: ['Sneeuw', 'snow', 'snow', '🌨️'], 75: ['Zware sneeuw', 'snow', 'snow', '❄️'], 77: ['Korrelsneeuw', 'snow', 'snow', '🌨️'],
    80: ['Lichte buien', 'partly-cloudy-day-rain', 'partly-cloudy-night-rain', '🌦️'], 81: ['Buien', 'partly-cloudy-day-rain', 'partly-cloudy-night-rain', '🌧️'], 82: ['Zware buien', 'thunderstorms-rain', 'thunderstorms-rain', '⛈️'],
    85: ['Sneeuwbuien', 'partly-cloudy-day-snow', 'partly-cloudy-night-snow', '🌨️'], 86: ['Zware sneeuwbuien', 'snow', 'snow', '❄️'],
    95: ['Onweer', 'thunderstorms-day-rain', 'thunderstorms-night-rain', '⛈️'], 96: ['Onweer met hagel', 'hail', 'hail', '⛈️'], 99: ['Onweer met hagel', 'hail', 'hail', '⛈️'],
  };
  const DIRS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];
  const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const beaufort = (kmh) => { const i = BFT.findIndex((v) => kmh < v); return i < 0 ? 12 : i; };

  // Neerslag per kwartier; een waarde op tijd T is de som van het kwartier dáárvoor
  function slots() {
    const m = wx.minutely_15;
    return m.time.map((t, i) => ({ end: t * 1000, mm: m.precipitation[i] || 0 }));
  }

  function rainBetween(from, to) {
    const s = slots().filter((q) => q.end > from && q.end - Q < to);
    const mm = s.reduce((a, q) => a + q.mm, 0);
    const hr = wx.hourly;
    let prob = 0;
    hr.time.forEach((t, i) => {
      const start = t * 1000;
      if (start + 3600000 > from && start < to) prob = Math.max(prob, hr.precipitation_probability[i] || 0);
    });
    return { mm, prob, known: s.length > 0 };
  }

  // Hetzelfde icoon hergebruiken bij elke verversing, anders herstart de animatie
  let iconCache = { name: null, el: null };
  function icon(name, emoji) {
    if (iconCache.name === name) return iconCache.el;
    const box = h('div', 'wx-icon');
    iconCache = { name, el: box };
    const img = new Image();
    img.alt = '';
    img.onerror = () => box.replaceChildren(h('div', 'fallback', emoji));
    img.src = `${ICONS}${name}.svg`;
    box.append(img);
    return box;
  }

  function render() {
    if (!wx) return;
    const c = wx.current;
    const now = Date.now();
    const [desc, dayIcon, nightIcon, emoji] = CODES[c.weather_code] || ['', 'cloudy', 'cloudy', '🌡️'];
    const next = slots().filter((q) => q.end > now).slice(0, 8);
    const wet = next.some((q) => q.mm >= 0.05) || c.weather_code >= 51;

    // Vakkleur beweegt mee: grijsblauw bij regen, geel bij zon, hemelsblauw bij droog
    card.style.setProperty('--wx', wet ? 'var(--c-rain)' : c.is_day && c.weather_code <= 1 ? 'var(--c-sunny)' : 'var(--c-sky)');

    const top = h('div', 'wx-top');
    const temp = h('div', 'wx-temp');
    const big = h('div', 'w-big', `${Math.round(c.temperature_2m)}°`);
    temp.append(big, h('div', 'w-mid', desc), h('div', 'w-sub', `Voelt als ${Math.round(c.apparent_temperature)}° · ${DIRS[Math.round(c.wind_direction_10m / 22.5) % 16]} ${Math.round(c.wind_speed_10m)} km/u (bft ${beaufort(c.wind_speed_10m)})`));
    top.append(icon(c.is_day ? dayIcon : nightIcon, emoji), temp);

    // Staafgrafiek: neerslag per kwartier, komende 2 uur
    const max = Math.max(1, Math.ceil(Math.max(...next.map((q) => q.mm), 0) * 2) / 2);
    const chart = h('div', 'wx-chart');
    const firstWet = next.find((q) => q.mm >= 0.05);
    const summary = !firstWet ? 'Droog de komende 2 uur' : next.indexOf(firstWet) === 0 ? 'Het regent nu' : `Regen vanaf ± ${fmtTime(firstWet.end - Q)}`;
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', summary);
    const scale = h('div', 'wx-scale');
    scale.append(h('span', null, `${nl(max)} mm`), h('span', null, '0'));
    chart.append(scale);
    next.forEach((q) => {
      const bar = h('div', `wx-bar${q.mm < 0.05 ? ' dry' : ''}`);
      const fill = h('i');
      fill.style.height = `${Math.min(100, (q.mm / max) * 100)}%`;
      bar.title = `${fmtTime(q.end - Q)}–${fmtTime(q.end)}: ${nl(q.mm)} mm`;
      bar.append(fill);
      chart.append(bar);
    });
    chart.append(h('div'));
    next.forEach((q, i) => chart.append(h('div', 'wx-x', i === 0 ? 'nu' : i % 2 === 0 ? fmtTime(q.end - Q) : '')));

    const head = h('div', 'w-row');
    head.append(h('span', 'w-label', 'Regen per kwartier'), h('span', 'w-sub', summary));
    body.replaceChildren(top, head, chart, commute(now));
  }

  function commute(now) {
    const box = h('div', 'wx-commute');
    if (!calendar || !calendar.connected) {
      box.append(h('span', 'w-sub', '🚲 Koppel je agenda voor de fietscheck naar AH.'));
      return box;
    }
    const shift = calendar.events
      .filter((e) => DASH.isAH(e) && e.start - BIKE_MIN * 60000 > now - 5 * 60000)
      .sort((a, b) => a.start - b.start)[0];
    if (!shift) {
      box.append(h('span', 'w-sub', '🚲 Geen AH-dienst gepland.'));
      return box;
    }
    const leave = shift.start - BIKE_MIN * 60000;
    const when = `${fmtDay(shift.start)} ${fmtTime(shift.start)}`;
    const r = rainBetween(leave, shift.start);
    const line = h('div', 'w-row');
    if (!r.known) {
      line.append(h('span', null, `🚲 AH ${when}`), h('span', 'w-pill', 'nog te ver vooruit'));
    } else {
      let verdict, cls;
      if (r.mm < 0.1 && r.prob < 40) { verdict = 'droog'; cls = 'good'; }
      else if (r.mm < 0.1) { verdict = `kans op bui ${r.prob}%`; cls = ''; }
      else { verdict = `regen ${nl(r.mm)} mm`; cls = 'bad'; }
      line.append(h('span', null, `🚲 AH ${when} · weg om ${fmtTime(leave)}`), h('span', `w-pill ${cls}`, verdict));
    }
    box.append(line);
    return box;
  }

  const load = guard(async () => {
    wx = await DASH.getJSON(URL_);
    render();
  });

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
  DASH.every(10 * 60 * 1000, load);
  DASH.every(60 * 1000, guard(render));
  load();
});
