'use strict';

// Check-in (experience sampling): in een paar tikken stemming, energie, focus en stress (1-5) en een notitie.
// Opslaan in de PRIVÉ repo (data/self-report/<jaar>-<maand>.csv) via datarepo.js. Lukt opslaan niet (offline,
// geen token), dan blijft de check-in in een wachtrij in deze browser en gaat hij later alsnog.
// 3x per dag stuurt de Action in de privé repo een ntfy-melding met een link naar #checkin-<unix>: dan gaat het
// invulvak meteen open en wordt de check-in aan die melding gekoppeld. "Nu invullen" kan altijd.
DASH.widget('w-checkin', (card, body, guard) => {
  const { h, store } = DASH;
  const D = window.DASH_DATA;
  const QUEUE = 'checkin.queue';
  const LOG = 'checkin.log';   // eigen check-ins van de laatste dagen (voor "vandaag 2 van 3")
  const COLS = ['timestamp_utc', 'timestamp_local', 'source', 'collected_at', 'id', 'mood', 'energy', 'focus', 'stress', 'note', 'trigger', 'prompt_utc', 'delay_min', 'device'];
  const SCALES = [
    ['mood', 'Stemming', ['😞', '🙁', '😐', '🙂', '😄']],
    ['energy', 'Energie', ['🪫', '😴', '😐', '⚡', '🚀']],
    ['focus', 'Focus', ['🌫️', '😶‍🌫️', '😐', '🎯', '🔥']],
    ['stress', 'Stress', ['😌', '🙂', '😐', '😬', '🤯']],
  ];

  const queue = () => store.get(QUEUE) || [];
  const recent = () => (store.get(LOG) || []).filter((x) => Date.now() - x.t < 3 * 86400000);
  const today = () => recent().filter((x) => DASH.startOfDay(x.t) === DASH.startOfDay(Date.now()));

  // ---------- Opslaan ----------
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
      ...values, note: note.replace(/\s*\n\s*/g, ' ').trim(),   // één regel: makkelijker voor CSV en analyse
      trigger: promptUtc ? 'prompt' : 'manual',
      prompt_utc: promptUtc ? D.utcIso(new Date(promptUtc)) : '',
      delay_min: promptUtc ? Math.max(0, Math.round((now - promptUtc) / 60000)) : '',
      device: window.matchMedia('(max-width: 700px)').matches ? 'phone' : 'pc',
    };
    store.set(QUEUE, [...queue(), r]);
    store.set(LOG, [...recent(), { t: now.getTime(), ...values }]);
    render();
    flush();
  }

  // ---------- Invulvak ----------
  let pop = null, promptAt = null;
  function open(prompt) {
    promptAt = prompt || null;
    if (!pop) {
      pop = DASH.panel('Check-in', 'var(--c-checkin)');
      pop.dialog.classList.add('checkin-dialog');
    }
    const chosen = {};
    const form = h('form', 'ci-form');
    if (promptAt) form.append(h('p', 'w-sub ci-prompt', `Melding van ${DASH.fmtTime(promptAt)}`));
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
    note.placeholder = 'Notitie (mag leeg)';
    note.rows = 2;
    note.maxLength = 500;
    const go = h('button', 'w-btn', 'Opslaan');
    go.type = 'submit';
    go.disabled = true;
    form.append(note, go);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (go.disabled) return;
      save({ ...chosen }, note.value, promptAt);
      pop.close();
    };
    pop.body.replaceChildren(form);
    pop.open();
  }

  // ---------- Token instellen ----------
  let setup = null;
  function openSetup() {
    if (!setup) {
      setup = DASH.panel('Data-archief koppelen', 'var(--c-checkin)');
      setup.dialog.classList.add('checkin-dialog');
    }
    const input = h('input', 'ci-token');
    input.type = 'password';
    input.autocomplete = 'off';
    input.placeholder = D.token() ? 'Token opgeslagen (leeg laten = wissen)' : 'github_pat_…';
    const save = h('button', 'w-btn', 'Opslaan');
    const form = h('form', 'ci-form');
    form.append(
      h('p', 'w-sub', `Check-ins gaan naar je privé repo ${D.REPO}. Plak hier een fine-grained GitHub-token met alleen toegang tot die repo (Contents: Read and write). Het blijft alleen in deze browser. Hoe je hem maakt staat in de README van ${D.REPO}.`),
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

  // ---------- Vak ----------
  function render() {
    const t = today();
    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(t.length));
    big.append(h('small', null, t.length === 1 ? 'check-in vandaag' : 'check-ins vandaag'));
    head.append(big);
    const btn = h('button', 'w-btn', 'Nu invullen');
    btn.type = 'button';
    btn.onclick = () => open(null);
    head.append(btn);
    const parts = [head];
    const last = recent().at(-1);
    if (last) {
      const chips = h('div', 'ci-last');
      for (const [key, label, faces] of SCALES) if (last[key]) chips.append(h('span', 'ci-chip', `${faces[last[key] - 1]} ${label.toLowerCase()} ${last[key]}`));
      parts.push(h('p', 'w-sub', `Laatste: ${DASH.fmtDay(last.t)} ${DASH.fmtTime(last.t)}`), chips);
    }
    const waiting = queue().length;
    const foot = h('div', 'ci-foot');
    if (!D.token()) {
      const s = h('button', 'text-btn', 'Data-archief koppelen');
      s.type = 'button';
      s.onclick = openSetup;
      foot.append(h('span', 'w-sub', waiting ? `${waiting} wacht op koppeling · ` : 'Nog niet gekoppeld · '), s);
    } else if (waiting || lastError) {
      foot.append(h('span', `w-sub${lastError ? ' ci-err' : ''}`, lastError ? `Niet opgeslagen: ${lastError}` : `${waiting} wordt opgeslagen…`));
      const r = h('button', 'text-btn', 'Opnieuw');
      r.type = 'button';
      r.onclick = flush;
      if (lastError) foot.append(r);
    }
    if (D.token()) {
      const settings = h('button', 'text-btn ci-settings', 'Token');
      settings.type = 'button';
      settings.title = 'Token voor het data-archief wijzigen';
      settings.onclick = openSetup;
      foot.append(settings);
    }
    if (window.DASH_DATA_STATUS) foot.append(window.DASH_DATA_STATUS.button());
    parts.push(foot);
    body.replaceChildren(...parts);
  }

  // #checkin of #checkin-<unix> (uit de ntfy-melding): meteen het invulvak
  function fromHash() {
    const m = location.hash.match(/^#checkin(?:-(\d+))?$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    open(m[1] ? Number(m[1]) * 1000 : null);
  }
  window.addEventListener('hashchange', guard(fromHash));
  window.addEventListener('online', guard(flush));
  window.addEventListener('dash:data-token', guard(render));
  window.addEventListener('dash:data-status', guard(render));
  DASH.every(5 * 60 * 1000, guard(flush));
  render();
  flush();
  fromHash();
});
