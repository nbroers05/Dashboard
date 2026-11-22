'use strict';

// Focus mode: a study timer from the top bar (default 50 min work, 10 min break, adjustable).
// During focus: time left next to the clock, the rest of the dashboard slightly dimmed, notifications in the
// notifications tile muted (widgets/alerts.js looks at DASH.focus) and optionally your study playlist on via Spotify.
// Done: a short message on the dashboard and a browser notification (no ntfy: Noah uses the Phone Link notifications).
// Kept in localStorage, so reloading or a new tab doesn't stop the timer.
// Since 1.16.0 (Planner v3) also on one task: the ▶ in tasks.exe or "Focus now" in the task window starts 4 rounds of 25 min with
// 5 min breaks for that task (focus.exe: big timer, Pause, "Done - tick off", Stop). Focus minutes go to the shared focus.log
// (per day and task, DASH_PLAN.focus) for "Focus this week" in rhythm.exe. DASH_FOCUS: startTask(t), task(), left(), open().
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  const btn = bar && bar.querySelector('.tb-focus');
  if (!btn) return;
  const CFG = (window.DASHBOARD_CONFIG || {}).focus || {};
  const STATE = 'focus.state';
  const SETTINGS = 'focus.settings';
  const PLAYLIST = /^[A-Za-z0-9]{22}$/.test(CFG.playlist || '') ? CFG.playlist : null;

  const settings = () => ({ work: CFG.workMinutes || 50, pause: CFG.breakMinutes || 10, rounds: 1, music: !!PLAYLIST, ...(store.get(SETTINGS) || {}) });
  const state = () => store.get(STATE);
  const running = () => { const s = state(); return !!(s && s.sessionEnd > Date.now()); };
  const P = () => window.DASH_PLAN;
  const logMin = (s, min) => { if (P()) P().focus.add(s.task && s.task.id, min); };

  // Above the date: "Focus 42:10" or "Break 8:12" (on the portrait screen it replaces the date, so the bar doesn't get wider)
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

  // ---------- Done notifications ----------
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
    const total = opts.rounds * (opts.work + opts.pause) * 60000 - opts.pause * 60000;   // no break after the last round
    store.set(STATE, { ...opts, round: 1, phase: 'work', end: now + opts.work * 60000, sessionEnd: now + total });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    if (opts.music && PLAYLIST) playMusic();
    apply();
  }
  function stop(done) {
    const s = state();
    if (s && !done && s.phase === 'work') logMin(s, ((s.pausedAt || Date.now()) - (s.end - s.work * 60000)) / 60000);
    store.set(STATE, null);
    if (done) notify('Focus done', 'Well done! Your study block is over.');
    apply();
  }
  async function playMusic() {
    const S = window.DASH_SPOTIFY;
    if (!S || !S.connected()) return toast('Log in to Spotify to start your study playlist.');
    try {
      await S.api('PUT', '/me/player/play', { context_uri: `spotify:playlist:${PLAYLIST}` });
    } catch (e) {
      toast(e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE' ? 'Study playlist: open Spotify somewhere first (no active device).' : `Study playlist failed: ${e.message}`);
    }
  }
  // Phase over? On to a break, the next round or done
  function step() {
    const s = state();
    if (!s || s.pausedAt) return;
    const now = Date.now();
    if (now < s.end) return;
    if (s.phase === 'work') logMin(s, s.work);
    if (s.phase === 'work' && s.round < s.rounds) {
      store.set(STATE, { ...s, phase: 'pause', end: s.end + s.pause * 60000 });
      notify('Break', `${s.pause} minutes break. Then round ${s.round + 1} of ${s.rounds}.`);
    } else if (s.phase === 'pause') {
      store.set(STATE, { ...s, phase: 'work', round: s.round + 1, end: s.end + s.work * 60000 });
      notify('Back to work', `Round ${s.round + 1} of ${s.rounds}: ${s.work} minutes of focus.`);
    } else {
      return stop(true, s);
    }
    step();   // if the tab was away for long, catch up on several phases at once
  }

  let ticker = null;
  function apply() {
    step();
    const s = state();
    const on = !!s;
    document.documentElement.classList.toggle('focus-on', on);
    document.documentElement.classList.toggle('focus-pause', on && s.phase === 'pause');
    btn.setAttribute('aria-pressed', on);
    btn.title = on ? 'Focus mode: running (click to stop or adjust)' : 'Start focus mode';
    DASH.focus = on ? { until: s.sessionEnd, phase: s.phase } : null;
    window.dispatchEvent(new CustomEvent('dash:focus', { detail: DASH.focus }));
    clearInterval(ticker);
    pill.hidden = !on;
    if (on) {
      const tick = () => {
        step();
        const cur = state();
        if (!cur) return apply();
        pill.textContent = cur.pausedAt ? `Paused ${mmss(cur.end - cur.pausedAt)}` : `${cur.phase === 'work' ? 'Focus' : 'Break'} ${mmss(cur.end - Date.now())}`;
        pill.title = `${cur.phase === 'work' ? 'Focus' : 'Break'} · round ${cur.round} of ${cur.rounds} · done at ${DASH.fmtTime(cur.sessionEnd)}`;
        if (panel && panel.dialog.open) panelStatus();
      };
      tick();
      ticker = setInterval(tick, 1000);
    }
    if (panel && panel.dialog.open) fillPanel();
  }

  // ---------- Paneel: instellen, starten, stoppen ----------
  let panel = null, statusEl = null, bigEl = null, subEl = null;
  function openPanel() {
    if (!panel) {
      panel = DASH.panel('Focus mode', 'var(--c-study)');
      panel.dialog.classList.add('focus-dialog');
    }
    fillPanel();
    panel.open();
  }
  function panelStatus() {
    const s = state();
    if (!s || !statusEl) return;
    if (bigEl) {
      bigEl.textContent = mmss(s.end - (s.pausedAt || Date.now()));
      subEl.textContent = `${s.pausedAt ? 'paused' : s.phase === 'work' ? 'focus' : 'break'} · round ${s.round} of ${s.rounds}`;
      return;
    }
    statusEl.textContent = `${s.phase === 'work' ? 'Focus' : 'Break'} · ${mmss(s.end - Date.now())} left · round ${s.round} of ${s.rounds} · done at ${DASH.fmtTime(s.sessionEnd)}`;
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
    bigEl = subEl = null;
    if (s && s.task) {
      // focus.exe: one task, big timer
      statusEl = h('span');
      bigEl = h('p', 'fc-big');
      subEl = h('p', 'fc-sub');
      const dots = h('div', 'fc-dots');
      for (let i = 1; i <= s.rounds; i++) dots.append(h('i', i < s.round ? 'on' : i === s.round ? 'now' : ''));
      const mins = P() ? P().focus.today(s.task.id) : 0;
      const info = h('p', 'w-sub fc-info', `${s.work} min focus · ${s.pause} min break${s.music ? ' · study playlist' : ''}${mins ? ` · on this task today: ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60}` : mins} min` : ''}`);
      const pause = h('button', 'w-btn ghost', s.pausedAt ? 'Resume' : 'Pause');
      pause.type = 'button';
      pause.onclick = () => {
        const cur = state();
        if (!cur) return;
        if (cur.pausedAt) { const d = Date.now() - cur.pausedAt; store.set(STATE, { ...cur, pausedAt: null, end: cur.end + d, sessionEnd: cur.sessionEnd + d }); }
        else store.set(STATE, { ...cur, pausedAt: Date.now() });
        apply();
      };
      const doneB = h('button', 'w-btn', 'Done - tick off');
      doneB.type = 'button';
      doneB.onclick = () => { const id = s.task.id; stop(false); if (window.DASH_TASKS) DASH_TASKS.update(id, { done: true }); panel.close(); };
      const stopB = h('button', 'w-btn ghost', 'Stop');
      stopB.type = 'button';
      stopB.onclick = () => { stop(false); panel.close(); };
      const actions = h('div', 'fc-actions fc-task-actions');
      actions.append(pause, doneB, stopB);
      panel.body.replaceChildren(h('p', 'fc-task', s.task.text), bigEl, subEl, dots, info, actions, h('p', 'w-sub fc-info', 'Notifications on the dashboard are muted while it runs.'));
      panelStatus();
      return;
    }
    if (s) {
      statusEl = h('p', 'fc-status');
      const stopBtn = h('button', 'w-btn', 'Stop');
      stopBtn.type = 'button';
      stopBtn.onclick = () => { stop(false); panel.close(); };
      const actions = h('div', 'fc-actions');
      if (s.phase === 'pause') {
        const skip = h('button', 'w-btn ghost', 'Skip break');
        skip.type = 'button';
        skip.onclick = () => { store.set(STATE, { ...state(), end: Date.now() }); apply(); };
        actions.append(skip);
      }
      actions.append(stopBtn);
      panel.body.replaceChildren(statusEl, h('p', 'w-sub', 'Notifications on the dashboard are muted until the timer is done.'), actions);
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
    musicLabel.append(music, h('span', null, PLAYLIST ? 'Turn on the study playlist via Spotify' : 'Study playlist (no playlist filled in yet in config.js → focus.playlist)'));
    const go = h('button', 'w-btn', 'Start');
    go.type = 'submit';
    const form = h('form', 'fc-form');
    const row = h('div', 'fc-row');
    row.append(field('Work (min)', work), field('Break (min)', pause), field('Rounds', rounds));
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

  // ---------- One task (Planner v3) ----------
  function startTask(t) {
    const cur = settings();
    if (state()) stop(false);
    start({ work: 25, pause: 5, rounds: 4, music: !!cur.music && !!PLAYLIST, task: { id: t.id, text: t.text } });
    store.set(SETTINGS, cur);   // the task preset doesn't change your own settings
    openPanel();
  }
  window.DASH_FOCUS = {
    startTask,
    open: openPanel,
    task: () => { const s = state(); return s && s.task ? s.task : null; },
    left: () => { const s = state(); return s ? mmss(s.end - (s.pausedAt || Date.now())) : ''; },
  };
  // Another tab starts or stops the timer: update here right away
  window.addEventListener('storage', (e) => { if (e.key === STATE) apply(); });
  apply();
})();
