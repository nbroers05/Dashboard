'use strict';

// Focusmodus: studietimer vanuit de topbalk (standaard 50 min werken, 10 min pauze, aanpasbaar).
// Tijdens focus: resterende tijd naast de klok, de rest van het dashboard licht gedimd, meldingen in het
// meldingenvak gedempt (widgets/alerts.js kijkt naar DASH.focus) en eventueel je studieplaylist aan via Spotify.
// Klaar: korte melding op het dashboard en een browsermelding (geen ntfy: Noah gebruikt de Phone Link-meldingen).
// Staat in localStorage, dus herladen of een nieuwe tab stopt de timer niet.
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  const btn = bar && bar.querySelector('.tb-focus');
  if (!btn) return;
  const CFG = (window.DASHBOARD_CONFIG || {}).focus || {};
  const STATE = 'focus.state';
  const SETTINGS = 'focus.settings';
  const PLAYLIST = /^[A-Za-z0-9]{22}$/.test(CFG.playlist || '') ? CFG.playlist : null;

  const settings = () => ({ work: CFG.werkMinuten || 50, pause: CFG.pauzeMinuten || 10, rounds: 1, music: !!PLAYLIST, ...(store.get(SETTINGS) || {}) });
  const state = () => store.get(STATE);
  const running = () => { const s = state(); return !!(s && s.sessionEnd > Date.now()); };

  // Boven de datum: "Focus 42:10" of "Pauze 8:12" (staand vervangt hij de datum, zodat de balk niet breder wordt)
  const pill = h('button', 'tb-focus-pill');
  pill.type = 'button';
  pill.hidden = true;
  pill.onclick = () => openPanel();
  bar.querySelector('.tb-day').prepend(pill);

  const mmss = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return `${hh ? `${hh}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
  };

  // ---------- Klaar-meldingen ----------
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
  }
  function notify(title, text) {
    toast(`${title}: ${text}`);
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text, icon: 'favicon-32.png', tag: 'dash-focus' });
    } catch {}
  }

  // ---------- Timer ----------
  function start(opts) {
    store.set(SETTINGS, opts);
    const now = Date.now();
    const total = opts.rounds * (opts.work + opts.pause) * 60000 - opts.pause * 60000;   // na de laatste ronde geen pauze
    store.set(STATE, { ...opts, round: 1, phase: 'work', end: now + opts.work * 60000, sessionEnd: now + total });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    if (opts.music && PLAYLIST) playMusic();
    apply();
  }
  function stop(done) {
    store.set(STATE, null);
    if (done) notify('Focus klaar', 'Goed gedaan! Je studieblok zit erop.');
    apply();
  }
  async function playMusic() {
    const S = window.DASH_SPOTIFY;
    if (!S || !S.connected()) return toast('Log bij Spotify in om je studieplaylist te starten.');
    try {
      await S.api('PUT', '/me/player/play', { context_uri: `spotify:playlist:${PLAYLIST}` });
    } catch (e) {
      toast(e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE' ? 'Studieplaylist: open Spotify eerst ergens (geen actief apparaat).' : `Studieplaylist lukt niet: ${e.message}`);
    }
  }
  // Fase voorbij? Door naar pauze, volgende ronde of klaar
  function step() {
    const s = state();
    if (!s) return;
    const now = Date.now();
    if (now < s.end) return;
    if (s.phase === 'work' && s.round < s.rounds) {
      store.set(STATE, { ...s, phase: 'pause', end: s.end + s.pause * 60000 });
      notify('Pauze', `${s.pause} minuten pauze. Daarna ronde ${s.round + 1} van ${s.rounds}.`);
    } else if (s.phase === 'pause') {
      store.set(STATE, { ...s, phase: 'work', round: s.round + 1, end: s.end + s.work * 60000 });
      notify('Weer aan de slag', `Ronde ${s.round + 1} van ${s.rounds}: ${s.work} minuten focus.`);
    } else {
      return stop(true);
    }
    step();   // was het tabblad lang weg, dan meerdere fases tegelijk inhalen
  }

  let ticker = null;
  function apply() {
    step();
    const s = state();
    const on = !!s;
    document.documentElement.classList.toggle('focus-on', on);
    document.documentElement.classList.toggle('focus-pause', on && s.phase === 'pause');
    btn.setAttribute('aria-pressed', on);
    btn.title = on ? 'Focusmodus: bezig (klik voor stoppen of aanpassen)' : 'Focusmodus starten';
    DASH.focus = on ? { until: s.sessionEnd, phase: s.phase } : null;
    window.dispatchEvent(new CustomEvent('dash:focus', { detail: DASH.focus }));
    clearInterval(ticker);
    pill.hidden = !on;
    if (on) {
      const tick = () => {
        step();
        const cur = state();
        if (!cur) return apply();
        pill.textContent = `${cur.phase === 'work' ? 'Focus' : 'Pauze'} ${mmss(cur.end - Date.now())}`;
        pill.title = `${cur.phase === 'work' ? 'Focus' : 'Pauze'} · ronde ${cur.round} van ${cur.rounds} · klaar om ${DASH.fmtTime(cur.sessionEnd)}`;
        if (panel && panel.dialog.open) panelStatus();
      };
      tick();
      ticker = setInterval(tick, 1000);
    }
    if (panel && panel.dialog.open) fillPanel();
  }

  // ---------- Paneel: instellen, starten, stoppen ----------
  let panel = null, statusEl = null;
  function openPanel() {
    if (!panel) {
      panel = DASH.panel('Focusmodus', 'var(--c-study)');
      panel.dialog.classList.add('focus-dialog');
    }
    fillPanel();
    panel.open();
  }
  function panelStatus() {
    const s = state();
    if (!s || !statusEl) return;
    statusEl.textContent = `${s.phase === 'work' ? 'Focus' : 'Pauze'} · nog ${mmss(s.end - Date.now())} · ronde ${s.round} van ${s.rounds} · klaar om ${DASH.fmtTime(s.sessionEnd)}`;
  }
  function field(label, input, note) {
    const l = h('label', 'fc-field');
    l.append(h('span', null, label), input);
    if (note) l.append(h('small', 'w-sub', note));
    return l;
  }
  function num(value, min, max) {
    const i = h('input');
    i.type = 'number';
    i.min = min; i.max = max; i.value = value;
    return i;
  }
  function fillPanel() {
    const s = state();
    if (s) {
      statusEl = h('p', 'fc-status');
      const stopBtn = h('button', 'w-btn', 'Stoppen');
      stopBtn.type = 'button';
      stopBtn.onclick = () => { stop(false); panel.close(); };
      const actions = h('div', 'fc-actions');
      if (s.phase === 'pause') {
        const skip = h('button', 'w-btn ghost', 'Pauze overslaan');
        skip.type = 'button';
        skip.onclick = () => { store.set(STATE, { ...state(), end: Date.now() }); apply(); };
        actions.append(skip);
      }
      actions.append(stopBtn);
      panel.body.replaceChildren(statusEl, h('p', 'w-sub', 'Meldingen op het dashboard zijn gedempt tot de timer klaar is.'), actions);
      panelStatus();
      return;
    }
    statusEl = null;
    const cur = settings();
    const work = num(cur.work, 1, 240), pause = num(cur.pause, 0, 60), rounds = num(cur.rounds, 1, 8);
    const music = h('input');
    music.type = 'checkbox';
    music.checked = !!cur.music && !!PLAYLIST;
    music.disabled = !PLAYLIST;
    const musicLabel = h('label', 'fc-check');
    musicLabel.append(music, h('span', null, PLAYLIST ? 'Studieplaylist aanzetten via Spotify' : 'Studieplaylist (nog geen playlist ingevuld in config.js → focus.playlist)'));
    const go = h('button', 'w-btn', 'Start');
    go.type = 'submit';
    const form = h('form', 'fc-form');
    const row = h('div', 'fc-row');
    row.append(field('Werken (min)', work), field('Pauze (min)', pause), field('Rondes', rounds));
    form.append(row, musicLabel, go);
    form.onsubmit = (e) => {
      e.preventDefault();
      const clamp = (i, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(i.value)) || d));
      start({ work: clamp(work, 1, 240, 50), pause: clamp(pause, 0, 60, 10), rounds: clamp(rounds, 1, 8, 1), music: music.checked });
      panel.close();
    };
    panel.body.replaceChildren(form);
  }

  btn.onclick = () => openPanel();
  // Een andere tab start of stopt de timer: hier meteen bijwerken
  window.addEventListener('storage', (e) => { if (e.key === STATE) apply(); });
  apply();
})();
