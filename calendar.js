'use strict';

(() => {
  const CLIENT_ID = (window.DASHBOARD_CONFIG || {}).googleClientId || '';
  const CONFIGURED = CLIENT_ID && !/PLAK_HIER|_HERE/.test(CLIENT_ID);
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  // Gmail read-only, for the mail tile (widgets/mail.js). May be missing: then the agenda works normally and the mail tile asks for it.
  const GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';
  // Google Health API (steps, sleep, heart rate) for widgets/health.js; read-only.
  // Own token with ONLY these scopes: Google Health refuses a token that also has agenda/Gmail in it (DISALLOWED_OAUTH_SCOPES).
  const HEALTH = ['activity_and_fitness', 'sleep', 'health_metrics_and_measurements'].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`);
  const API = 'https://www.googleapis.com/calendar/v3';
  const DEMO = new URLSearchParams(location.search).has('demo');

  const DAYS = 7;                    // how many days ahead
  const REFETCH = 5 * 60 * 1000;     // fetch appointments again
  const SOON = 2 * 60 * 60 * 1000;   // show "in 25 min" within this time

  const KEY = { healthToken: 'google.healthToken', token: 'google.token', hint: 'google.hint', cache: 'google.events', view: 'calendar.view', fit: 'calendar.fit' };

  const $ = (id) => document.getElementById(id);
  const card = $('calendar');
  const el = {
    today: $('cal-today'), list: $('cal-list'), updated: $('cal-updated'),
    reconnect: $('cal-reconnect'), refresh: $('cal-refresh'), logout: $('cal-logout'),
    weekLabel: $('cal-week-label'), prev: $('cal-prev'), next: $('cal-next'), thisWeek: $('cal-this-week'),
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

  // ---------- Logging in via Google Identity Services ----------
  // In the browser Google gives no refresh token; an access token is valid for 1 hour.
  // After that "Refresh" asks for a new token, without asking for permission again.
  let tokenClient = null;

  function waitForGoogle() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function check() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - started > 10000) return reject(new Error('The Google login doesn\'t load.'));
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
          showMessage('The Google window couldn\'t open. Allow pop-ups for this site.');
        },
      });
    }
    const hint = store.get(KEY.hint);
    tokenClient.requestAccessToken({ prompt: '', ...(hint ? { login_hint: hint } : {}) });
  }

  function onToken(resp) {
    if (resp.error) return showMessage(`Google login failed (${resp.error}).`);
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
      return showLogin('When logging in, give access to your calendar (tick the box).');
    }
    store.set(KEY.token, { access: resp.access_token, expires: Date.now() + resp.expires_in * 1000, gmail: google.accounts.oauth2.hasGrantedAllScopes(resp, GMAIL) });
    el.reconnect.hidden = true;
    shareToken();
    load();
  }

  // Separate token for Google Health (see HEALTH above)
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

  // ---------- Fetching appointments ----------
  // ---------- Tokens from the helper on this PC (helper/, README step 8) ----------
  // If it's linked with Google, the dashboard fetches a new token itself when the old one expires: no more "Refresh".
  // Not reachable (phone, other PC, program off): then simply the button as always.
  const HELPER = 'http://127.0.0.1:8765/token';
  let helperUp = null;
  async function fromHelper(which) {
    if (DEMO || helperUp === false) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${HELPER}?which=${which}`, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
      helperUp = true;
      return res.ok ? await res.json() : null;
    } catch {
      // Stop trying for a bit; again after 5 minutes
      helperUp = false;
      setTimeout(() => { helperUp = null; }, 5 * 60 * 1000);
      return null;
    }
  }
  // Without the helper (laptop, other PC): the lasting keys from the login bundle (vault.js, `google.refresh`).
  // Google allows refreshing from the browser (CORS), so no server needed.
  async function fromBundle(which) {
    const g = store.get('google.refresh');
    if (DEMO || !g || !g[which]) return null;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: g.client_id, client_secret: g.client_secret, refresh_token: g[which], grant_type: 'refresh_token' }),
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }
  let refreshing = null;
  function refreshFromHelper() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      let changed = false;
      if (!token()) {
        const t = await fromHelper('main') || await fromBundle('main');
        if (t && t.scope.includes(SCOPE)) {
          store.set(KEY.token, { access: t.access_token, expires: Date.now() + t.expires_in * 1000, gmail: t.scope.includes(GMAIL), helper: true });
          changed = true;
        }
      }
      if (!healthToken()) {
        const t = await fromHelper('health') || await fromBundle('health');
        if (t && HEALTH.every((x) => t.scope.includes(x))) {
          store.set(KEY.healthToken, { access: t.access_token, expires: Date.now() + t.expires_in * 1000, granted: true, helper: true });
          changed = true;
        }
      }
      if (changed) { el.reconnect.hidden = true; shareToken(); }
      return changed;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function api(path) {
    let access = token();
    if (!access && await refreshFromHelper()) access = token();
    if (!access) throw new AuthError();
    let res = await fetch(API + path, { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 401) {
      store.del(KEY.token);
      // Token expired after all: quietly try a new one once
      if (!(await refreshFromHelper()) || !token()) throw new AuthError();
      res = await fetch(API + path, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.status === 401) { store.del(KEY.token); throw new AuthError(); }
    }
    if (!res.ok) throw new Error(`Google error ${res.status}`);
    return res.json();
  }

  async function load() {
    clearTimeout(fetchTimer);
    if (DEMO) { events = demoEvents(); fetchedAt = Date.now(); return render(); }
    try {
      const cals = await api('/users/me/calendarList?minAccessRole=reader');
      const primary = cals.items.find((c) => c.primary);
      if (primary) store.set(KEY.hint, primary.id);

      // Fetch the whole month + this week: the AH hours counter also counts back
      const today = startOfDay(Date.now());
      const d = new Date(today);
      const monday = addDays(today, -((d.getDay() + 6) % 7));
      // Also 5 weeks back and 6 ahead: there's always a "Salaris" (pay day) for the AH period there
      // And the week you're viewing (previous/next week)
      const shown = viewWeekStart();
      const from = Math.min(monday, new Date(d.getFullYear(), d.getMonth(), 1).getTime(), addDays(today, -35), shown);
      const to = Math.max(addDays(today, 42), addDays(monday, 7), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), addDays(shown, 7));
      loaded = [from, to];
      const qs = new URLSearchParams({
        timeMin: new Date(from).toISOString(),
        timeMax: new Date(to).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      // Always fetch Canvas (for the deadlines tile), even if that calendar is hidden in Google
      // And the birthdays calendar (contacts), for the day line, even if it's hidden
      const visible = cals.items.filter((c) => c.selected || c.primary || isCanvasCal(c) || isBirthdayCal(c));
      const lists = await Promise.all(visible.map((cal) =>
        api(`/calendars/${encodeURIComponent(cal.id)}/events?${qs}`)
          .then((r) => (r.items || []).map((e) => simplify(e, cal)).filter(Boolean))
          .catch((e) => { if (e instanceof AuthError) throw e; return []; })
      ));
      events = lists.flat();
      fetchedAt = Date.now();
      store.set(KEY.cache, { fetchedAt, events });
      failSince = 0;
      el.reconnect.hidden = true;
      render();
      fetchTimer = setTimeout(load, REFETCH);
    } catch (e) {
      if (e instanceof AuthError) return expired();
      render();
      el.updated.textContent = 'Couldn\'t update the agenda';
      fetchTimer = setTimeout(load, REFETCH);
    }
  }

  // Keep only what we need
  function simplify(e, cal) {
    if (e.status === 'cancelled') return null;
    const me = (e.attendees || []).find((a) => a.self);
    if (me && me.responseStatus === 'declined') return null;
    const allDay = !!e.start.date;
    const canvas = isCanvasCal(cal) || /instructure\.com|\/courses\/\d+/.test(e.description || '');
    return {
      id: `${cal.id}/${e.id}`,
      title: e.summary || '(No title)',
      location: e.location || '',
      allDay,
      start: allDay ? parseDate(e.start.date) : Date.parse(e.start.dateTime),
      end: allDay ? parseDate(e.end.date) : Date.parse(e.end.dateTime),
      color: cal.backgroundColor || null,
      calName: cal.summaryOverride || cal.summary || '',   // for the day timeline (house style): timetable = lecture
      link: e.htmlLink || null,
      hidden: !(cal.selected || cal.primary),
      ...(birthdayName(e, cal) ? { birthday: birthdayName(e, cal) } : {}),
      ...(canvas ? { canvas: true, assignment: /assignment/i.test(e.iCalUID || ''), canvasUrl: canvasLink(e.description) } : {}),
    };
  }

  // Link to the assignment in Canvas, if it's in the description
  function canvasLink(text) {
    const m = (text || '').match(/https?:\/\/[^\s"'<>]*(?:instructure\.com|\/courses\/\d+)[^\s"'<>]*/);
    return m ? m[0] : null;
  }

  // Birthdays: Google puts them in their own calendar (#contacts@group.v.calendar.google.com) or as eventType 'birthday'.
  // The titles can be Dutch or English depending on the Google account's language, so both are stripped.
  function isBirthdayCal(cal) {
    return /#contacts@group\.v\.calendar\.google\.com$/.test(cal.id || '');
  }
  function birthdayName(e, cal) {
    if (e.eventType !== 'birthday' && !isBirthdayCal(cal)) return null;
    const t = (e.summary || '').trim();
    return t.replace(/^(?:verjaardag van|birthday of|happy birthday,?)\s+/i, '')
      .replace(/(?:['’]s|['’])?\s+(?:verjaardag|birthday)$/i, '')
      .replace(/\s+is jarig$/i, '').trim() || t;
  }

  function isCanvasCal(cal) {
    return /canvas/i.test(`${cal.summary || ''} ${cal.summaryOverride || ''}`);
  }

  // The mail tile uses the same Google token (no second login)
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
    connected: () => !!store.get(KEY.hint) || !!token(),
    // Before every use: quietly refresh expired tokens via the helper if possible
    refresh: () => refreshFromHelper(),
    connect: () => connect(),
  };

  // Other tiles (weather, AH hours, Canvas) read the appointments from this
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
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtLong = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  function untilText(ms) {
    const min = Math.round(ms / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `in ${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `in ${h}h${String(m).padStart(2, '0')}` : `in ${h} hours`;
  }

  // ---------- Short titles ----------
  // "🏁 FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026 - Race" → "F1 Mexico - Race"
  const F1_PLACES = [
    [/m[eé]xico/i, 'Mexico'], [/s[aã]o paulo|brazil|brasil/i, 'Brazil'], [/las vegas/i, 'Las Vegas'],
    [/qatar/i, 'Qatar'], [/abu dhabi/i, 'Abu Dhabi'], [/miami/i, 'Miami'],
    [/united states|\busa?\b|austin|am[eé]ricas/i, 'Austin'], [/singapore/i, 'Singapore'],
    [/azerbaijan|baku/i, 'Baku'], [/madrid/i, 'Madrid'], [/barcelona|catalunya/i, 'Barcelona'],
    [/espa[ñn]a|spain/i, 'Spain'], [/australia/i, 'Australia'], [/china|chinese/i, 'China'],
    [/japan/i, 'Japan'], [/bahrain/i, 'Bahrain'], [/saudi/i, 'Saudi Arabia'], [/canad/i, 'Canada'],
    [/monaco/i, 'Monaco'], [/austria|österreich/i, 'Austria'], [/british|britain|silverstone/i, 'Silverstone'],
    [/belgi/i, 'Belgium'], [/hungar|magyar/i, 'Hungary'], [/dutch|netherlands|nederland|zandvoort/i, 'Zandvoort'],
    [/emilia|imola/i, 'Imola'], [/ital|monza/i, 'Monza'],
  ];
  const F1_SESSIONS = [
    [/sprint\s*(qualifying|shootout|kwal)/i, 'Sprint-quali'], [/qualifying|kwalificatie/i, 'Quali'],
    [/sprint/i, 'Sprint'], [/practice\s*1|fp1|vt1/i, 'FP1'], [/practice\s*2|fp2|vt2/i, 'FP2'],
    [/practice\s*3|fp3|vt3/i, 'FP3'], [/race|grand prix|gran premio/i, 'Race'],
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
    const day = dayMode();
    card.classList.toggle('cal-dayview', day);
    if (day) renderDay(now, today);
    else if (view === 'week') renderWeek(now, today);
    else renderList(now, today);
    el.updated.textContent = fetchedAt ? `Bijgewerkt ${fmtTime(fetchedAt)}` : '';
    card.dataset.state = 'main';
    publish(true);
  }

  function renderList(now, today) {
    // Group appointments per day (multi-day "all day" appointments on every day)
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
      section.append(h('h3', null, i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtShort(day.start)));

      if (!day.items.length) {
        section.append(h('p', 'cal-empty', 'Nothing more planned today.'));
        frag.append(section);
        return;
      }

      day.items.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
      const ul = h('ul');
      for (const ev of day.items) ul.append(eventRow(ev, day.start, now, ev === nextUp));
      section.append(ul);
      frag.append(section);
    });

    // Today empty and nothing after it either
    if (!shown.some((e) => e.end > now)) {
      frag.replaceChildren(h('p', 'cal-empty', `Nothing planned in the next ${DAYS} days.`));
    }

    el.list.replaceChildren(frag);
  }

  // ---------- Day timeline (since 1.3.0, house style on tall; design system › AgendaWeek and MockupDashboard) ----------
  // Only today, without a click: hours on the left in pixels, lectures eva, AH in AH blue, the rest paper, the now line red.
  // Window of hours: from 2 hours before now (min 07, max 15) to 24:00. The hour height fills the space to the bottom of the screen
  // (min 44px; more hours than that = the agenda continues below the edge, Noah is fine with that).
  const HOUR_MS = 3600000;
  const dayMode = () => document.documentElement.classList.contains('nh') && document.documentElement.classList.contains('tall-mode');
  const COLLEGE = /rooster|timetable|erasmus|\beur\b|college|lecture|werkgroep|tutorial/i;
  function kindOf(ev) {
    if (/\bAH\b/.test(ev.title)) return 'ah';
    if (COLLEGE.test(ev.calName || '') || COLLEGE.test(ev.title) || (/\bESSB\b/.test(ev.title) && !ev.canvas)) return 'college';
    return 'own';
  }
  let dayHours = 0;
  function renderDay(now, today) {
    const end = addDays(today, 1);
    const nowH = (now - today) / HOUR_MS;
    const first = Math.min(15, Math.max(7, Math.floor(nowH) - 2)), last = 24;
    const shown = events.filter((e) => !e.hidden && e.start < end && e.end > today);
    const timed = [];
    for (const ev of shown.filter((e) => !e.allDay)) {
      let s = Math.max(ev.start, today), e = Math.min(ev.end, end);
      const top = today + first * HOUR_MS;
      if (e <= top) continue;   // already over before the window
      if (s < top) s = top;
      if (e - s < HOUR_MS / 4) e = s + HOUR_MS / 4;
      timed.push({ ev, s, e });
    }
    const at = (hours) => `calc(var(--hour) * ${hours})`;
    const wrap = h('div', 'dy');
    const allDay = shown.filter((e) => e.allDay);
    if (allDay.length) {
      const row = h('div', 'dy-allday');
      for (const ev of allDay) row.append(block(ev, 'dy-chip', ev.birthday ? `${ev.birthday}'s birthday` : label(ev)));
      wrap.append(row);
    }
    const grid = h('div', 'dy-grid');
    grid.style.height = at(last - first);
    for (let hr = first; hr < last; hr++) {
      const r = h('div', 'dy-hour', String(hr).padStart(2, '0'));
      r.style.top = at(hr - first);
      grid.append(r);
    }
    const lanesEl = h('div', 'dy-lanes');
    for (const t of lanes(timed)) {
      const b = block(t.ev, `dy-ev k-${kindOf(t.ev)}`);
      const dur = (t.e - t.s) / HOUR_MS;
      const when = `${fmtTime(t.ev.start)} - ${fmtTime(t.ev.end)}`;
      b.append(h('b', 'clip', kindOf(t.ev) === 'ah' ? 'Appie' : label(t.ev)), h('span', 'clip', t.ev.location ? `${when} · ${t.ev.location}` : when));
      b.style.top = at((t.s - today) / HOUR_MS - first);
      b.style.height = `calc(var(--hour) * ${dur} - 3px)`;
      b.style.left = `${(t.lane / t.lanes) * 100}%`;
      b.style.width = `calc(${100 / t.lanes}% - 6px)`;
      b.dataset.dur = dur;
      if (t.ev.end <= now) b.classList.add('past');
      else if (t.ev.start <= now) b.classList.add('now');
      lanesEl.append(b);
    }
    grid.append(lanesEl);
    if (nowH >= first && nowH < last) {
      const line = h('div', 'dy-now');
      line.style.top = at(nowH - first);
      grid.append(line);
    }
    if (!timed.some((t) => t.ev.end > now)) {
      const empty = h('p', 'dy-empty', 'NOTHING MORE PLANNED. SUSPICIOUS.');
      grid.append(empty);
    }
    wrap.append(grid);
    el.list.replaceChildren(wrap);
    dayHours = last - first;
    fitDay();
  }
  function fitDay() {
    const grid = el.list.querySelector('.dy-grid');
    if (!grid || !dayHours) return;
    // Still hidden (agenda not shown yet, layout not ready): measuring now gives a top of ~0 and far too tall hours.
    // The ResizeObserver below measures again as soon as it becomes visible.
    if (!grid.offsetParent) {
      if (!el.list.style.getPropertyValue('--hour')) el.list.style.setProperty('--hour', '44px');
      return;
    }
    // offsetTop instead of getBoundingClientRect: then the slide-in animation (transform) doesn't count
    let top = 0;
    for (let n = grid; n; n = n.offsetParent) top += n.offsetTop;
    const more = document.querySelector('.desk-more');
    const bottomGap = (more ? more.getBoundingClientRect().height : 0) + 64;   // More bar + the window edge
    const avail = innerHeight - top - bottomGap;
    const hourPx = Math.max(44, Math.floor(avail / dayHours));
    el.list.style.setProperty('--hour', `${hourPx}px`);
    grid.querySelectorAll('.dy-ev').forEach((b) => b.classList.toggle('tight', b.dataset.dur * hourPx < 46));
  }
  window.addEventListener('resize', () => { if (dayMode() && card.dataset.state === 'main') fitDay(); });
  // What's above changes height (tiles load, rotating tile, slide-in animation): measure again.
  // Only depends on where the timeline starts, not on its own height, so no loop.
  // Also watch the agenda itself: when it goes from hidden to visible, the dashboard around it doesn't always change size.
  let fitQueued = false;
  const fitObserver = new ResizeObserver(() => {
    if (fitQueued || !dayMode()) return;
    fitQueued = true;
    // A timer instead of requestAnimationFrame: that one doesn't run in a background tab or hidden window
    setTimeout(() => { fitQueued = false; fitDay(); }, 50);
  });
  fitObserver.observe(document.querySelector('.dashboard') || document.body);
  fitObserver.observe(card);
  // Mood or layout changed (house style on/off, tall ↔ desk): draw again
  for (const ev of ['dash:mood', 'dash:layout']) window.addEventListener(ev, () => { if (card.dataset.state === 'main') render(); });

  // ---------- Week view: 7 columns with a timeline ----------

  // The week you're viewing: Monday to Sunday, moves with previous/next week
  let weekOffset = 0;
  let loaded = [0, 0];
  const mondayOf = (ms) => addDays(startOfDay(ms), -((new Date(ms).getDay() + 6) % 7));
  const viewWeekStart = () => addDays(mondayOf(Date.now()), 7 * weekOffset);
  function isoWeek(ms) {
    const d = new Date(ms);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  // Fit: 08–24 fits the tile's height. Scroll: normal hour height, the grid scrolls itself.
  let fitMode = store.get(KEY.fit) === 'scroll' ? 'scroll' : 'fit';
  let scrollPending = true;   // after opening/switching: scroll to the next event (or the current hour)

  function renderWeek(now, today) {
    const weekStart = viewWeekStart();
    const days = Array.from({ length: 7 }, (_, i) => ({ start: addDays(weekStart, i), end: addDays(weekStart, i + 1), allDay: [], timed: [] }));
    const short = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('.', '');
    if (el.weekLabel) el.weekLabel.textContent = `week ${isoWeek(weekStart)} · ${short(weekStart)} – ${short(addDays(weekStart, 6))}`;
    if (el.thisWeek) el.thisWeek.disabled = weekOffset === 0;

    for (const ev of events) {
      if (ev.hidden) continue;
      for (const day of days) {
        if (ev.start >= day.end || ev.end <= day.start) continue;
        if (ev.allDay) day.allDay.push(ev);
        else day.timed.push({ ev, s: Math.max(ev.start, day.start), e: Math.min(ev.end, day.end) });
      }
    }

    // Fit: exactly 08–24. An appointment (partly) before 8 o'clock is at the top from 08:00 (real time in the tooltip).
    // Scroll: the whole day.
    const first = fitMode === 'fit' ? 8 : 0;
    const last = 24;
    if (first) {
      for (const day of days) {
        const top = day.start + first * HOUR_MS;
        for (const t of day.timed) {
          if (t.e <= top) { t.s = top; t.e = top + HOUR_MS / 2; t.early = true; }
          else if (t.s < top) t.s = top;
        }
      }
    }
    // Positions in hours; CSS converts them with --hour (px per hour), so we can stretch it later
    const at = (hours) => `calc(var(--hour) * ${hours})`;
    const hoursFrom = (ms) => ms / HOUR_MS - first;

    const oldBody = el.list.querySelector('.wk-body');
    const scrollTop = oldBody && !scrollPending ? oldBody.scrollTop : null;

    const week = h('div', `week ${fitMode}`);

    const head = h('div', 'wk-row');
    head.append(h('div'));
    days.forEach((day) => {
      const d = new Date(day.start);
      const cell = h('div', `wk-day${day.start === today ? ' today' : ''}`, d.toLocaleDateString('en-GB', { weekday: 'short' }));
      cell.append(h('b', null, d.getDate()));
      head.append(cell);
    });
    week.append(head);

    if (days.some((d) => d.allDay.length)) {
      const row = h('div', 'wk-row wk-allday');
      row.append(h('div', 'wk-label', 'all day'));
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

    days.forEach((day) => {
      const isToday = day.start === today;
      const col = h('div', `wk-col${isToday ? ' today' : ''}`);
      col.style.height = at(last - first);
      for (const t of lanes(day.timed)) {
        const b = block(t.ev, 'wk-ev');
        const dur = (t.e - t.s) / HOUR_MS;
        b.append(h('b', 'clip', label(t.ev)), h('span', null, `${fmtTime(t.ev.start)} – ${fmtTime(t.ev.end)}`));
        if (dur < 0.75) b.classList.add('short');
        // Side by side: only the title, so it stays readable
        if (t.lanes > 1) b.classList.add('narrow');
        b.dataset.dur = dur;
        b.style.top = at(hoursFrom(t.s - day.start));
        b.style.height = `max(16px, calc(var(--hour) * ${dur} - 2px))`;
        b.style.left = `${(t.lane / t.lanes) * 100}%`;
        b.style.width = `calc(${100 / t.lanes}% - 4px)`;
        if (t.ev.end <= now) b.classList.add('past');
        col.append(b);
      }
      if (isToday) {
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

    // Scroll: after opening to the next event of today, otherwise the current hour; after that keep the position
    if (fitMode === 'scroll') {
      const hourPx = parseFloat(el.list.style.getPropertyValue('--hour')) || 44;
      if (scrollTop != null) body.scrollTop = scrollTop;
      else {
        let target = 8;
        const todayCol = days.find((d) => d.start === today);
        if (todayCol) {
          const nextEv = todayCol.timed.filter((t) => t.e > now).sort((a, b) => a.s - b.s)[0];
          target = nextEv ? (nextEv.s - today) / HOUR_MS : (now - today) / HOUR_MS;
        }
        body.scrollTop = Math.max(0, (target - first - 0.5) * hourPx);
      }
    }
    scrollPending = false;
  }

  // Height of the grid: the tile itself (wide layout) or a fixed height from CSS (--fit-h).
  // Fit: hour rows so tall that everything fits that height. Scroll: normal hour height, the grid scrolls.
  let weekHours = 0;
  function fitWeek() {
    const body = el.list.querySelector('.wk-body');
    if (!body) return;
    const cs = getComputedStyle(el.list);
    let avail;
    if (cs.getPropertyValue('--fit-source').trim() === 'box') {
      avail = el.list.clientHeight - (body.getBoundingClientRect().top - el.list.getBoundingClientRect().top) - 2;
    } else avail = parseFloat(cs.getPropertyValue('--fit-h')) || 600;
    avail = Math.max(160, Math.floor(avail));
    const hourPx = fitMode === 'fit' ? Math.max(14, Math.floor(avail / weekHours)) : parseFloat(cs.getPropertyValue('--hour-base')) || 44;
    el.list.style.setProperty('--hour', `${hourPx}px`);
    body.style.height = fitMode === 'fit' ? '' : `${avail}px`;
    // As many title lines as fit in the block
    const lineH = parseFloat(getComputedStyle(body).fontSize) * 1.25 || 18;
    body.querySelectorAll('.wk-ev').forEach((b) => {
      const px = b.dataset.dur * hourPx - 10 - (b.classList.contains('narrow') || b.classList.contains('short') ? 0 : lineH);
      b.style.setProperty('--lines', Math.max(1, Math.floor(px / lineH)));
      // Little room: only the title on one line (cut off with dots, full title on hover)
      b.classList.toggle('tight', b.dataset.dur * hourPx < 34);
    });
  }

  // Previous/next week and back to this week; outside what's already fetched: fetch again
  function goWeek(offset) {
    weekOffset = offset;
    scrollPending = true;
    const ws = viewWeekStart();
    if (!DEMO && token() && (ws < loaded[0] || addDays(ws, 7) > loaded[1])) load();
    else if (card.dataset.state === 'main') render();
  }
  if (el.prev) el.prev.onclick = () => goWeek(weekOffset - 1);
  if (el.next) el.next.onclick = () => goWeek(weekOffset + 1);
  if (el.thisWeek) el.thisWeek.onclick = () => goWeek(0);
  card.querySelectorAll('.seg-fit button').forEach((b) => {
    b.onclick = () => {
      fitMode = b.dataset.fit;
      store.set(KEY.fit, fitMode);
      scrollPending = true;
      card.querySelectorAll('.seg-fit button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.fit === fitMode)));
      if (card.dataset.state === 'main') render();
    };
    b.setAttribute('aria-pressed', String(b.dataset.fit === fitMode));
  });

  new ResizeObserver(() => { if (view === 'week') fitWeek(); }).observe(el.list);

  // Put overlapping appointments side by side
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
  // AH always the bright AH blue (preference); F1 red; Canvas/ESSB green; the rest its calendar's color
  const IS_F1 = /formula\s*1|(^|\W)f1\b/i;
  function colorOf(ev) {
    if (!ev.allDay && /\bAH\b/.test(ev.title)) return '#00ADE6';
    if (IS_F1.test(ev.title)) return '#e10600';
    if (ev.canvas || /\bESSB\b/.test(ev.title)) return '#2fbf71';
    return ev.color || '#8a8aa0';
  }
  const rgb = (hex) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0'), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  // Background = 30% category color on dark; text dark when that background is light enough
  function paint(node, ev) {
    const c = colorOf(ev);
    const [r, g, b] = rgb(c).map((v, i) => Math.round(v * 0.3 + [31, 31, 35][i] * 0.7));
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    node.style.setProperty('--c', c);
    node.style.setProperty('--evbg', `rgb(${r} ${g} ${b})`);
    node.style.setProperty('--fg', lum > 0.55 ? '#111' : '#fff');
    tipEvent.set(node, ev);
  }

  // ---------- Tooltip: full title on hover (PC) or first tap (phone) ----------
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
    const when = ev.allDay ? 'All day' : `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
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
    // Phone: the first tap shows the full title, the second tap opens the appointment
    if (tipFor !== node) { e.preventDefault(); showTip(node); }
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  // ---------- Switch List / Week ----------
  let view = store.get(KEY.view) === 'week' ? 'week' : 'list';

  function setView(v) {
    view = v;
    scrollPending = true;
    store.set(KEY.view, v);
    card.querySelectorAll('.seg-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    document.querySelector('.dashboard').classList.toggle('week-mode', v === 'week');
    if (card.dataset.state === 'main') render();
  }

  card.querySelectorAll('.seg-view button').forEach((b) => { b.onclick = () => setView(b.dataset.view); });

  function eventRow(ev, dayStart, now, isNext) {
    const li = h('li');
    const row = h(ev.link ? 'a' : 'div', 'event');
    if (ev.link) { row.href = ev.link; row.target = '_blank'; row.rel = 'noopener'; }
    paint(row, ev);

    let time;
    if (ev.allDay) time = 'All day';
    else if (ev.start < dayStart) time = `until ${fmtTime(ev.end)}`;
    else time = `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;

    const body = h('div');
    body.append(h('div', 'name clip', label(ev)));
    body.append(h('div', 'sub', ev.location ? `${time} · ${ev.location}` : time));
    row.append(h('span', 'dot'), body);

    if (!ev.allDay) {
      if (ev.end <= now) row.classList.add('past');
      else if (ev.start <= now) { row.classList.add('now'); row.append(h('span', 'badge', 'Now')); }
      else if (isNext && ev.start - now < SOON) row.append(h('span', 'badge', untilText(ev.start - now)));
    }
    li.append(row);
    return li;
  }

  // Token expired and quietly refreshing failed (helper not up yet after starting, internet still gone after sleep).
  // Since 0.59.0 (1.0 self-recovery): simply try quietly again every 5 minutes, and only show the "Refresh" button when
  // it fails for an hour. Before that the agenda stayed stuck here until you switched tabs.
  let failSince = 0;
  const RETRY_AUTH = 5 * 60 * 1000;
  const showReconnect = () => { el.reconnect.hidden = !failSince || Date.now() - failSince < 3600000; };
  function expired() {
    if (!failSince) failSince = Date.now();
    if (events.length) render();
    else card.dataset.state = 'main';
    showReconnect();
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(retryAuth, RETRY_AUTH);
  }
  function retryAuth() {
    if (DEMO) return;
    refreshFromHelper().then(() => (token() ? load() : expired()));
  }

  function showLogin(msg) {
    el.loginMsg.textContent = !CONFIGURED
      ? 'Fill in your Google Client ID in config.js first.'
      : msg || 'Link your Google Calendar to see your appointments here.';
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

  // Every minute update "Now"/"in X min"; refresh when coming back to the tab
  setInterval(() => {
    if (card.dataset.state !== 'main' || document.hidden) return;
    render();
    if (!DEMO) showReconnect();
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || card.dataset.state !== 'main') return;
    if (DEMO) return render();
    if (token() && Date.now() - fetchedAt > 60000) load();
    else if (!token()) retryAuth();
  });
  // After sleep or when the internet is back (dash.js): fetch again right away
  window.addEventListener('dash:wake', () => { if (!DEMO && card.dataset.state === 'main') (token() ? load() : retryAuth()); });
  // Another tile (mail, health) got a new token while the agenda was stuck: load right away
  window.addEventListener('dash:google', () => { if (!DEMO && failSince && token()) load(); });

  // ---------- Demo (?demo) ----------
  function demoEvents() {
    const t = startOfDay(Date.now());
    const at = (day, hh, mm = 0) => addDays(t, day) + (hh * 60 + mm) * 60000;
    const now = Date.now();
    return [
      { id: '21', title: 'Practical Programming Experiments', location: 'Mandeville T4-95A', allDay: false, start: at(0, 9), end: at(0, 11, 45), color: '#039be5', calName: 'Timetable EUR' },
      { id: '22', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(0, 17), end: at(0, 21, 30), color: '#3f51b5' },
      { id: '1', title: 'Breakfast with Sam', location: 'Café de Hoek', allDay: false, start: at(0, 8, 30), end: at(0, 9, 30), color: '#f6bf26' },
      { id: '2', title: 'Work block', location: '', allDay: false, start: now - 20 * 60000, end: now + 40 * 60000, color: '#7986cb' },
      { id: '3', title: 'Dentist', location: 'Hoofdstraat 12', allDay: false, start: now + 95 * 60000, end: now + 125 * 60000, color: '#e67c73' },
      { id: '4', title: 'Film night', location: '', allDay: false, start: at(0, 20), end: at(0, 23), color: '#33b679' },
      { id: '5', title: "Grandma's birthday", location: '', allDay: true, start: addDays(t, 1), end: addDays(t, 2), color: '#8e24aa', birthday: 'Grandma' },
      { id: '20', title: "Loeka's birthday", location: '', allDay: true, start: addDays(t, 3), end: addDays(t, 4), color: '#8e24aa', birthday: 'Loeka', hidden: true },
      { id: '6', title: 'Gym', location: 'Gym', allDay: false, start: at(1, 18), end: at(1, 19, 30), color: '#039be5' },
      { id: '7', title: 'Weekend away', location: 'Texel', allDay: true, start: addDays(t, 3), end: addDays(t, 5), color: '#33b679' },
      { id: '8', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(2, 8), end: at(2, 13), color: '#3f51b5' },
      { id: '16', title: 'Salaris', location: '', allDay: true, start: parseDate('2026-11-09'), end: parseDate('2026-11-10'), color: '#33b679' },
      { id: '9', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(-1, 17), end: at(-1, 21, 30), color: '#3f51b5' },
      { id: '10', title: 'AH BERKEL EN RODENRIJS', location: 'Westerwater', allDay: false, start: at(-8, 9), end: at(-8, 15), color: '#3f51b5' },
      { id: '11', title: '🏁 FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026 - Race', location: '', allDay: false, start: at(5, 21), end: at(5, 23), color: '#f09300' },
      { id: '12', title: '⏱️ FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026 - Qualifying', location: '', allDay: false, start: at(4, 22), end: at(4, 23), color: '#f09300' },
      { id: '13', title: 'Essay week 6 [ESSB-MP6020]', location: '', allDay: false, start: at(1, 23, 59), end: at(1, 23, 59), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '14', title: 'Quiz chapter 4 [ESSB-MP6020]', location: '', allDay: false, start: at(3, 12), end: at(3, 12), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '15', title: 'Reflection report [ESSB-BS2100]', location: '', allDay: false, start: at(-1, 17), end: at(-1, 17), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '17', title: 'Reading assignment chapter 5 [ESSB-BS2100]', location: '', allDay: false, start: now + 5 * 3600000, end: now + 5 * 3600000, color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '18', title: 'Group presentation [ESSB-PS3040]', location: '', allDay: false, start: at(9, 9), end: at(9, 9), color: '#9e69af', canvas: true, assignment: true, hidden: true },
      { id: '19', title: 'Logbook week 7 [ESSB-PS3040]', location: '', allDay: false, start: at(-4, 23, 59), end: at(-4, 23, 59), color: '#9e69af', canvas: true, assignment: true, hidden: true },
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
    // First try quietly via the helper; if that fails, the button
    if (cache) render();
    refreshFromHelper().then(() => {
      if (token()) load();
      else if (cache || store.get(KEY.hint)) expired();
      else showLogin();
    });
  }

  start();
})();
