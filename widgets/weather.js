'use strict';

// Weer in Rotterdam via Open-Meteo (geen sleutel nodig), met een fietscheck voor je volgende AH-dienst.
// Klik op het vak: popup in de stijl van een weer-app (per uur, 10 dagen, wind, UV, vocht, neerslag, zon).
// Iconen: Meteocons van Bas Milius (MIT-licentie), geanimeerd.
DASH.widget('w-weather', (card, body, guard) => {
  const { h, fmtTime, fmtDay, nl, startOfDay, RAIN_MIN } = DASH;
  const { lat: LAT, lon: LON } = DASH.HOME;
  const BIKE_MIN = 25;
  const Q = 15 * 60 * 1000;
  const ICONS = 'https://cdn.jsdelivr.net/gh/basmilius/weather-icons@2.0.0/production/fill/all/';

  const URL_ = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: LAT, longitude: LON,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index',
    minutely_15: 'precipitation',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,daylight_duration,uv_index_max',
    past_days: 1,
    forecast_days: 10,
    timezone: 'Europe/Amsterdam',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  });

  let wx = null;
  let rain = null;
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
  const code = (c) => CODES[c] || ['', 'cloudy', 'cloudy', '🌡️'];
  const DIRS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];
  const dirName = (deg) => DIRS[Math.round(deg / 22.5) % 16];
  const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const beaufort = (kmh) => { const i = BFT.findIndex((v) => kmh < v); return i < 0 ? 12 : i; };
  const deg = (t) => `${Math.round(t)}°`;

  // Dagwaarden van vandaag en gisteren (door past_days=1 is index 0 gisteren)
  function dayIndex(offset = 0) {
    const t = startOfDay(Date.now()) / 1000;
    const i = wx.daily.time.findIndex((x) => x >= t - 3600);
    return i < 0 ? -1 : i + offset;
  }
  const daily = (key, offset = 0) => wx.daily[key][dayIndex(offset)];

  // Neerslag per kwartier uit het weermodel; een waarde op tijd T is de som van het kwartier dáárvoor
  function rainBetween(from, to) {
    const m = wx.minutely_15;
    const s = m.time.map((t, i) => ({ end: t * 1000, mm: m.precipitation[i] || 0 })).filter((q) => q.end > from && q.end - Q < to);
    const hr = wx.hourly;
    let prob = 0;
    hr.time.forEach((t, i) => {
      const start = t * 1000;
      if (start + 3600000 > from && start < to) prob = Math.max(prob, hr.precipitation_probability[i] || 0);
    });
    return { mm: s.reduce((a, q) => a + q.mm, 0), prob, known: s.length > 0 };
  }

  // Hetzelfde icoon hergebruiken bij elke verversing, anders herstart de animatie
  let iconCache = { name: null, el: null };
  function bigIcon(name, emoji) {
    if (iconCache.name === name) return iconCache.el;
    const box = h('div', 'wx-icon');
    iconCache = { name, el: box };
    box.append(iconImg(name, emoji));
    return box;
  }
  function iconImg(name, emoji) {
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onerror = () => img.replaceWith(h('span', 'fallback', emoji));
    img.src = `${ICONS}${name}.svg`;
    return img;
  }

  // ---------- Het vak ----------
  function render() {
    if (!wx) return;
    const c = wx.current;
    const now = Date.now();
    const [desc, dayIcon, nightIcon, emoji] = code(c.weather_code);
    const wetSoon = rain ? rain.slots.slice(0, 12).some((s) => s.mmh >= RAIN_MIN) : false;
    const wet = wetSoon || c.weather_code >= 51;

    // Vakkleur beweegt mee: grijsblauw bij regen, geel bij zon, hemelsblauw bij droog
    card.style.setProperty('--wx', wet ? 'var(--c-rain)' : c.is_day && c.weather_code <= 1 ? 'var(--c-sunny)' : 'var(--c-sky)');

    const top = h('div', 'wx-top');
    const temp = h('div', 'wx-temp');
    temp.append(
      h('div', 'w-big', deg(c.temperature_2m)),
      h('div', 'w-mid', desc),
      h('div', 'w-sub', `Voelt als ${deg(c.apparent_temperature)} · ${dirName(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} km/u (bft ${beaufort(c.wind_speed_10m)})`),
    );
    top.append(bigIcon(c.is_day ? dayIcon : nightIcon, emoji), temp);

    const today = h('div', 'wx-today');
    const cell = (label, value) => { const d = h('div'); d.append(h('span', 'w-label', label), h('b', null, value)); return d; };
    today.append(
      cell('Min / max', `${deg(daily('temperature_2m_min'))} / ${deg(daily('temperature_2m_max'))}`),
      cell('Regenkans', `${daily('precipitation_probability_max') ?? 0}%`),
      cell('Zon', `${fmtTime(daily('sunrise') * 1000)}–${fmtTime(daily('sunset') * 1000)}`),
    );

    body.replaceChildren(top, today, commute(now));
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
      DASH.alert('ah-rain', null);
      return box;
    }
    const leave = shift.start - BIKE_MIN * 60000;
    const when = `${fmtDay(shift.start)} ${fmtTime(shift.start)}`;
    const line = h('div', 'w-row');
    let verdict, cls = '';

    // Binnen bereik van de radar (komende 2 uur): dezelfde bron als het buienalarm. Verder weg: het weermodel.
    const radarSlots = rain && rain.slots.length && rain.slots[rain.slots.length - 1].end >= shift.start
      ? rain.slots.filter((s) => s.end > leave && s.start < shift.start) : null;
    if (radarSlots) {
      const peak = Math.max(0, ...radarSlots.map((s) => s.mmh));
      if (peak < RAIN_MIN) { verdict = 'droog'; cls = 'good'; }
      else { verdict = `regen ${nl(peak)} mm/u`; cls = 'bad'; }
    } else {
      const r = rainBetween(leave, shift.start);
      if (!r.known) verdict = 'nog te ver vooruit';
      else if (r.mm < 0.1 && r.prob < 40) { verdict = 'droog'; cls = 'good'; }
      else if (r.mm < 0.1) verdict = `kans op bui ${r.prob}%`;
      else { verdict = `regen ${nl(r.mm)} mm`; cls = 'bad'; }
    }
    line.append(h('span', null, `🚲 AH ${when} · weg om ${fmtTime(leave)}`), h('span', `w-pill ${cls}`, verdict));
    box.append(line);
    shiftAlerts(shift, leave, cls, verdict, now);
    return box;
  }

  // Meldingen: regen vlak voor (heen fietsen) of tijdens je volgende AH-dienst, als die binnen een dag is
  function shiftAlerts(shift, leave, cls, verdict, now) {
    const list = [];
    if (shift.start - now < 24 * 3600000) {
      const span = `${fmtDay(shift.start)} ${fmtTime(shift.start)}–${fmtTime(shift.end)}`;
      if (cls === 'bad' || verdict.startsWith('kans')) {
        list.push({ level: cls === 'bad' ? 'warn' : 'info', icon: '🌧️', text: 'Regen als je naar AH fietst', sub: `Weg om ${fmtTime(leave)} · ${verdict}` });
      }
      const during = rainBetween(shift.start, shift.end);
      if (during.known && (during.mm >= 0.5 || during.prob >= 50)) {
        list.push({ level: 'info', icon: '☔', text: 'Regen tijdens je AH-dienst', sub: `${span} · ${during.mm >= 0.1 ? `${nl(during.mm)} mm` : `kans ${during.prob}%`}` });
      }
    }
    DASH.alert('ah-rain', list);
  }

  // ---------- Popup ----------
  let popup = null;

  // Achtergrond naar weer en tijdstip
  function scene(c, isDay) {
    const t = c >= 95 ? 'storm' : c >= 71 && c <= 86 && ![80, 81, 82].includes(c) ? 'snow' : c >= 51 ? 'rain' : c >= 45 ? 'fog' : c >= 2 ? 'cloudy' : 'clear';
    return `wx-scene-${t}-${isDay ? 'day' : 'night'}`;
  }

  // Kleur voor een temperatuur op de min/max-balkjes
  const TEMP_STOPS = [[-5, '#a5b4fc'], [0, '#7dd3fc'], [5, '#5eead4'], [10, '#a3e635'], [15, '#facc15'], [20, '#fb923c'], [25, '#f87171']];
  const tempColor = (t) => TEMP_STOPS.reduce((best, s) => (Math.abs(s[0] - t) < Math.abs(best[0] - t) ? s : best))[1];

  const section = (title, cls) => {
    const s = h('section', `wxp-card ${cls || ''}`.trim());
    if (title) s.append(h('h3', 'wxp-title', title));
    return s;
  };

  function hourly() {
    const now = Date.now();
    const hr = wx.hourly;
    const from = Math.floor(now / 3600000) * 3600000;
    const items = [];
    hr.time.forEach((t, i) => {
      const ms = t * 1000;
      if (ms < from || items.length >= 25) return;
      const first = items.length === 0;
      const c = first ? wx.current.weather_code : hr.weather_code[i];
      const isDay = first ? wx.current.is_day : hr.is_day[i];
      const [, d, n, e] = code(c);
      items.push({ at: ms, label: first ? 'Nu' : new Date(ms).getHours().toString().padStart(2, '0'), icon: isDay ? d : n, emoji: e,
        temp: first ? wx.current.temperature_2m : hr.temperature_2m[i], prob: hr.precipitation_probability[i] || 0 });
    });
    // Zon op/onder ertussen, zoals in de weer-app
    const end = items.length ? items[items.length - 1].at + 3600000 : now;
    wx.daily.sunrise.forEach((rise, i) => {
      for (const [ms, name, label] of [[rise * 1000, 'sunrise', 'Zon op'], [wx.daily.sunset[i] * 1000, 'sunset', 'Zon onder']]) {
        if (ms > now && ms < end) items.push({ at: ms, label: fmtTime(ms), icon: name, emoji: '🌅', text: label, sun: true });
      }
    });
    items.sort((a, b) => a.at - b.at);

    const s = section('Per uur', 'wxp-hours');
    const row = h('div', 'wxp-hour-row');
    for (const it of items) {
      const col = h('div', `wxp-hour${it.sun ? ' sun' : ''}`);
      const ic = h('div', 'wxp-hicon');
      ic.append(iconImg(it.icon, it.emoji));
      col.append(h('span', 'wxp-hlabel', it.label), ic);
      if (it.sun) col.append(h('b', 'wxp-htext', it.text));
      else {
        col.append(h('span', 'wxp-prob', it.prob >= 10 ? `${it.prob}%` : ''), h('b', null, deg(it.temp)));
      }
      row.append(col);
    }
    s.append(row);
    return s;
  }

  function tenDays() {
    const d = wx.daily;
    const start = dayIndex();
    const idx = [...Array(10).keys()].map((k) => start + k).filter((i) => i < d.time.length);
    const lo = Math.min(...idx.map((i) => d.temperature_2m_min[i]));
    const hi = Math.max(...idx.map((i) => d.temperature_2m_max[i]));
    const span = Math.max(1, hi - lo);
    const s = section('10-daagse verwachting', 'wxp-days');
    idx.forEach((i, k) => {
      const ms = d.time[i] * 1000;
      const [, icon, , e] = code(d.weather_code[i]);
      const row = h('div', 'wxp-day');
      const name = k === 0 ? 'Vandaag' : new Date(ms).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
      const ic = h('div', 'wxp-dicon');
      ic.append(iconImg(icon, e));
      const p = d.precipitation_probability_max[i] || 0;
      const min = d.temperature_2m_min[i], max = d.temperature_2m_max[i];
      const track = h('div', 'wxp-track');
      const fill = h('i');
      fill.style.left = `${((min - lo) / span) * 100}%`;
      fill.style.width = `${Math.max(4, ((max - min) / span) * 100)}%`;
      fill.style.background = `linear-gradient(90deg, ${tempColor(min)}, ${tempColor(max)})`;
      track.append(fill);
      if (k === 0) {
        const dot = h('b', 'wxp-now');
        dot.style.left = `${((wx.current.temperature_2m - lo) / span) * 100}%`;
        track.append(dot);
      }
      row.append(h('span', 'wxp-dname', name), ic, h('span', 'wxp-prob', p >= 10 ? `${p}%` : ''), h('span', 'wxp-min', deg(min)), track, h('span', 'wxp-max', deg(max)));
      s.append(row);
    });
    return s;
  }

  function stat(title, value, sub, extra) {
    const s = section(title, 'wxp-stat');
    s.append(h('div', 'wxp-value', value));
    if (extra) s.append(extra);
    if (sub) s.append(h('p', 'wxp-sub', sub));
    return s;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  function windCard() {
    const c = wx.current;
    const rose = svg('svg', { viewBox: '0 0 100 100', class: 'wxp-rose', 'aria-hidden': 'true' });
    rose.append(svg('circle', { cx: 50, cy: 50, r: 44, class: 'ring' }));
    for (const [t, x, y] of [['N', 50, 17], ['O', 85, 54], ['Z', 50, 91], ['W', 15, 54]]) {
      const tx = svg('text', { x, y, 'text-anchor': 'middle' });
      tx.textContent = t;
      rose.append(tx);
    }
    // De pijl wijst waar de wind heen waait (de richting is waar hij vandaan komt)
    const arrow = svg('g', { transform: `rotate(${(c.wind_direction_10m + 180) % 360} 50 50)` });
    arrow.append(svg('line', { x1: 50, y1: 72, x2: 50, y2: 30, class: 'shaft' }), svg('path', { d: 'M50 22 L57 34 L43 34 Z', class: 'head' }));
    rose.append(arrow);
    const box = h('div', 'wxp-wind');
    const txt = h('div');
    txt.append(h('div', 'wxp-value', `${Math.round(c.wind_speed_10m)} km/u`), h('p', 'wxp-sub', `Uit het ${dirName(c.wind_direction_10m)} · bft ${beaufort(c.wind_speed_10m)}`), h('p', 'wxp-sub', `Windstoten ${Math.round(c.wind_gusts_10m)} km/u`));
    box.append(txt, rose);
    const s = section('Wind', 'wxp-stat');
    s.append(box);
    return s;
  }

  function uvCard() {
    const uv = wx.current.uv_index ?? 0;
    const label = uv < 3 ? 'Laag' : uv < 6 ? 'Matig' : uv < 8 ? 'Hoog' : uv < 11 ? 'Zeer hoog' : 'Extreem';
    const bar = h('div', 'wxp-uvbar');
    const dot = h('b');
    dot.style.left = `${Math.min(100, (uv / 11) * 100)}%`;
    bar.append(dot);
    return stat('UV-index', `${Math.round(uv)} ${label}`, `Vandaag max ${Math.round(daily('uv_index_max') ?? 0)}`, bar);
  }

  function sunCard() {
    const rise = daily('sunrise') * 1000, set = daily('sunset') * 1000;
    const now = Date.now();
    const p = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
    const up = now >= rise && now <= set;
    const R = 86, CX = 100, CY = 96;
    const a = Math.PI * (1 - p);
    const x = CX + R * Math.cos(a), y = CY - R * Math.sin(a);
    const s = svg('svg', { viewBox: '0 0 200 104', class: 'sun-arc', role: 'img', 'aria-label': `Zon op ${fmtTime(rise)}, onder ${fmtTime(set)}` });
    const defs = svg('defs', {});
    const grad = svg('linearGradient', { id: 'sunGrad', gradientUnits: 'userSpaceOnUse', x1: CX - R, y1: 0, x2: CX + R, y2: 0 });
    grad.append(svg('stop', { offset: 0, 'stop-color': '#ff8a3d' }), svg('stop', { offset: 1, 'stop-color': '#ffd23f' }));
    defs.append(grad);
    s.append(defs, svg('line', { x1: 4, y1: CY, x2: 196, y2: CY, class: 'sun-horizon' }), svg('path', { d: `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`, class: 'sun-path' }));
    if (p > 0) s.append(svg('path', { d: `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`, class: 'sun-done' }));
    s.append(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 9, class: up ? 'sun-ball' : 'sun-ball down' }));

    const labels = h('div', 'sun-labels');
    const l = h('div'); l.append(h('span', 'w-sub', 'Zon op'), h('b', null, fmtTime(rise)));
    const r = h('div'); r.append(h('span', 'w-sub', 'Zon onder'), h('b', null, fmtTime(set)));
    labels.append(l, r);

    const len = daily('daylight_duration');
    const prev = daily('daylight_duration', -1);
    const mins = Math.round(len / 60);
    let foot = `Daglengte ${Math.floor(mins / 60)}u ${String(mins % 60).padStart(2, '0')}m`;
    if (prev != null) {
      const diff = Math.round(len - prev), abs = Math.abs(diff);
      foot += ` · ${Math.floor(abs / 60)} min ${abs % 60} s ${diff < 0 ? 'korter' : 'langer'} dan gisteren`;
    }
    const sec = section('Zon', 'wxp-stat wxp-sun');
    sec.append(s, labels, h('p', 'wxp-sub', foot));
    return sec;
  }

  function fillPopup() {
    const c = wx.current;
    const [desc] = code(c.weather_code);
    popup.dialog.className = `panel-dialog wx-dialog ${scene(c.weather_code, c.is_day)}`;

    const hero = h('div', 'wxp-hero');
    hero.append(
      h('p', 'wxp-place', 'Rotterdam'),
      h('div', 'wxp-temp', deg(c.temperature_2m)),
      h('p', 'wxp-desc', desc),
      h('p', 'wxp-hilo', `H: ${deg(daily('temperature_2m_max'))}  L: ${deg(daily('temperature_2m_min'))} · voelt als ${deg(c.apparent_temperature)}`),
    );

    const next24 = wx.hourly.time.reduce((sum, t, i) => (t * 1000 > Date.now() && t * 1000 <= Date.now() + 86400000 ? sum + (wx.hourly.precipitation[i] || 0) : sum), 0);
    const grid = h('div', 'wxp-grid');
    grid.append(
      windCard(),
      uvCard(),
      stat('Luchtvochtigheid', `${Math.round(c.relative_humidity_2m)}%`, `Dauwpunt ${deg(c.dew_point_2m)}`),
      stat('Neerslag', `${daily('precipitation_probability_max') ?? 0}%`, `Kans op regen vandaag. ${nl(daily('precipitation_sum') || 0)} mm vandaag, ${nl(next24)} mm in de komende 24 uur.`),
      sunCard(),
    );
    popup.body.replaceChildren(hero, hourly(), tenDays(), grid);
  }

  function openPopup() {
    if (!wx) return;
    if (!popup) popup = DASH.panel('Weer');
    fillPopup();
    popup.open();
    popup.body.scrollTop = 0;
  }

  card.classList.add('clickable');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-label', 'Weer, klik voor de verwachting');
  card.addEventListener('click', (e) => { if (!e.target.closest('.tile-move, .tile-resize') && !card.closest('.editing')) openPopup(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopup(); } });

  const load = guard(async () => {
    wx = await DASH.getJSON(URL_);
    render();
    // Open popup bijwerken met de nieuwe verwachting (niet elke minuut, dan springt de lijst per uur terug)
    if (popup && popup.dialog.open) fillPopup();
  });
  const loadRain = guard(async () => {
    rain = await DASH.radar();
    render();
  });

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
  DASH.every(10 * 60 * 1000, load);
  DASH.every(5 * 60 * 1000, loadRain);
  DASH.every(60 * 1000, guard(render));
  load();
  loadRain();
});
