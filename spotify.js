'use strict';

(() => {
  const CLIENT_ID = (window.DASHBOARD_CONFIG || {}).spotifyClientId || '';
  const CONFIGURED = CLIENT_ID && !/PLAK_HIER/.test(CLIENT_ID);
  const SCOPES = [
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-library-read',
    'user-library-modify',
  ].join(' ');
  const AUTH_URL = 'https://accounts.spotify.com/authorize';
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const API = 'https://api.spotify.com/v1';
  // Moet exact gelijk zijn aan een Redirect URI in het Spotify-dashboard
  const REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, '');
  const DEMO = new URLSearchParams(location.search).has('demo');

  // Hoe vaak we Spotify vragen wat er speelt (ms). Tussendoor tikt de balk lokaal door.
  const POLL_PLAYING = 5000;
  const POLL_PAUSED = 10000;
  const POLL_IDLE = 15000;
  const POLL_ERROR = 20000;

  const KEY = { tokens: 'spotify.tokens', verifier: 'spotify.verifier', state: 'spotify.state' };

  const $ = (id) => document.getElementById(id);
  const card = $('spotify');
  const el = {
    album: $('album'), title: $('title'), artist: $('artist'), cover: $('cover'),
    bar: $('bar'), fill: $('fill'), pos: $('pos'), dur: $('dur'),
    prev: $('prev'), play: $('play'), next: $('next'),
    shuffle: $('shuffle'), repeat: $('repeat'), save: $('save'),
    device: $('device'), devices: $('devices'),
    idleTitle: $('idle-title'), idleMsg: $('idle-msg'), loginMsg: $('login-msg'),
    login: $('login'), toast: $('toast'),
  };

  // ---------- Opslag ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  class AuthError extends Error {}
  class ApiError extends Error {
    constructor(status, message, reason) { super(message); this.status = status; this.reason = reason; }
  }

  // ---------- Inloggen (Authorization Code + PKCE) ----------
  function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(len)), (x) => chars[x % chars.length]).join('');
  }

  async function codeChallenge(verifier) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function login() {
    const verifier = randomString(64);
    const state = randomString(16);
    store.set(KEY.verifier, verifier);
    store.set(KEY.state, state);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: await codeChallenge(verifier),
      redirect_uri: REDIRECT_URI,
      state,
    });
    location.assign(`${AUTH_URL}?${params}`);
  }

  // Terugkomst van Spotify na inloggen: ?code=... of ?error=...
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    const error = q.get('error');
    if (!code && !error) return;
    history.replaceState(null, '', REDIRECT_URI);

    if (error) throw new AuthError(error === 'access_denied' ? 'Inloggen geannuleerd.' : `Inloggen mislukt (${error}).`);
    if (q.get('state') !== store.get(KEY.state)) throw new AuthError('Inloggen mislukt, probeer het opnieuw.');

    const verifier = store.get(KEY.verifier);
    store.del(KEY.verifier);
    store.del(KEY.state);
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });
  }

  async function tokenRequest(params) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 || res.status === 401) {
      throw new AuthError(data.error_description || data.error || 'Inloggen mislukt.');
    }
    if (!res.ok) throw new ApiError(res.status, data.error_description || 'Tokenfout');
    const old = store.get(KEY.tokens) || {};
    const tokens = {
      access: data.access_token,
      refresh: data.refresh_token || old.refresh,
      expires: Date.now() + data.expires_in * 1000,
    };
    store.set(KEY.tokens, tokens);
    return tokens;
  }

  let refreshing = null;
  function refreshTokens() {
    if (!refreshing) {
      const t = store.get(KEY.tokens);
      if (!t || !t.refresh) return Promise.reject(new AuthError('Niet ingelogd.'));
      refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: CLIENT_ID })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function accessToken() {
    const t = store.get(KEY.tokens);
    if (!t) throw new AuthError('Niet ingelogd.');
    if (Date.now() > t.expires - 60000) return (await refreshTokens()).access;
    return t.access;
  }

  // ---------- Web API ----------
  let backoffUntil = 0;

  async function api(method, path, body, retry = true) {
    if (DEMO) return demoApi(method, path);
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry) {
      await refreshTokens();
      return api(method, path, body, false);
    }
    if (res.status === 429) {
      backoffUntil = Date.now() + (Number(res.headers.get('Retry-After')) || 10) * 1000;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const err = (data && data.error) || {};
      throw new ApiError(res.status, err.message || res.statusText, err.reason);
    }
    return data;
  }

  // ---------- Toestand ----------
  let playback = null;           // laatste antwoord van /me/player
  let base = { progress: 0, at: 0, duration: 0, playing: false };
  let currentTrackId = null;
  let currentCover = null;
  let saved = false;
  let libMode = null;            // 'new' (/me/library) of 'old' (/me/tracks)
  let pollTimer = null;
  let endPollFired = false;
  let lastSec = -1;
  let dragging = false;

  const position = () => {
    const p = base.playing ? base.progress + (Date.now() - base.at) : base.progress;
    return Math.max(0, Math.min(p, base.duration || 0));
  };

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  function setState(name) {
    card.dataset.state = name;
  }

  // ---------- Pollen ----------
  function schedule(ms) {
    clearTimeout(pollTimer);
    if (!document.hidden) pollTimer = setTimeout(poll, ms);
  }

  function nextDelay() {
    if (!playback || !playback.item) return POLL_IDLE;
    if (!base.playing) return POLL_PAUSED;
    const left = base.duration - position();
    return Math.max(1500, Math.min(POLL_PLAYING, left + 700));
  }

  async function poll() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    if (Date.now() < backoffUntil) return schedule(backoffUntil - Date.now());
    try {
      render(await api('GET', '/me/player?additional_types=episode'));
      schedule(nextDelay());
    } catch (e) {
      if (e instanceof AuthError) return logout('Je sessie is verlopen. Log opnieuw in.');
      if (card.dataset.state === 'loading') {
        el.idleTitle.textContent = 'Spotify niet bereikbaar';
        el.idleMsg.textContent = e instanceof ApiError ? `Spotify zegt: ${e.message}` : 'Controleer je internetverbinding.';
        setState('idle');
      }
      schedule(POLL_ERROR);
    }
  }

  // ---------- Weergave ----------
  function render(d) {
    playback = d;
    if (!d || !d.item) return renderIdle(d);

    const it = d.item;
    const isEpisode = it.type === 'episode';
    const artists = isEpisode ? (it.show && it.show.publisher) || '' : it.artists.map((a) => a.name).join(', ');

    el.album.textContent = isEpisode ? (it.show && it.show.name) || 'Podcast' : (it.album && it.album.name) || '';
    el.title.textContent = it.name;
    el.title.title = it.name;
    el.artist.textContent = artists;
    el.dur.textContent = fmt(it.duration_ms);
    el.device.textContent = d.device ? `Op ${d.device.name}` : '';
    // Paginatitel blijft altijd "Dashboard" (ook als er muziek speelt)

    const images = isEpisode ? it.images : it.album && it.album.images;
    setCover(images && images[0] && images[0].url);

    // Kleine afwijkingen negeren, anders springt de balk heen en weer
    const sameTrack = it.id === currentTrackId;
    const drift = Math.abs(position() - d.progress_ms);
    if (!sameTrack || drift > 1200 || base.playing !== d.is_playing) {
      base = { progress: d.progress_ms || 0, at: Date.now(), duration: it.duration_ms, playing: d.is_playing };
    }
    base.duration = it.duration_ms;
    endPollFired = false;

    card.classList.toggle('playing', d.is_playing);
    el.play.setAttribute('aria-label', d.is_playing ? 'Pauzeren' : 'Afspelen');
    el.shuffle.setAttribute('aria-pressed', String(!!d.shuffle_state));
    el.repeat.dataset.mode = d.repeat_state || 'off';

    // Knoppen blijven altijd staan (geen verspringende layout); wat nu niet kan wordt gedimd, met uitleg bij hover
    const dis = (d.actions && d.actions.disallows) || {};
    setOff(el.prev, dis.skipping_prev && dis.seeking, 'Terug kan nu niet (Spotify staat het niet toe)');
    setOff(el.next, dis.skipping_next, 'Overslaan kan nu niet (bijv. tijdens een advertentie)');
    setOff(el.play, d.is_playing ? dis.pausing : dis.resuming, 'Spotify staat dit nu niet toe');
    setOff(el.shuffle, dis.toggling_shuffle, 'Shuffle kan nu niet (bijv. bij een podcast of advertentie)');
    setOff(el.repeat, dis.toggling_repeat_context && dis.toggling_repeat_track, 'Herhalen kan nu niet (bijv. bij een podcast of advertentie)');
    setOff($('lyrics-btn'), isEpisode, 'Geen songtekst bij een podcast');

    if (!sameTrack) {
      currentTrackId = it.id;
      setSaved(false);
      checkSaved(it);
    }
    setState('player');
    publish(it.type === 'track' ? {
      id: it.id, name: it.name, artist: (it.artists[0] || {}).name || '', album: (it.album && it.album.name) || '', duration: it.duration_ms,
    } : null);
  }

  // Het songtekstvak (lyrics.js) leest het huidige nummer en de positie hieruit
  window.spotifyPosition = () => position();
  let publishedId = undefined;
  function publish(track) {
    window.DASH_TRACK = track;
    const id = track && track.id;
    if (id !== publishedId) {
      publishedId = id;
      window.dispatchEvent(new CustomEvent('dash:track', { detail: track }));
    }
  }

  async function renderIdle(d) {
    currentTrackId = null;
    base = { progress: 0, at: 0, duration: 0, playing: false };
    card.classList.remove('playing');
    document.title = 'Dashboard';
    if (d) {
      el.idleTitle.textContent = 'Niets aan het spelen';
      el.idleMsg.textContent = d.device ? `Spotify staat open op ${d.device.name}. Start daar iets.` : 'Start iets in Spotify.';
      el.devices.replaceChildren();
    } else {
      el.idleTitle.textContent = 'Geen actief apparaat';
      el.idleMsg.textContent = 'Open Spotify op je telefoon, pc of speaker, of kies hieronder een apparaat.';
      loadDevices();
    }
    setState('idle');
    publish(null);
  }

  async function loadDevices() {
    try {
      const res = await api('GET', '/me/player/devices');
      const devices = (res && res.devices) || [];
      el.devices.replaceChildren(...devices.filter((dv) => !dv.is_restricted).map((dv) => {
        const b = document.createElement('button');
        b.textContent = `▶ ${dv.name}`;
        b.onclick = () => action(() => api('PUT', '/me/player', { device_ids: [dv.id], play: true }), null, 1200);
        return b;
      }));
    } catch {
      el.devices.replaceChildren();
    }
  }

  function setCover(url) {
    if (url === currentCover) return;
    currentCover = url;
    // Vervaagde hoes als achtergrond van het hele vak
    card.style.setProperty('--cover', url ? `url("${url}")` : 'none');
    if (!url) { el.cover.removeAttribute('src'); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (currentCover !== url) return;
      const swap = () => { el.cover.src = url; applyColor(img); };
      // Nieuwe hoes vloeit over de oude heen (View Transitions); zonder ondersteuning of bij "beweging beperken" gewoon wisselen
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && el.cover.getAttribute('src') && !calm && !document.hidden) document.startViewTransition(swap);
      else swap();
    };
    img.onerror = () => { if (currentCover === url) el.cover.src = url; };
    img.src = url;
  }

  // Achtergrondkleur uit de hoes (berekening in dash.js); de kaart die vooraan staat in de mediastapel bepaalt de kleur
  function applyColor(img) {
    const c = DASH.coverTint(img);
    if (c) DASH.tint('spotify', c);
  }

  // Lokaal doortikken van de voortgang
  function tick() {
    requestAnimationFrame(tick);
    if (!base.duration || dragging) return;
    const pos = position();
    el.fill.style.transform = `scaleX(${pos / base.duration})`;
    const sec = Math.floor(pos / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      el.pos.textContent = fmt(pos);
      el.bar.setAttribute('aria-valuetext', `${fmt(pos)} van ${fmt(base.duration)}`);
    }
    if (base.playing && pos >= base.duration && !endPollFired) {
      endPollFired = true;
      setTimeout(poll, 600);
    }
  }

  // ---------- Bibliotheek ----------
  function setSaved(v) {
    saved = v;
    el.save.setAttribute('aria-pressed', String(v));
    el.save.setAttribute('aria-label', v ? 'Verwijderen uit bibliotheek' : 'Opslaan in bibliotheek');
  }

  // Spotify heeft in 2026 de bibliotheek-endpoints vervangen; we proberen de nieuwe eerst.
  async function libContains(it) {
    if (libMode !== 'old') {
      try {
        const r = await api('GET', `/me/library/contains?uris=${encodeURIComponent(it.uri)}`);
        libMode = 'new';
        return !!(r && r[0]);
      } catch (e) {
        if (e instanceof AuthError || libMode === 'new') throw e;
        libMode = 'old';
      }
    }
    if (it.type !== 'track') throw new ApiError(0, 'Niet ondersteund');
    const r = await api('GET', `/me/tracks/contains?ids=${it.id}`);
    return !!(r && r[0]);
  }

  function libSet(it, save) {
    const method = save ? 'PUT' : 'DELETE';
    return libMode === 'old'
      ? api(method, `/me/tracks?ids=${it.id}`)
      : api(method, `/me/library?uris=${encodeURIComponent(it.uri)}`);
  }

  async function checkSaved(it) {
    try {
      const v = await libContains(it);
      setOff(el.save, false);
      if (currentTrackId === it.id) setSaved(v);
    } catch {
      setOff(el.save, true, 'Opslaan kan niet bij dit nummer (bijv. een podcast of lokaal bestand)');
    }
  }

  // Gedimde knop: blijft op zijn plek, klikken doet niets, de tooltip zegt waarom
  function setOff(btn, off, why) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.toggle('off', !!off);
    btn.setAttribute('aria-disabled', off ? 'true' : 'false');
    if (off) btn.title = why;
    else btn.removeAttribute('title');
  }
  card.addEventListener('click', (e) => {
    if (e.target.closest('[aria-disabled="true"]')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  // ---------- Bediening ----------
  async function action(fn, optimistic, refreshAfter = 700) {
    if (optimistic) optimistic();
    try {
      await fn();
    } catch (e) {
      handleActionError(e);
    }
    setTimeout(poll, refreshAfter);
  }

  function handleActionError(e) {
    if (e instanceof AuthError) return logout('Je sessie is verlopen. Log opnieuw in.');
    if (e instanceof ApiError) {
      if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') return toast('Geen actief apparaat. Open Spotify ergens.');
      if (e.status === 403) return toast('Dat staat Spotify nu niet toe.');
      if (e.status === 429) return toast('Even rustig aan, Spotify remt af.');
      return toast(`Spotify-fout: ${e.message}`);
    }
    toast('Geen verbinding met Spotify.');
  }

  function rebase(playing) {
    base = { ...base, progress: position(), at: Date.now(), playing };
  }

  el.play.onclick = () => {
    const playing = base.playing;
    action(
      () => api('PUT', `/me/player/${playing ? 'pause' : 'play'}`),
      () => { rebase(!playing); card.classList.toggle('playing', !playing); }
    );
  };

  el.next.onclick = () => action(() => api('POST', '/me/player/next'));

  // Zoals in de auto: na 3 seconden eerst terug naar het begin
  el.prev.onclick = () => {
    if (position() > 3000) {
      action(() => api('PUT', '/me/player/seek?position_ms=0'), () => { base = { ...base, progress: 0, at: Date.now() }; });
    } else {
      action(() => api('POST', '/me/player/previous'));
    }
  };

  el.shuffle.onclick = () => {
    const on = el.shuffle.getAttribute('aria-pressed') !== 'true';
    action(() => api('PUT', `/me/player/shuffle?state=${on}`), () => el.shuffle.setAttribute('aria-pressed', String(on)));
  };

  el.repeat.onclick = () => {
    const order = ['off', 'context', 'track'];
    const mode = order[(order.indexOf(el.repeat.dataset.mode) + 1) % 3];
    action(() => api('PUT', `/me/player/repeat?state=${mode}`), () => { el.repeat.dataset.mode = mode; });
  };

  el.save.onclick = async () => {
    const it = playback && playback.item;
    if (!it) return;
    const target = !saved;
    setSaved(target);
    try {
      await libSet(it, target);
      toast(target ? 'Opgeslagen in je bibliotheek' : 'Verwijderd uit je bibliotheek');
    } catch (e) {
      setSaved(!target);
      handleActionError(e);
    }
  };

  // Spoelen door op de balk te tikken of te slepen
  function seekRatio(ev) {
    const rect = el.bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
  }
  el.bar.addEventListener('pointerdown', (ev) => {
    if (!base.duration) return;
    dragging = true;
    el.bar.setPointerCapture(ev.pointerId);
    el.fill.style.transform = `scaleX(${seekRatio(ev)})`;
  });
  el.bar.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const r = seekRatio(ev);
    el.fill.style.transform = `scaleX(${r})`;
    el.pos.textContent = fmt(r * base.duration);
  });
  el.bar.addEventListener('pointerup', (ev) => {
    if (!dragging) return;
    dragging = false;
    const ms = Math.round(seekRatio(ev) * base.duration);
    action(() => api('PUT', `/me/player/seek?position_ms=${ms}`), () => { base = { ...base, progress: ms, at: Date.now() }; lastSec = -1; });
  });
  el.bar.addEventListener('pointercancel', () => { dragging = false; });

  // Voor het songtekstvak: klik op een regel = daarheen spoelen
  window.spotifySeek = (ms) => action(() => api('PUT', `/me/player/seek?position_ms=${ms}`), () => { base = { ...base, progress: ms, at: Date.now() }; lastSec = -1; });
  el.bar.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const ms = Math.max(0, Math.min(base.duration, position() + (ev.key === 'ArrowRight' ? 10000 : -10000)));
    action(() => api('PUT', `/me/player/seek?position_ms=${ms}`), () => { base = { ...base, progress: ms, at: Date.now() }; });
  });

  // ---------- Overig ----------
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
  }

  function logout(msg) {
    clearTimeout(pollTimer);
    store.del(KEY.tokens);
    showLogin(msg);
  }

  function showLogin(msg) {
    if (!CONFIGURED) {
      el.loginMsg.textContent = 'Vul eerst je Spotify Client ID in config.js in.';
      el.login.disabled = true;
    } else {
      el.loginMsg.textContent = msg || 'Log in om je speler hier te zien.';
    }
    document.title = 'Dashboard';
    setState('login');
  }

  el.login.onclick = login;
  document.querySelectorAll('.logout').forEach((b) => {
    b.onclick = () => (DEMO ? location.assign(REDIRECT_URI) : logout());
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(pollTimer);
    else if (card.dataset.state !== 'login') poll();
  });

  // ---------- Demo (?demo): nep-data om de look te testen ----------
  const demo = {
    device: { name: 'Demo-apparaat' },
    is_playing: true,
    progress_ms: 47000,
    shuffle_state: false,
    repeat_state: 'off',
    saved: false,
    actions: { disallows: {} },
    item: {
      id: 'demo', uri: 'spotify:track:demo', type: 'track', name: 'Nachtrit over de A2', duration_ms: 214000,
      artists: [{ name: 'Voorbeeldband' }, { name: 'Gastzanger' }],
      album: {
        name: 'Lichten van de stad',
        images: [{ url: 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#ff7a59"/><stop offset=".55" stop-color="#c2366b"/><stop offset="1" stop-color="#3a1c71"/></linearGradient></defs>' +
          '<rect width="300" height="300" fill="url(#g)"/><circle cx="210" cy="95" r="42" fill="#ffd7a8" opacity=".9"/></svg>') }],
      },
    },
  };
  let demoAt = Date.now();

  function demoApi(method, path) {
    const now = Date.now();
    if (demo.is_playing) demo.progress_ms = Math.min(demo.progress_ms + (now - demoAt), demo.item.duration_ms);
    demoAt = now;
    const q = new URLSearchParams(path.split('?')[1] || '');
    if (path.startsWith('/me/player?')) return Promise.resolve(JSON.parse(JSON.stringify(demo)));
    if (path === '/me/player/pause') demo.is_playing = false;
    else if (path === '/me/player/play') demo.is_playing = true;
    else if (path === '/me/player/next' || path === '/me/player/previous') demo.progress_ms = 0;
    else if (path.startsWith('/me/player/seek')) demo.progress_ms = Number(q.get('position_ms'));
    else if (path.startsWith('/me/player/shuffle')) demo.shuffle_state = q.get('state') === 'true';
    else if (path.startsWith('/me/player/repeat')) demo.repeat_state = q.get('state');
    else if (path.startsWith('/me/library/contains')) return Promise.resolve([demo.saved]);
    else if (path.startsWith('/me/library')) demo.saved = method === 'PUT';
    return Promise.resolve(null);
  }

  // ---------- Start ----------
  async function start() {
    requestAnimationFrame(tick);
    if (DEMO) return poll();
    if (!CONFIGURED) return showLogin();
    try {
      await handleRedirect();
    } catch (e) {
      return showLogin(e.message);
    }
    if (!store.get(KEY.tokens)) return showLogin();
    poll();
  }

  start();
})();
