'use strict';

// Check-in (experience sampling): mood, energy, focus and stress (1-5) and a note in a few taps.
// Saved in the PRIVATE repo (data/self-report/<year>-<month>.csv) via datarepo.js. If saving fails (offline,
// no token), the check-in stays in a queue in this browser and goes later after all.
// 3x a day the Action in the private repo sends an ntfy notification with a link to #checkin-<unix>: then the
// form opens right away and the check-in is linked to that notification. "Fill in now" always works.
// The tile only shows how many check-ins you filled in today (from the archive, this and last month, every 10 min,
// so phone and PC count together; plus the queue). Deliberately NO values or other numbers from the archive (since
// 0.44.17): Noah writes down his hypotheses first before he looks at the check-in data. In the browser too
// we only keep the time and id.
DASH.widget('w-checkin', (card, body, guard) => {
  const { h, store } = DASH;
  const D = window.DASH_DATA;
  const QUEUE = 'checkin.queue';
  const LOG = 'checkin.log';   // only { t, id } of the last days (from the archive + queue), for the count
  const COLS = ['timestamp_utc', 'timestamp_local', 'source', 'collected_at', 'id', 'mood', 'energy', 'focus', 'stress', 'note', 'trigger', 'prompt_utc', 'delay_min', 'device'];
  const SCALES = [
    ['mood', 'Mood', ['😞', '🙁', '😐', '🙂', '😄']],
    ['energy', 'Energy', ['🪫', '😴', '😐', '⚡', '🚀']],
    ['focus', 'Focus', ['🌫️', '😶‍🌫️', '😐', '🎯', '🔥']],
    ['stress', 'Stress', ['😌', '🙂', '😐', '😬', '🤯']],
  ];

  const queue = () => store.get(QUEUE) || [];
  const recent = () => (store.get(LOG) || []).filter((x) => Date.now() - x.t < 3 * 86400000);
  const today = () => recent().filter((x) => DASH.startOfDay(x.t) === DASH.startOfDay(Date.now()));

  // ---------- From the archive: all check-ins of the last days (also from other devices) ----------
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift() || [];
    return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])));
  }
  let pulling = false;
  async function pull() {
    if (pulling || !D.token()) return;
    pulling = true;
    try {
      const now = new Date();
      const month = D.localIso(now).slice(0, 7);
      const prev = D.localIso(new Date(now.getFullYear(), now.getMonth(), 0)).slice(0, 7);
      const files = await Promise.all([...new Set([prev, month])].map((m) => D.read(`data/self-report/${m}.csv`).catch(() => null)));
      const remote = files.filter(Boolean).flatMap((f) => parseCsv(f.text)).map((r) => ({ t: Date.parse(r.timestamp_utc), id: r.id }))
        .filter((x) => Number.isFinite(x.t) && Date.now() - x.t < 3 * 86400000);
      const ids = new Set(remote.map((x) => x.id));
      // Not saved yet (queue) counts too
      const waiting = queue().filter((r) => !ids.has(r.id)).map((r) => ({ t: Date.parse(r.timestamp_utc), id: r.id }));
      store.set(LOG, [...remote, ...waiting].sort((a, b) => a.t - b.t));
      render();
    } catch (e) {
      console.warn('[check-in] fetching', e);
    } finally {
      pulling = false;
    }
  }

  // ---------- Saving ----------
  let flushing = false, lastError = null;
  async function flush() {
    if (flushing || !D.token() || !queue().length) return;
    flushing = true;
    try {
      while (queue().length) {
        const r = queue()[0];
        await D.appendCsv(`data/self-report/${r.timestamp_local.slice(0, 7)}.csv`, COLS, r);
        store.set(QUEUE, queue().slice(1));
      }
      lastError = null;
    } catch (e) {
      lastError = e.message;
      console.warn('[check-in]', e);
    } finally {
      flushing = false;
      render();
    }
  }

  function save(values, note, promptUtc) {
    const now = new Date();
    const r = {
      timestamp_utc: D.utcIso(now), timestamp_local: D.localIso(now), source: 'self-report', collected_at: D.utcIso(now),
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      ...values, note: note.replace(/\s*\n\s*/g, ' ').trim(),   // one line: easier for CSV and analysis
      trigger: promptUtc ? 'prompt' : 'manual',
      prompt_utc: promptUtc ? D.utcIso(new Date(promptUtc)) : '',
      delay_min: promptUtc ? Math.max(0, Math.round((now - promptUtc) / 60000)) : '',
      device: window.matchMedia('(max-width: 700px)').matches ? 'phone' : 'pc',
    };
    store.set(QUEUE, [...queue(), r]);
    store.set(LOG, [...recent(), { t: now.getTime(), id: r.id }]);
    render();
    flush().then(pull);
  }

  // ---------- Invulvak ----------
  let pop = null, promptAt = null;
  function open(prompt) {
    promptAt = prompt || null;
    if (!pop) {
      pop = DASH.panel('Check-in', 'var(--c-checkin)');
      pop.dialog.classList.add('checkin-dialog');
    }
    pop.body.replaceChildren(buildForm(promptAt, () => pop.close()));
    pop.open();
  }

  // The form itself: in the pop-up, and on the phone also separately in the Data tab (phone.js)
  function buildForm(promptAt, done) {
    const chosen = {};
    const form = h('form', 'ci-form');
    if (promptAt) form.append(h('p', 'w-sub ci-prompt', `Notification from ${DASH.fmtTime(promptAt)}`));
    for (const [key, label, faces] of SCALES) {
      const row = h('div', 'ci-row');
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-label', label);
      const btns = h('div', 'ci-btns');
      faces.forEach((face, i) => {
        const b = h('button', 'ci-btn');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.title = `${label}: ${i + 1}`;
        b.append(h('span', 'ci-face', face), h('span', 'ci-num', String(i + 1)));
        b.onclick = () => {
          chosen[key] = i + 1;
          [...btns.children].forEach((x, k) => x.setAttribute('aria-checked', String(k === i)));
          go.disabled = SCALES.some(([k]) => !chosen[k]);
        };
        btns.append(b);
      });
      row.append(h('span', 'ci-label', label), btns);
      form.append(row);
    }
    const note = h('textarea', 'ci-note');
    note.placeholder = 'Note (may be empty)';
    note.rows = 2;
    note.maxLength = 500;
    const go = h('button', 'w-btn', 'Save');
    go.type = 'submit';
    go.disabled = true;
    form.append(note, go);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (go.disabled) return;
      save({ ...chosen }, note.value, promptAt);
      done();
    };
    return form;
  }
  window.DASH_CHECKIN = { open: () => open(null), form: (done) => buildForm(null, done), today: () => today().length };

  // ---------- Token instellen ----------
  let setup = null;
  function openSetup() {
    if (!setup) {
      setup = DASH.panel('Link data archive', 'var(--c-checkin)');
      setup.dialog.classList.add('checkin-dialog');
    }
    const input = h('input', 'ci-token');
    input.type = 'password';
    input.autocomplete = 'off';
    input.placeholder = D.token() ? 'Token saved (leave empty = remove)' : 'github_pat_…';
    const save = h('button', 'w-btn', 'Save');
    const form = h('form', 'ci-form');
    form.append(
      h('p', 'w-sub', `Check-ins go to your private repo ${D.REPO}. Paste a fine-grained GitHub token here with access to that repo only (Contents: Read and write). It stays only in this browser. How to make one is in the README of ${D.REPO}.`),
      input, save,
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      D.setToken(input.value.trim() || null);
      setup.close();
      flush();
      render();
    };
    setup.body.replaceChildren(form);
    setup.open();
  }

  // ---------- Tile ----------
  function render() {
    const t = today();
    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(t.length));
    big.append(h('small', null, t.length === 1 ? 'check-in today' : 'check-ins today'));
    head.append(big);
    const btn = h('button', 'w-btn', 'Fill in now');
    btn.type = 'button';
    btn.onclick = () => open(null);
    head.append(btn);
    const parts = [head];
    const waiting = queue().length;
    const foot = h('div', 'ci-foot');
    if (!D.token()) {
      const s = h('button', 'text-btn', 'Link data archive');
      s.type = 'button';
      s.onclick = openSetup;
      foot.append(h('span', 'w-sub', waiting ? `${waiting} waiting for a link · ` : 'Not linked yet · '), s);
    } else if (waiting || lastError) {
      foot.append(h('span', `w-sub${lastError ? ' ci-err' : ''}`, lastError ? `Not saved: ${lastError}` : `${waiting} being saved…`));
      const r = h('button', 'text-btn', 'Again');
      r.type = 'button';
      r.onclick = flush;
      if (lastError) foot.append(r);
    }
    if (D.token()) {
      const settings = h('button', 'text-btn ci-settings', 'Token');
      settings.type = 'button';
      settings.title = 'Change the data archive token';
      settings.onclick = openSetup;
      foot.append(settings);
    }
    parts.push(foot);
    body.replaceChildren(...parts);
    window.dispatchEvent(new CustomEvent('dash:checkin'));
  }

  // #checkin or #checkin-<unix> (from the ntfy notification): open the form right away
  function fromHash() {
    const m = location.hash.match(/^#checkin(?:-(\d+))?$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    open(m[1] ? Number(m[1]) * 1000 : null);
  }
  window.addEventListener('hashchange', guard(fromHash));
  window.addEventListener('online', guard(flush));
  window.addEventListener('dash:data-token', guard(() => { render(); pull(); }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  window.addEventListener('dash:data-status', guard(render));
  DASH.every(5 * 60 * 1000, guard(flush));
  DASH.every(10 * 60 * 1000, guard(pull));
  render();
  flush().then(pull);
  fromHash();
});
