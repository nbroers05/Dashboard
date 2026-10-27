'use strict';

// Weer in Rotterdam via Open-Meteo (geen sleutel nodig), met een fietscheck voor je volgende AH-dienst.
DASH.widget('w-weather', (card, body, guard) => {
  const { h, fmtTime, fmtDay, nl } = DASH;
  const LAT = 51.9225, LON = 4.4792;
  const BIKE_MIN = 25;
  const Q = 15 * 60 * 1000;

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

  const CODES = {
    0: ['Helder', '☀️', '🌙'], 1: ['Overwegend helder', '🌤️', '🌙'], 2: ['Half bewolkt', '⛅', '☁️'], 3: ['Bewolkt', '☁️'],
    45: ['Mist', '🌫️'], 48: ['Rijpmist', '🌫️'], 51: ['Lichte motregen', '🌦️'], 53: ['Motregen', '🌦️'], 55: ['Dichte motregen', '🌧️'],
    56: ['IJzel', '🧊'], 57: ['IJzel', '🧊'], 61: ['Lichte regen', '🌦️'], 63: ['Regen', '🌧️'], 65: ['Zware regen', '🌧️'],
    66: ['IJzel', '🧊'], 67: ['IJzel', '🧊'], 71: ['Lichte sneeuw', '🌨️'], 73: ['Sneeuw', '🌨️'], 75: ['Zware sneeuw', '❄️'],
    77: ['Korrelsneeuw', '🌨️'], 80: ['Lichte buien', '🌦️'], 81: ['Buien', '🌧️'], 82: ['Zware buien', '⛈️'],
    85: ['Sneeuwbuien', '🌨️'], 86: ['Zware sneeuwbuien', '❄️'], 95: ['Onweer', '⛈️'], 96: ['Onweer met hagel', '⛈️'], 99: ['Onweer met hagel', '⛈️'],
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

  function render() {
    if (!wx) return;
    const c = wx.current;
    const now = Date.now();
    const [desc, dayIcon, nightIcon] = CODES[c.weather_code] || ['', '🌡️'];
    const icon = !c.is_day && nightIcon ? nightIcon : dayIcon;

    const top = h('div', 'wx-now');
    top.append(h('div', 'wx-icon', icon));
    const t = h('div');
    t.append(h('div', 'w-big', `${Math.round(c.temperature_2m)}°`), h('div', 'w-sub', desc));
    top.append(t);
    const details = h('div', 'w-sub');
    details.append(
      h('div', null, `Voelt als ${Math.round(c.apparent_temperature)}°`),
      h('div', null, `Wind ${DIRS[Math.round(c.wind_direction_10m / 22.5) % 16]} ${Math.round(c.wind_speed_10m)} km/u (bft ${beaufort(c.wind_speed_10m)}), stoten ${Math.round(c.wind_gusts_10m)}`),
    );

    // Komende 2 uur per kwartier
    const next = slots().filter((q) => q.end > now).slice(0, 8);
    const max = Math.max(0.5, ...next.map((q) => q.mm));
    const firstWet = next.find((q) => q.mm >= 0.05);
    const firstDry = firstWet && next.slice(next.indexOf(firstWet)).find((q) => q.mm < 0.05);
    let summary;
    if (!firstWet) summary = 'Droog de komende 2 uur';
    else if (next.indexOf(firstWet) === 0) summary = firstDry ? `Regen, droog rond ${fmtTime(firstDry.end - Q)}` : 'Regen de komende 2 uur';
    else summary = `Regen vanaf ± ${fmtTime(firstWet.end - Q)}`;

    const chart = h('div', 'wx-rain');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', summary);
    for (const q of next) {
      const bar = h('i', q.mm < 0.05 ? 'dry' : '');
      bar.style.height = `${Math.max(6, (q.mm / max) * 100)}%`;
      bar.title = `${fmtTime(q.end - Q)}–${fmtTime(q.end)}: ${nl(q.mm)} mm`;
      chart.append(bar);
    }
    const axis = h('div', 'wx-axis');
    if (next.length) axis.append(h('span', null, 'nu'), h('span', null, fmtTime(next[next.length - 1].end)));

    // Links het weer van nu, rechts de regen (op de telefoon onder elkaar)
    const left = h('div', 'wx-col');
    left.append(top, details);
    const right = h('div', 'wx-col');
    right.append(h('div', 'w-sub', summary), chart, axis);
    const grid = h('div', 'wx-grid');
    grid.append(left, right);

    body.replaceChildren(grid, commute(now));
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
      box.append(h('span', 'w-sub', '🚲 Geen AH-dienst gepland in je agenda.'));
      return box;
    }
    const leave = shift.start - BIKE_MIN * 60000;
    const when = `${fmtDay(shift.start)} ${fmtTime(shift.start)}`;
    const r = rainBetween(leave, shift.start);
    if (!r.known) {
      box.append(h('span', null, `🚲 AH ${when}. Nog te ver vooruit voor een regenvoorspelling.`));
      return box;
    }
    let verdict, cls;
    if (r.mm < 0.1 && r.prob < 40) { verdict = 'droog'; cls = 'good'; }
    else if (r.mm < 0.1) { verdict = `kans op een bui (${r.prob}%)`; cls = ''; }
    else { verdict = `regen (${nl(r.mm)} mm)`; cls = 'bad'; }
    const line = h('div', 'w-row');
    const txt = h('span', null, `🚲 AH ${when}, vertrek ${fmtTime(leave)}`);
    line.append(txt, h('span', `w-pill ${cls}`, verdict));
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
