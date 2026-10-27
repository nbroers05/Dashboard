'use strict';

(() => {
  const CLIENT_ID = (window.DASHBOARD_CONFIG || {}).googleClientId || '';
  const CONFIGURED = CLIENT_ID && !/PLAK_HIER/.test(CLIENT_ID);
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  // Gmail alleen lezen, voor het mailvak (widgets/mail.js). Mag ontbreken: dan werkt de agenda gewoon en vraagt het mailvak erom.
  const GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';
  // Google Health API (stappen, slaap, hartslag) voor widgets/health.js; alleen lezen.
  // Eigen token met álleen deze scopes: Google Health weigert een token waar ook agenda/Gmail in zit (DISALLOWED_OAUTH_SCOPES).
  const HEALTH = ['activity_and_fitness', 'sleep', 'health_metrics_and_measurements'].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`);
  const API = 'https://www.googleapis.com/calendar/v3';
  const DEMO = new URLSearchParams(location.search).has('demo');

  const DAYS = 7;                    // hoeveel dagen vooruit
  const REFETCH = 5 * 60 * 1000;     // afspraken opnieuw ophalen
  const SOON = 2 * 60 * 60 * 1000;   // "over 25 min" tonen binnen deze tijd

  const KEY = { healthToken: 'google.healthToken', token: 'google.token', hint: 'google.hint', cache: 'google.events', view: 'calendar.view' };

  const $ = (id) => document.getElementById(id);
  const card = $('calendar');
  const el = {
    today: $('cal-today'), list: $('cal-list'), updated: $('cal-updated'),
    reconnect: $('cal-reconnect'), refresh: $('cal-refresh'), logout: $('cal-logout'),
    connect: $('cal-connect'), loginMsg: $('cal-login-msg'),
  };

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  class AuthError extends Error {}

  let events = [];
  let fetchedAt = 0;
  let fetchTimer = null;

  // ---------- Inloggen via Google Identity Services ----------
  // Google geeft in de browser geen refresh token; een toegangstoken is 1 uur geldig.
  // Daarna vraagt "Vernieuwen" een nieuw token, zonder opnieuw toestemming te vragen.
  let tokenClient = null;

  function waitForGoogle() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function check() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - started > 10000) return reject(new Error('Google-login laadt niet.'));
        setTimeout(check, 100);
      })();
    });
  }

  async function connect() {
    try {
      await waitForGoogle();
    } catch (e) {
      return showLogin(e.message);
    }
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: [SCOPE, GMAIL].join(' '),
        include_granted_scopes: true,
        callback: onToken,
        error_callback: (err) => {
          if (err && err.type === 'popup_closed') return;
          showMessage('Het Google-venster kon niet openen. Sta pop-ups toe voor deze site.');
        },
      });
    }
    const hint = store.get(KEY.hint);
    tokenClient.requestAccessToken({ prompt: '', ...(hint ? { login_hint: hint } : {}) });
  }

  function onToken(resp) {
    if (resp.error) return showMessage(`Google-login mislukt (${resp.error}).`);
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
      return showLogin('Geef bij het inloggen toegang tot je agenda (vinkje aanzetten).');
    }
    store.set(KEY.token, { access: resp.access_token, expires: Date.now() + resp.expires_in * 1000, gmail: google.accounts.oauth2.hasGrantedAllScopes(resp, GMAIL) });
    el.reconnect.hidden = true;
    shareToken();
    load();
  }

  // Los token voor Google Health (zie HEALTH hierboven)
  let healthClient = null;
  async function connectHealth() {
    try { await waitForGoogle(); } catch { return; }
    if (!healthClient) {
      healthClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: HEALTH.join(' '),
        include_granted_scopes: false,
        callback: (resp) => {
          if (resp.error) return;
          store.set(KEY.healthToken, { access: resp.access_token, expires: Date.now() + resp.expires_in * 1000, granted: google.accounts.oauth2.hasGrantedAllScopes(resp, ...HEALTH) });
          shareToken();
        },
      });
    }
    const hint = store.get(KEY.hint);
    healthClient.requestAccessToken({ prompt: '', ...(hint ? { login_hint: hint } : {}) });
  }
  function healthToken() {
    const t = store.get(KEY.healthToken);
    return t && t.granted && Date.now() < t.expires - 30000 ? t.access : null;
  }

  function token() {
    const t = store.get(KEY.token);
    return t && Date.now() < t.expires - 30000 ? t.access : null;
  }

  function disconnect() {
    const t = store.get(KEY.token);
    if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t.access, () => {});
    [KEY.token, KEY.healthToken, KEY.hint, KEY.cache].forEach(store.del);
    shareToken();
    events = [];
    clearTimeout(fetchTimer);
    showLogin();
  }

  // ---------- Afspraken ophalen ----------
  async function api(path) {
    const access = token();
    if (!access) throw new AuthError();
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 401) { store.del(KEY.token); throw new AuthError(); }
    if (!res.ok) throw new Error(`Google-fout ${res.status}`);
    return res.json();
  }

  async function load() {
    clearTimeout(fetchTimer);
    if (DEMO) { events = demoEvents(); fetchedAt = Date.now(); return render(); }
    try {
      const cals = await api('/users/me/calendarList?minAccessRole=reader');
      const primary = cals.items.find((c) => c.primary);
      if (primary) store.set(KEY.hint, primary.id);

      // Hele maand + deze week ophalen: de AH-urenteller telt ook terug
      const today = startOfDay(Date.now());
      const d = new Date(today);
      const monday = addDays(today, -((d.getDay() + 6) % 7));
      // Ook 5 weken terug en 6 vooruit: daar staat altijd een "Salaris" voor de AH-periode
      const from = Math.min(monday, new Date(d.getFullYear(), d.getMonth(), 1).getTime(), addDays(today, -35));
      const to = Math.max(addDays(today, 42), addDays(monday, 7), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime());
      const qs = new URLSearchParams({
        timeMin: new Date(from).toISOString(),
        timeMax: new Date(to).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      // Canvas altijd ophalen (voor het deadlinesvak), ook als die agenda in Google verborgen is
      const visible = cals.items.filter((c) => c.selected || c.primary || isCanvasCal(c));
      const lists = await Promise.all(visible.map((cal) =>
        api(`/calendars/${encodeURIComponent(cal.id)}/events?${qs}`)
          .then((r) => (r.items || []).map((e) => simplify(e, cal)).filter(Boolean))
          .catch((e) => { if (e instanceof AuthError) throw e; return []; })
      ));
      events = lists.flat();
      fetchedAt = Date.now();
      store.set(KEY.cache, { fetchedAt, events });
      render();
      fetchTimer = setTimeout(load, REFETCH);
    } catch (e) {
      if (e instanceof AuthError) return expired();
      render();
      el.updated.textContent = 'Kon agenda niet bijwerken';
      fetchTimer = setTimeout(load, REFETCH);
    }
  }

  // Alleen wat we nodig hebben bewaren
  function simplify(e, cal) {
    if (e.status === 'cancelled') return null;
    const me = (e.attendees || []).find((a) => a.self);
    if (me && me.responseStatus === 'declined') return null;
    const allDay = !!e.start.date;
    const canvas = isCanvasCal(cal) || /instructure\.com|\/courses\/\d+/.test(e.description || '');
    return {
      id: `${cal.id}/${e.id}`,
      title: e.summary || '(Geen titel)',
      location: e.location || '',
      allDay,
      start: allDay ? parseDate(e.start.date) : Date.parse(e.start.dateTime),
      end: allDay ? parseDate(e.end.date) : Date.parse(e.end.dateTime),
      color: cal.backgroundColor || null,
      link: e.htmlLink || null,
      hidden: !(cal.selected || cal.primary),
      ...(canvas ? { canvas: true, assignment: /assignment/i.test(e.iCalUID || ''), canvasUrl: canvasLink(e.description) } : {}),
    };
  }

  // Link naar de opdracht in Canvas, als die in de beschrijving staat
  function canvasLink(text) {
    const m = (text || '').match(/https?:\/\/[^\s"'<>]*(?:instructure\.com|\/courses\/\d+)[^\s"'<>]*/);
    return m ? m[0] : null;
  }

  function isCanvasCal(cal) {
    return /canvas/i.test(`${cal.summary || ''} ${cal.summaryOverride || ''}`);
  }

  // Het mailvak gebruikt hetzelfde Google-token (geen tweede inlog)
  function shareToken() {
    const t = store.get(KEY.token);
    window.dispatchEvent(new CustomEvent('dash:google', { detail: { gmail: !!(t && t.gmail), health: !!healthToken() } }));
  }
  window.DASH_GOOGLE = {
    token: () => token(),
    gmail: () => { const t = store.get(KEY.token); return !!(t && t.gmail && token()); },
    healthToken: () => healthToken(),
    healthEverGranted: () => { const t = store.get(KEY.healthToken); return !!(t && t.granted); },
    connectHealth: () => connectHealth(),
    connected: () => !!store.get(KEY.hint),
    connect: () => connect(),
  };

  // Andere vakken (weer, AH-uren, Canvas) lezen de afspraken hieruit
  function publish(connected) {
    window.DASH_CALENDAR = { connected, events, fetchedAt };
    window.dispatchEvent(new CustomEvent('dash:calendar', { detail: window.DASH_CALENDAR }));
  }

  // ---------- Datums ----------
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  function startOfDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function addDays(ms, n) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
  }
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const fmtLong = (ms) => new Date(ms).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = (ms) => new Date(ms).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });

  function untilText(ms) {
    const min = Math.round(ms / 60000);
    if (min < 1) return 'zo';
    if (min < 60) return `over ${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `over ${h}u${String(m).padStart(2, '0')}` : `over ${h} uur`;
  }

  // ---------- Korte titels ----------
  // "🏁 FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026 - Race" → "F1 Mexico - Race"
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
    [/sprint\s*(qualifying|shootout|kwal)/i, 'Sprint-kwali'], [/qualifying|kwalificatie/i, 'Kwali'],
    [/sprint/i, 'Sprint'], [/practice\s*1|fp1|vt1/i, 'VT1'], [/practice\s*2|fp2|vt2/i, 'VT2'],
    [/practice\s*3|fp3|vt3/i, 'VT3'], [/race|grand prix|gran premio/i, 'Race'],
  ];

  function label(ev) {
    const t = ev.title || '';
    if (!/formula\s*1|(^|\W)f1\b/i.test(t)) return t;
    const parts = t.split(/\s+[-–—]\s+/);
    const tail = parts.length > 1 ? parts[parts.length - 1] : '';
    const head = parts.length > 1 ? parts.slice(0, -1).join(' ') : t;
    const place = (F1_PLACES.find(([re]) => re.test(head)) || [])[1] ||
      head.replace(/formula\s*1|\bf1\b|grand prix|gran premio( de( la)?)?|\b\d{4}\b|[^\p{L}\s]/giu, ' ')
        .trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()).replace(/\s+/g, ' ');
    const session = tail && (F1_SESSIONS.find(([re]) => re.test(tail)) || [])[1];
    return `F1 ${place}${session ? ` - ${session}` : tail ? ` - ${tail}` : ''}`;
  }

  // ---------- Weergave ----------
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render() {
    const now = Date.now();
    const today = startOfDay(now);
    el.today.textContent = fmtLong(today);
    if (view === 'week') renderWeek(now, today);
    else renderList(now, today);
    el.updated.textContent = fetchedAt ? `Bijgewerkt ${fmtTime(fetchedAt)}` : '';
    card.dataset.state = 'main';
    publish(true);
  }

  function renderList(now, today) {
    // Afspraken per dag indelen (meerdaagse "hele dag" afspraken op elke dag)
    const days = [];
    for (let i = 0; i < DAYS; i++) days.push({ start: addDays(today, i), items: [] });
    const dayIndex = (ms) => days.findIndex((d) => d.start === startOfDay(ms));

    const shown = events.filter((e) => !e.hidden);
    for (const ev of shown) {
      if (ev.end <= today) continue;
      if (ev.allDay) {
        for (let t = Math.max(ev.start, today); t < ev.end; t = addDays(t, 1)) {
          const i = dayIndex(t);
          if (i >= 0) days[i].items.push(ev);
        }
      } else {
        const i = dayIndex(Math.max(ev.start, today));
        if (i >= 0) days[i].items.push(ev);
      }
    }

    const nextUp = shown
      .filter((e) => !e.allDay && e.start > now)
      .sort((a, b) => a.start - b.start)[0];

    const frag = document.createDocumentFragment();
    days.forEach((day, i) => {
      if (i > 0 && !day.items.length) return;
      const section = h('section', 'cal-day');
      section.append(h('h3', null, i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : fmtShort(day.start)));

      if (!day.items.length) {
        section.append(h('p', 'cal-empty', 'Niks meer gepland vandaag.'));
        frag.append(section);
        return;
      }

      day.items.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
      const ul = h('ul');
      for (const ev of day.items) ul.append(eventRow(ev, day.start, now, ev === nextUp));
      section.append(ul);
      frag.append(section);
    });

    // Vandaag leeg en verder ook niks
    if (!shown.some((e) => e.end > now)) {
      frag.replaceChildren(h('p', 'cal-empty', `Niks gepland de komende ${DAYS} dagen.`));
    }

    el.list.replaceChildren(frag);
  }

  // ---------- Weekweergave: 7 kolommen met tijdlijn ----------
  const HOUR_MS = 3600000;

  function renderWeek(now, today) {
    const days = Array.from({ length: DAYS }, (_, i) => ({ start: addDays(today, i), end: addDays(today, i + 1), allDay: [], timed: [] }));

    for (const ev of events) {
      if (ev.hidden) continue;
      for (const day of days) {
        if (ev.start >= day.end || ev.end <= day.start) continue;
        if (ev.allDay) day.allDay.push(ev);
        else day.timed.push({ ev, s: Math.max(ev.start, day.start), e: Math.min(ev.end, day.end) });
      }
    }

    // Uren die we tonen: 08–22, en de dag begint altijd minstens een uur vóór de vroegste afspraak
    let first = 8, last = 22;
    for (const day of days) {
      for (const t of day.timed) {
        first = Math.min(first, Math.floor((t.s - day.start) / HOUR_MS) - 1);
        last = Math.max(last, Math.ceil((t.e - day.start) / HOUR_MS));
      }
    }
    first = Math.max(0, first);
    last = Math.min(24, last);
    // Posities in uren; CSS rekent ze om met --hour (px per uur), zodat we die later kunnen oprekken
    const at = (hours) => `calc(var(--hour) * ${hours})`;
    const hoursFrom = (ms) => ms / HOUR_MS - first;

    const oldBody = el.list.querySelector('.wk-body');
    const scrollTop = oldBody ? oldBody.scrollTop : null;

    const week = h('div', 'week');

    const head = h('div', 'wk-row');
    head.append(h('div'));
    days.forEach((day, i) => {
      const d = new Date(day.start);
      const cell = h('div', `wk-day${i === 0 ? ' today' : ''}`, d.toLocaleDateString('nl-NL', { weekday: 'short' }));
      cell.append(h('b', null, d.getDate()));
      head.append(cell);
    });
    week.append(head);

    if (days.some((d) => d.allDay.length)) {
      const row = h('div', 'wk-row wk-allday');
      row.append(h('div', 'wk-label', 'hele dag'));
      for (const day of days) {
        const cell = h('div', 'cell');
        for (const ev of day.allDay) cell.append(block(ev, 'wk-chip', label(ev)));
        row.append(cell);
      }
      week.append(row);
    }

    const body = h('div', 'wk-row wk-body');
    const times = h('div', 'wk-times');
    for (let hr = first; hr < last; hr++) times.append(h('div', null, `${String(hr).padStart(2, '0')}:00`));
    body.append(times);

    days.forEach((day, i) => {
      const col = h('div', `wk-col${i === 0 ? ' today' : ''}`);
      col.style.height = at(last - first);
      for (const t of lanes(day.timed)) {
        const b = block(t.ev, 'wk-ev');
        const dur = (t.e - t.s) / HOUR_MS;
        b.append(h('b', 'clip', label(t.ev)), h('span', null, `${fmtTime(t.ev.start)} – ${fmtTime(t.ev.end)}`));
        if (dur < 0.75) b.classList.add('short');
        // Naast elkaar: alleen de titel, zodat die leesbaar blijft
        if (t.lanes > 1) b.classList.add('narrow');
        b.dataset.dur = dur;
        b.style.top = at(hoursFrom(t.s - day.start));
        b.style.height = `max(22px, calc(var(--hour) * ${dur} - 2px))`;
        b.style.left = `${(t.lane / t.lanes) * 100}%`;
        b.style.width = `calc(${100 / t.lanes}% - 4px)`;
        if (t.ev.end <= now) b.classList.add('past');
        col.append(b);
      }
      if (i === 0) {
        const line = h('div', 'wk-now');
        line.style.top = at(hoursFrom(now - day.start));
        col.append(line);
      }
      body.append(col);
    });
    week.append(body);

    el.list.replaceChildren(week);
    weekHours = last - first;
    fitWeek();
    // Eerste keer: naar het huidige uur scrollen; daarna scrollpositie bewaren
    const hourPx = parseFloat(el.list.style.getPropertyValue('--hour')) || 44;
    body.scrollTop = scrollTop != null ? scrollTop : Math.max(0, (hoursFrom(now - today) - 1) * hourPx);
  }

  // Op het staande scherm (--fit) de uren zo hoog maken dat de hele dag past
  let weekHours = 0;
  function fitWeek() {
    const body = el.list.querySelector('.wk-body');
    if (!body) return;
    const cs = getComputedStyle(el.list);
    const fit = cs.getPropertyValue('--fit').trim() === '1';
    const hourPx = fit ? Math.max(30, Math.floor(body.clientHeight / weekHours)) : parseFloat(cs.getPropertyValue('--hour-base')) || 44;
    el.list.style.setProperty('--hour', `${hourPx}px`);
    // Zoveel titelregels als er in het blok passen
    const lineH = parseFloat(getComputedStyle(body).fontSize) * 1.25 || 18;
    body.querySelectorAll('.wk-ev').forEach((b) => {
      const px = b.dataset.dur * hourPx - 10 - (b.classList.contains('narrow') || b.classList.contains('short') ? 0 : lineH);
      b.style.setProperty('--lines', Math.max(1, Math.floor(px / lineH)));
    });
  }

  new ResizeObserver(() => { if (view === 'week') fitWeek(); }).observe(el.list);

  // Overlappende afspraken naast elkaar zetten
  function lanes(items) {
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    let cluster = [], laneEnds = [], clusterEnd = 0;
    const flush = () => { cluster.forEach((t) => { t.lanes = laneEnds.length; }); cluster = []; laneEnds = []; };
    for (const t of items) {
      if (cluster.length && t.s >= clusterEnd) flush();
      let lane = laneEnds.findIndex((end) => end <= t.s);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = t.e;
      t.lane = lane;
      cluster.push(t);
      clusterEnd = Math.max(clusterEnd, t.e);
    }
    flush();
    return items;
  }

  function block(ev, cls, text) {
    const b = h(ev.link ? 'a' : 'div', cls);
    if (text != null) b.append(h('span', 'clip', text));
    if (ev.link) { b.href = ev.link; b.target = '_blank'; b.rel = 'noopener'; }
    paint(b, ev);
    return b;
  }

  // ---------- Kleur per categorie ----------
  // AH houdt de kleur van je AH-agenda; F1 rood; Canvas/ESSB groen; de rest de kleur van zijn agenda
  const IS_F1 = /formula\s*1|(^|\W)f1\b/i;
  function colorOf(ev) {
    if (!ev.allDay && /\bAH\b/.test(ev.title)) return ev.color || '#3f51b5';
    if (IS_F1.test(ev.title)) return '#e10600';
    if (ev.canvas || /\bESSB\b/.test(ev.title)) return '#2fbf71';
    return ev.color || '#8a8aa0';
  }
  const rgb = (hex) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0'), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  // Achtergrond = 30% categoriekleur op donker; tekst donker als die achtergrond licht genoeg is
  function paint(node, ev) {
    const c = colorOf(ev);
    const [r, g, b] = rgb(c).map((v, i) => Math.round(v * 0.3 + [31, 31, 35][i] * 0.7));
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    node.style.setProperty('--c', c);
    node.style.setProperty('--evbg', `rgb(${r} ${g} ${b})`);
    node.style.setProperty('--fg', lum > 0.55 ? '#111' : '#fff');
    tipEvent.set(node, ev);
  }

  // ---------- Tooltip: volledige titel bij hover (pc) of eerste tik (telefoon) ----------
  const tipEvent = new WeakMap();
  const tip = h('div', 'cal-tip');
  tip.hidden = true;
  document.body.append(tip);
  let tipFor = null;
  let lastPointer = 'mouse';

  function showTip(node) {
    const ev = tipEvent.get(node);
    if (!ev) return;
    tipFor = node;
    const when = ev.allDay ? 'Hele dag' : `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
    tip.style.setProperty('--c', colorOf(ev));
    tip.replaceChildren(h('b', null, ev.title), h('span', null, ev.location ? `${when} · ${ev.location}` : when));
    tip.hidden = false;
    const r = node.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), innerWidth - t.width - 8);
    const top = r.bottom + t.height + 10 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - t.height - 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function hideTip() { tip.hidden = true; tipFor = null; }

  el.list.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
  el.list.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const node = e.target.closest('.wk-ev, .wk-chip, .event');
    if (node && node !== tipFor) showTip(node);
  });
  el.list.addEventListener('pointerout', (e) => {
    const node = e.target.closest('.wk-ev, .wk-chip, .event');
    if (node && !node.contains(e.relatedTarget)) hideTip();
  });
  el.list.addEventListener('click', (e) => {
    const node = e.target.closest('.wk-ev, .wk-chip, .event');
    if (!node || lastPointer !== 'touch') return;
    // Telefoon: eerste tik toont de volledige titel, tweede tik opent de afspraak
    if (tipFor !== node) { e.preventDefault(); showTip(node); }
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  // ---------- Wissel Lijst / Week ----------
  let view = store.get(KEY.view) === 'week' ? 'week' : 'list';

  function setView(v) {
    view = v;
    store.set(KEY.view, v);
    card.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    document.querySelector('.dashboard').classList.toggle('week-mode', v === 'week');
    if (card.dataset.state === 'main') render();
  }

  card.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => setView(b.dataset.view); });

  function eventRow(ev, dayStart, now, isNext) {
    const li = h('li');
    const row = h(ev.link ? 'a' : 'div', 'event');
    if (ev.link) { row.href = ev.link; row.target = '_blank'; row.rel = 'noopener'; }
    paint(row, ev);

    let time;
    if (ev.allDay) time = 'Hele dag';
    else if (ev.start < dayStart) time = `tot ${fmtTime(ev.end)}`;
    else time = `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;

    const body = h('div');
    body.append(h('div', 'name clip', label(ev)));
    body.append(h('div', 'sub', ev.location ? `${time} · ${ev.location}` : time));
    row.append(h('span', 'dot'), body);

    if (!ev.allDay) {
      if (ev.end <= now) row.classList.add('past');
      else if (ev.start <= now) { row.classList.add('now'); row.append(h('span', 'badge', 'Nu')); }
      else if (isNext && ev.start - now < SOON) row.append(h('span', 'badge', untilText(ev.start - now)));
    }
    li.append(row);
    return li;
  }

  function expired() {
    if (events.length) render();
    else card.dataset.state = 'main';
    el.reconnect.hidden = false;
  }

  function showLogin(msg) {
    el.loginMsg.textContent = !CONFIGURED
      ? 'Vul eerst je Google Client ID in config.js in.'
      : msg || 'Koppel je Google Agenda om je afspraken hier te zien.';
    el.connect.disabled = !CONFIGURED;
    card.dataset.state = 'login';
    publish(false);
  }

  function showMessage(msg) {
    if (card.dataset.state === 'main') el.updated.textContent = msg;
    else showLogin(msg);
  }

  el.connect.onclick = connect;
  el.refresh.onclick = connect;
  el.logout.onclick = () => (DEMO ? null : disconnect());

  // Elke minuut "Nu"/"over X min" bijwerken; bij terugkomen naar het tabblad verversen
  setInterval(() => {
    if (card.dataset.state !== 'main' || document.hidden) return;
    render();
    if (!DEMO && !token()) el.reconnect.hidden = false;
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || card.dataset.state !== 'main') return;
    if (DEMO) return render();
    if (token() && Date.now() - fetchedAt > 60000) load();
    else if (!token()) expired();
  });

  // ---------- Demo (?demo) ----------
  function demoEvents() {
    const t = startOfDay(Date.now());
    const at = (day, hh, mm = 0) => addDays(t, day) + (hh * 60 + mm) * 60000;
    const now = Date.now();
    return [
      { id: '1', title: 'Ontbijt met Sam', location: 'Café de Hoek', allDay: false, start: at(0, 8, 30), end: at(0, 9, 30), color: '#f6bf26' },
      { id: '2', title: 'Werkblok', location: '', allDay: false, start: now - 20 * 60000, end: now + 40 * 60000, color: '#7986cb' },
      { id: '3', title: 'Tandarts', location: 'Hoofdstraat 12', allDay: false, start: now + 95 * 60000, end: now + 125 * 60000, color: '#e67c73' },
      { id: '4', title: 'Filmavond', location: '', allDay: false, start: at(0, 20), end: at(0, 23), color: '#33b679' },
      { id: '5', title: 'Verjaardag oma', location: '', allDay: true, start: addDays(t, 1), end: addDays(t, 2), color: '#8e24aa' },
      { id: '6', title: 'Sporten', location: 'Sportschool', allDay: false, start: at(1, 18), end: at(1, 19, 30), color: '#039be5' },
      { id: '7', title: 'Weekendje weg', location: 'Texel', allDay: true, start: addDays(t, 3), end: addDays(t, 5), color: '#33b679' },
      { id: '8', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(2, 8), end: at(2, 13), color: '#3f51b5' },
      { id: '16', title: 'Salaris', location: '', allDay: true, start: parseDate('2026-11-09'), end: parseDate('2026-11-10'), color: '#33b679' },
      { id: '9', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(-1, 17), end: at(-1, 21, 30), color: '#3f51b5' },
      { id: '10', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(-8, 9), end: at(-8, 15), color: '#3f51b5' },
      { id: '11', title: '🏁 FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026 - Race', location: '', allDay: false, start: at(5, 21), end: at(5, 23), color: '#f09300' },
      { id: '12', title: '⏱️ FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026 - Qualifying', location: '', allDay: false, start: at(4, 22), end: at(4, 23), color: '#f09300' },
      { id: '13', title: 'Essay week 6 [ESSB-MP6020]', location: '', allDay: false, start: at(1, 23, 59), end: at(1, 23, 59), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '14', title: 'Quiz hoofdstuk 4 [ESSB-MP6020]', location: '', allDay: false, start: at(3, 12), end: at(3, 12), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '15', title: 'Reflectieverslag [ESSB-BS2100]', location: '', allDay: false, start: at(-1, 17), end: at(-1, 17), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '17', title: 'Leesopdracht hoofdstuk 5 [ESSB-BS2100]', location: '', allDay: false, start: now + 5 * 3600000, end: now + 5 * 3600000, color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '18', title: 'Groepspresentatie [ESSB-PS3040]', location: '', allDay: false, start: at(9, 9), end: at(9, 9), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '19', title: 'Logboek week 7 [ESSB-PS3040]', location: '', allDay: false, start: at(-4, 23, 59), end: at(-4, 23, 59), color: '#9e69af', canvas: true, assignment: true, hidden: true },
    ];
  }

  // ---------- Start ----------
  function start() {
    setView(view);
    if (DEMO) return load();
    if (!CONFIGURED) return showLogin();
    const cache = store.get(KEY.cache);
    if (cache) { events = cache.events || []; fetchedAt = cache.fetchedAt || 0; }
    if (token()) return load();
    if (cache || store.get(KEY.hint)) return expired();
    showLogin();
  }

  start();
})();
