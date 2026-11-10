'use strict';

// Google Agenda voor de planner: alleen lezen, er staat hier geen enkele schrijfactie naar Google.
// Regels voor Canvas, verjaardagen, AH en F1 komen uit calendar.js, dash.js en canvas.js van het dashboard
// (die bestanden zitten vast aan de opmaak van het dashboard, dus hier een eigen kopie van de hulpjes).
// Sleutel, in deze volgorde: token van het dashboard in deze browser, hulpprogramma op de pc, inlogbundel (vault.json).
window.PlannerAgenda = (() => {
  const API = 'https://www.googleapis.com/calendar/v3';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  const HELPER = 'http://127.0.0.1:8765/token?which=main';
  const REFETCH = 5 * 60 * 1000;
  const DEMO = new URLSearchParams(location.search).has('demo');
  const KEY = { token: 'planner.gtoken', refresh: 'planner.google', cache: 'planner.events' };

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // Kleur van een losse afspraak in Google (colorId), met de tinten die Google Agenda zelf laat zien
  const EVENT_COLORS = {
    1: '#7986CB', 2: '#33B679', 3: '#8E24AA', 4: '#E67C73', 5: '#F6BF26', 6: '#F4511E',
    7: '#039BE5', 8: '#616161', 9: '#3F51B5', 10: '#0B8043', 11: '#D50000',
  };
  const validColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);

  let events = [];
  let calendars = [];
  let fetchedAt = 0;
  let state = 'loading';      // ok | locked | error
  let loaded = [0, 0];
  let complete = false;       // false als een agenda deze ronde niet laadde: dan niets inplannen op een half beeld
  let wanted = [0, 0];
  let timer = null;
  let badDashToken = null;
  let onChange = () => {};

  // ---------- Hulpjes ----------
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ms, n) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };

  const isCanvasCal = (cal) => /canvas/i.test(`${cal.summary || ''} ${cal.summaryOverride || ''}`);
  const isBirthdayCal = (cal) => /#contacts@group\.v\.calendar\.google\.com$/.test(cal.id || '');
  function birthdayName(e, cal) {
    if (e.eventType !== 'birthday' && !isBirthdayCal(cal)) return null;
    const t = (e.summary || '').trim();
    return t.replace(/^(?:verjaardag van|birthday of|happy birthday,?)\s+/i, '')
      .replace(/(?:['’]s|['’])?\s+(?:verjaardag|birthday)$/i, '')
      .replace(/\s+is jarig$/i, '').trim() || t;
  }
  function canvasLink(text) {
    const m = (text || '').match(/https?:\/\/[^\s"'<>]*(?:instructure\.com|\/courses\/\d+)[^\s"'<>]*/);
    return m ? m[0] : null;
  }

  function simplify(e, cal) {
    if (e.status === 'cancelled') return null;
    const me = (e.attendees || []).find((a) => a.self);
    if (me && me.responseStatus === 'declined') return null;
    const allDay = !!e.start.date;
    const canvas = isCanvasCal(cal) || /instructure\.com|\/courses\/\d+/.test(e.description || '');
    const birthday = birthdayName(e, cal);
    return {
      id: `${cal.id}/${e.id}`,
      title: e.summary || '(Geen titel)',
      allDay,
      start: allDay ? parseDate(e.start.date) : Date.parse(e.start.dateTime),
      end: allDay ? parseDate(e.end.date) : Date.parse(e.end.dateTime),
      link: e.htmlLink || null,
      hidden: !(cal.selected || cal.primary),
      cal: cal.id,
      ...(EVENT_COLORS[e.colorId] ? { eventColor: EVENT_COLORS[e.colorId] } : {}),
      ...(birthday ? { birthday } : {}),
      ...(canvas ? { canvas: true, assignment: /assignment/i.test(e.iCalUID || ''), canvasUrl: canvasLink(e.description) } : {}),
    };
  }

  // ---------- Korte F1-titels (uit calendar.js) ----------
  const F1 = /formula\s*1|(^|\W)f1\b/i;
  const F1_PLACES = [
    [/m[eé]xico/i, 'Mexico'], [/s[aã]o paulo|brazil|brasil/i, 'Brazilië'], [/las vegas/i, 'Las Vegas'],
    [/qatar/i, 'Qatar'], [/abu dhabi/i, 'Abu Dhabi'], [/miami/i, 'Miami'],
    [/united states|\busa?\b|austin|am[eé]ricas/i, 'Austin'], [/singapore/i, 'Singapore'],
    [/azerbaijan|baku/i, 'Bakoe'], [/madrid/i, 'Madrid'], [/barcelona|catalunya/i, 'Barcelona'],
    [/espa[ñn]a|spain/i, 'Spanje'], [/australia/i, 'Australië'], [/china|chinese/i, 'China'],
    [/japan/i, 'Japan'], [/bahrain/i, 'Bahrein'], [/saudi/i, 'Saoedi-Arabië'], [/canad/i, 'Canada'],
    [/monaco/i, 'Monaco'], [/austria|österreich/i, 'Oostenrijk'], [/british|britain|silverstone/i, 'Silverstone'],
    [/belgi/i, 'België'], [/hungar|magyar/i, 'Hongarije'], [/dutch|netherlands|nederland|zandvoort/i, 'Zandvoort'],
    [/emilia|imola/i, 'Imola'], [/ital|monza/i, 'Monza'],
  ];
  const F1_SESSIONS = [
    [/sprint\s*(qualifying|shootout|kwal)/i, 'Sprint-quali'], [/qualifying|kwalificatie/i, 'Quali'],
    [/sprint/i, 'Sprint'], [/practice\s*1|fp1|vt1/i, 'FP1'], [/practice\s*2|fp2|vt2/i, 'FP2'],
    [/practice\s*3|fp3|vt3/i, 'FP3'], [/race|grand prix|gran premio/i, 'Race'],
  ];
  function label(ev) {
    const t = ev.title || '';
    if (!F1.test(t)) return t;
    const parts = t.split(/\s+[-–—]\s+/);
    const tail = parts.length > 1 ? parts[parts.length - 1] : '';
    const head = parts.length > 1 ? parts.slice(0, -1).join(' ') : t;
    const place = (F1_PLACES.find(([re]) => re.test(head)) || [])[1] ||
      head.replace(/formula\s*1|\bf1\b|grand prix|gran premio( de( la)?)?|\b\d{4}\b|[^\p{L}\s]/giu, ' ')
        .trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()).replace(/\s+/g, ' ');
    const session = tail && (F1_SESSIONS.find(([re]) => re.test(tail)) || [])[1];
    return `F1 ${place}${session ? ` - ${session}` : tail ? ` - ${tail}` : ''}`;
  }

  const isAH = (ev) => !ev.allDay && /\bAH\b/.test(ev.title || '');
  const isF1 = (ev) => F1.test(ev.title || '');
  const dueOf = (ev) => (ev.allDay ? ev.end - 1 : ev.end);
  const cleanDeadline = (t) => t.replace(/\s*\[[^\]]*\]\s*$/, '').trim() || t;

  // Afvinken op het dashboard ("ingeleverd") geldt hier ook; alleen lezen uit deze browser
  function handedIn() {
    const m = store.get('canvas.doneMap') || {};
    return new Set(Object.keys(m).filter((id) => Array.isArray(m[id]) && m[id][0] === 1));
  }
  function deadlinePool() {
    const canvas = events.filter((e) => e.canvas);
    return canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
  }
  function deadlines() {
    const done = handedIn();
    return deadlinePool().filter((e) => !done.has(e.id)).map((e) => ({ id: e.id, due: dueOf(e), title: cleanDeadline(e.title), url: e.canvasUrl || e.link || null }));
  }
  // Vakcodes uit de Canvas-agenda: "Essay week 6 [ESSB-MP6020]" geeft "ESSB-MP6020"
  function courses() {
    const found = new Set();
    for (const e of events) {
      if (!e.canvas) continue;
      const m = (e.title || '').match(/\[([^\]]+)\]\s*$/);
      if (m) found.add(m[1].trim());
    }
    return [...found].filter(Boolean).sort();
  }

  // ---------- Regen onderweg naar de dienst (zelfde bronnen en regenregel als DASH.radar op het dashboard) ----------
  const HOME = { lat: 51.9225, lon: 4.4792 };   // Rotterdam
  const FIVE = 5 * 60000;
  const RAIN_MIN = 0.1;     // mm per uur: vanaf hier telt het als regen
  const TRIP = 30 * 60000;  // hoe lang voor de dienst je onderweg bent
  let radar = { at: 0, slots: null };

  async function buienradar() {
    const res = await fetch(`https://gpsgadget.buienradar.nl/data/raintext?lat=${HOME.lat.toFixed(2)}&lon=${HOME.lon.toFixed(2)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const now = Date.now();
    const slots = [];
    let prev = null;
    for (const line of (await res.text()).trim().split(/\r?\n/)) {
      const m = line.match(/^(\d+)\|(\d{1,2}):(\d{2})/);
      if (!m) continue;
      const d = new Date(now);
      d.setHours(Number(m[2]), Number(m[3]), 0, 0);
      let t = d.getTime();
      if (prev == null) {
        if (t - now > 12 * 3600000) t -= 86400000;
        if (now - t > 12 * 3600000) t += 86400000;
      } else {
        while (t <= prev) t += 86400000;
      }
      prev = t;
      const v = Number(m[1]);
      slots.push({ start: t, end: t + FIVE, mmh: v ? 10 ** ((v - 109) / 32) : 0 });
    }
    if (slots.length < 6) throw new Error('Buienradar gaf geen bruikbare data');
    return slots;
  }
  async function openMeteo() {
    const qs = new URLSearchParams({ latitude: HOME.lat, longitude: HOME.lon, minutely_15: 'precipitation', forecast_minutely_15: 12, timezone: 'Europe/Amsterdam', timeformat: 'unixtime' });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = (await res.json()).minutely_15;
    return m.time.map((t, i) => ({ start: t * 1000 - 3 * FIVE, end: t * 1000, mmh: (m.precipitation[i] || 0) * 4 }));
  }
  function refreshRadar() {
    radar.at = Date.now();
    buienradar().catch(() => openMeteo())
      .then((slots) => { radar.slots = slots; onChange(); })
      .catch((e) => { radar.slots = null; console.warn('[planner] regen', e); });
  }
  // 'droog', 'regen' of null als het niet bekend is. Vraagt hooguit eens per 5 minuten nieuwe gegevens op.
  function commute(start) {
    if (Date.now() - radar.at > FIVE) refreshRadar();
    if (!radar.slots) return null;
    const from = Math.max(Date.now(), start - TRIP);
    const trip = radar.slots.filter((s) => s.end > from && s.start < start);
    if (!trip.length) return null;
    return trip.some((s) => s.mmh >= RAIN_MIN) ? 'regen' : 'droog';
  }

  const birthdays = () => events.filter((e) => e.birthday);
  // Wat er in de tijdlijn als gewoon blok hoort: geen deadlines, geen verjaardagen, geen verborgen agenda's
  const normal = () => {
    const dead = new Set(deadlinePool().map((e) => e.id));
    return events.filter((e) => !e.hidden && !e.birthday && !dead.has(e.id));
  };
  const calendarOf = (id) => calendars.find((c) => c.id === id) || null;
  // De agenda's die in de tijdlijn hun eigen kleur gebruiken. Diensten en F1 hebben een eigen regel in het kleurenmenu.
  function usedCalendars() {
    const used = new Set(normal().filter((e) => !isAH(e) && !isF1(e) && !e.eventColor).map((e) => e.cal));
    return calendars.filter((c) => used.has(c.id));
  }

  // ---------- Toegang ----------
  function ownToken() {
    const t = store.get(KEY.token);
    return t && Date.now() < t.expires - 30000 ? t.access : null;
  }
  function dashToken() {
    const t = store.get('google.token');
    return t && t.access && t.access !== badDashToken && Date.now() < t.expires - 30000 ? t.access : null;
  }

  let helperDownUntil = 0;
  async function fromHelper() {
    if (Date.now() < helperDownUntil) return null;
    try {
      const ctrl = new AbortController();
      const stop = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(HELPER, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(stop));
      return res.ok ? await res.json() : null;
    } catch {
      helperDownUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
  }
  async function fromBundle() {
    const g = store.get('google.refresh') || store.get(KEY.refresh);
    if (!g || !g.main) return null;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: g.client_id, client_secret: g.client_secret, refresh_token: g.main, grant_type: 'refresh_token' }),
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }
  async function token() {
    const have = ownToken() || dashToken();
    if (have) return have;
    const t = await fromHelper() || await fromBundle();
    if (t && t.scope && t.scope.includes(SCOPE)) {
      store.set(KEY.token, { access: t.access_token, expires: Date.now() + t.expires_in * 1000 });
      return t.access_token;
    }
    return null;
  }

  class NoAccess extends Error {}
  async function api(path) {
    const access = await token();
    if (!access) throw new NoAccess();
    let res = await fetch(API + path, { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 401) {
      if (access === ownToken()) store.del(KEY.token); else badDashToken = access;
      const again = await token();
      if (!again) throw new NoAccess();
      res = await fetch(API + path, { headers: { Authorization: `Bearer ${again}` } });
      if (res.status === 401) throw new NoAccess();
    }
    if (!res.ok) throw new Error(`Google-fout ${res.status}`);
    return res.json();
  }

  // Inlogbundel van het dashboard openen, met dezelfde versleuteling als vault.js.
  // Alleen de Google-sleutel wordt bewaard, onder een eigen naam: de inlog van het dashboard blijft zoals hij was.
  async function unlock(password) {
    const res = await fetch(`../vault.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Er staat geen inlogbundel online.');
    const box = await res.json();
    const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(box.salt), iterations: box.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(box.iv) }, key, bytes(box.data))));
    } catch { throw new Error('Verkeerde wachtzin.'); }
    const g = payload.keys && payload.keys['google.refresh'];
    if (!g) throw new Error('In de bundel staat geen Google-koppeling.');
    localStorage.setItem(KEY.refresh, g);
    helperDownUntil = 0;
    await load();
    if (state !== 'ok') throw new Error('Google weigert de koppeling. Koppel Google opnieuw via het hulpprogramma op je pc.');
  }

  // ---------- Ophalen ----------
  async function load() {
    clearTimeout(timer);
    if (DEMO) {
      events = demoEvents();
      calendars = [
        { id: 'demo-rooster', name: 'Rooster', color: '#A58BC9' },
        { id: 'demo-eigen', name: 'Hoofdagenda', color: '#4D96CF' },
        { id: 'demo-geel', name: 'Gele agenda', color: '#FBE983' },
      ];
      fetchedAt = Date.now();
      state = 'ok';
      complete = true;
      return onChange();
    }
    const [from, to] = wanted;
    try {
      const cals = await api('/users/me/calendarList?minAccessRole=reader');
      const qs = new URLSearchParams({
        timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      });
      const visible = cals.items.filter((c) => c.selected || c.primary || isCanvasCal(c) || isBirthdayCal(c));
      let allLoaded = true;
      const pages = async (cal) => {
        const items = [];
        let token = '';
        do {
          const r = await api(`/calendars/${encodeURIComponent(cal.id)}/events?${qs}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
          items.push(...(r.items || []));
          token = r.nextPageToken || '';
        } while (token && items.length < 2500);
        return items;
      };
      const lists = await Promise.all(visible.map((cal) =>
        pages(cal)
          .then((items) => items.map((e) => simplify(e, cal)).filter(Boolean))
          .catch((e) => { if (e instanceof NoAccess) throw e; allLoaded = false; return []; })));
      complete = allLoaded;
      events = lists.flat();
      calendars = visible.map((c) => ({ id: c.id, name: c.primary ? 'Hoofdagenda' : c.summaryOverride || c.summary || 'Agenda', color: validColor(c.backgroundColor) }));
      fetchedAt = Date.now();
      loaded = [from, to];
      state = 'ok';
      store.set(KEY.cache, { fetchedAt, events, calendars, loaded });
    } catch (e) {
      state = e instanceof NoAccess ? 'locked' : 'error';
      console.warn('[planner] agenda', e);
    }
    onChange();
    timer = setTimeout(load, REFETCH);
  }

  // De planner zegt welke periode hij nodig heeft (bekeken week + komende 8 dagen)
  function range(from, to) {
    wanted = [from, to];
    if (DEMO) return;
    if (from < loaded[0] || to > loaded[1]) load();
  }

  function start(from, to, cb) {
    onChange = cb;
    wanted = [from, to];
    const cache = store.get(KEY.cache);
    if (cache && !DEMO) { events = cache.events || []; calendars = cache.calendars || []; fetchedAt = cache.fetchedAt || 0; onChange(); }
    load();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !DEMO && Date.now() - fetchedAt > 60000) load(); });
    window.addEventListener('online', () => { if (!DEMO) load(); });
  }

  function forget() { Object.values(KEY).forEach(store.del); }

  // ---------- Demo ----------
  function demoEvents() {
    const t = startOfDay(Date.now());
    const at = (day, hh, mm = 0) => addDays(t, day) + (hh * 60 + mm) * 60000;
    return [
      { id: 'a', title: 'College Data Science', allDay: false, start: at(0, 9), end: at(0, 10, 50), cal: 'demo-rooster' },
      { id: 'h', title: 'Kapper', allDay: false, start: at(0, 15, 30), end: at(0, 16, 30), cal: 'demo-eigen' },
      { id: 'i', title: 'Gele afspraak', allDay: false, start: at(0, 11), end: at(0, 12), cal: 'demo-geel' },
      { id: 'j', title: 'Salaris', allDay: true, start: t, end: addDays(t, 1), cal: 'demo-eigen', eventColor: '#F4511E' },
      { id: 'b', title: 'AH Berkel', allDay: false, start: at(0, 17), end: at(0, 22) },
      { id: 'c', title: 'Paper inleveren [ESSB-DEMO]', allDay: false, start: at(2, 23, 59), end: at(2, 23, 59), canvas: true, assignment: true, hidden: true },
      { id: 'c2', title: 'Quiz hoofdstuk 3 [ESSB-DEMO]', allDay: false, start: at(0, 23, 59), end: at(0, 23, 59), canvas: true, assignment: true, hidden: true },
      { id: 'd', title: 'Verjaardag Persoon A', allDay: true, start: addDays(t, 3), end: addDays(t, 4), birthday: 'Persoon A', hidden: true },
      { id: 'e', title: 'AH Berkel', allDay: false, start: at(5, 8), end: at(5, 14) },
      { id: 'f', title: '🏁 FORMULA 1 DEMO GRAND PRIX 2026 - Race', allDay: false, start: at(6, 14), end: at(6, 16) },
      { id: 'g', title: 'Werkgroep Cognitie', allDay: false, start: at(1, 11), end: at(1, 13), cal: 'demo-rooster' },
      { id: 'k', title: 'ESSB-DEMO1 - Statistiek', allDay: false, start: at(2, 13), end: at(2, 15), cal: 'demo-rooster' },
      { id: 'l', title: 'ESSB-DEMO2 - Filosofie', allDay: false, start: at(3, 10), end: at(3, 12), cal: 'demo-rooster' },
      { id: 'm', title: 'AH Berkel', allDay: false, start: at(3, 17), end: at(3, 21) },
      { id: 'n', title: 'ESSB-DEMO1 - Statistiek', allDay: false, start: at(8, 13), end: at(8, 15), cal: 'demo-rooster' },
      { id: 'o', title: 'AH Berkel', allDay: false, start: at(9, 12), end: at(9, 18) },
    ];
  }

  return {
    start, range, load, unlock, forget, label, isAH, isF1, deadlines, birthdays, normal, courses, commute, calendarOf, usedCalendars,
    get state() { return state; },
    get complete() { return complete; },
    covers: (from, to) => DEMO || (from >= loaded[0] && to <= loaded[1]),
    get fetchedAt() { return fetchedAt; },
    get events() { return events; },
  };
})();
