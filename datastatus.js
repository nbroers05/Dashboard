'use strict';

// Data overview: per source of the private archive when it last fetched something, how many rows there are and whether it
// is quiet (> 2 days). Only reads data/status.json from the private repo (the Action makes it every hour), never the
// raw data. The "Data" button in the check-in tile opens the overview; a quiet source also shows in the notifications tile.
// Since 0.44.10 the overview is also in Settings › Data, with all connections and keys (settingsTab).
window.DASH_DATA_STATUS = (() => {
  const { h, store } = DASH;
  const D = window.DASH_DATA;
  const CACHE = 'data.status';
  const NAMES = {
    spotify: 'Spotify', calendar: 'Agenda', canvas: 'Canvas', weather: 'Weather', letterboxd: 'Letterboxd',
    health: 'Health', steam: 'Steam', esm: 'Check-in notifications', 'self-report': 'Check-ins',
    notifications: 'Phone notifications', 'pc-window': 'PC: apps', 'pc-afk': 'PC: active/afk', 'pc-web': 'PC: websites', 'pc-sessions': 'PC: sessions', 'pc-power': 'PC: on/off', 'firefox-history': 'Firefox history',
  };
  const WHERE = { cloud: 'cloud', dashboard: 'dashboard', pc: 'pc' };
  let status = store.get(CACHE), error = null, pop = null;

  const ago = (iso) => {
    if (!iso) return 'never';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return `${Math.max(1, m)} min ago`;
    if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} days ago`;
  };
  // A source counts as a problem when it's quiet or gave an error (not when it's simply not set up yet)
  const problems = () => (status ? Object.entries(status.sources).filter(([, s]) => (s.stale && !s.skipped) || s.error) : []);

  async function load() {
    if (!D || !D.token()) return;
    try {
      const f = await D.read('data/status.json');
      if (!f) throw new Error('data/status.json doesn\'t exist yet (has the Action run?)');
      status = JSON.parse(f.text);
      store.set(CACHE, status);
      error = null;
    } catch (e) {
      error = e.message;
    }
    const p = problems();
    DASH.alert('data', p.length ? {
      level: 'warn', icon: '🗄️',
      text: p.length === 1 ? `Data: ${NAMES[p[0][0]] || p[0][0]} ligt stil` : `Data: ${p.length} bronnen liggen stil`,
      sub: p.map(([k, s]) => `${NAMES[k] || k}${s.error ? ' (error)' : ''}`).join(', '),
      onClick: open,
    } : null);
    window.dispatchEvent(new CustomEvent('dash:data-status'));
    if (pop && pop.dialog.open) fill();
  }

  function fill() { pop.body.replaceChildren(listEl()); }
  function listEl() {
    const list = h('div', 'ds-list');
    if (error) list.append(h('p', 'w-sub ci-err', error));
    if (!status) {
      list.append(h('p', 'w-note', D && D.token() ? 'No status loaded yet.' : 'Link the data archive first (check-in tile → "Link data archive").'));
    } else {
      const order = Object.keys(NAMES);
      const entries = Object.entries(status.sources).sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
      for (const [key, s] of entries) {
        const bad = (s.stale && !s.skipped) || s.error;
        const row = h('div', `ds-row${bad ? ' bad' : s.skipped ? ' off' : ''}`);
        const name = h('div', 'ds-name');
        name.append(h('b', null, NAMES[key] || key), h('span', 'w-sub', `${WHERE[s.where] || s.where} · ${s.kind === 'hourly' ? 'every hour' : s.kind === 'daily' ? 'daily' : 'when there is something'}`));
        const when = h('div', 'ds-when');
        const last = s.last_success || s.last_new_data;
        // Turned off with a (long) reason: "off" on the right and the reason across the full width below, otherwise it pushes the name away
        when.append(h('span', null, s.skipped && !s.rows ? 'off' : `last: ${ago(last)}`),
          h('span', 'w-sub', `${(s.rows || 0).toLocaleString('en-GB')} rows${s.latest_row ? ` · newest ${new Date(s.latest_row).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`));
        row.append(h('span', 'ds-dot', bad ? '⚠' : s.skipped && !s.rows ? '○' : '●'), name, when);
        if (s.skipped && !s.rows) row.append(h('p', 'ds-note', s.skipped));
        if (s.error) row.append(h('p', 'ds-err', s.error));
        list.append(row);
      }
      list.append(h('p', 'w-sub ds-foot', `Status from ${ago(status.generated_at)} · ${D.REPO}`));
    }
    return list;
  }

  // ---------- Settings › Data: sources + all connections and keys ----------
  // Noah types keys himself; they only stay in this browser's localStorage (never in the code or the repo).
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch {} };
  function settingsTab(el) {
    const redraw = () => { el.replaceChildren(); settingsTab(el); };
    const head = (t) => el.append(h('p', 'th-set-h', t));
    const row = (label, sub, state, ...controls) => {
      const r = h('div', 'st-row');
      const txt = h('div', 'th-sw-txt');
      txt.append(h('span', null, label));
      if (sub) txt.append(h('small', null, sub));
      const right = h('div', 'st-ctl');
      if (state) right.append(h('span', `st-state ${state[1]}`, state[0]));
      right.append(...controls);
      r.append(txt, right);
      el.append(r);
      return r;
    };
    const btn = (label, fn, ghost = true) => { const b = h('button', `w-btn${ghost ? ' ghost' : ''}`, label); b.type = 'button'; b.onclick = fn; return b; };
    const keyForm = (placeholder, onSave) => {
      const f = h('form', 'st-key');
      const i = h('input');
      i.type = 'password';
      i.autocomplete = 'off';
      i.placeholder = placeholder;
      f.append(i, h('button', 'w-btn ghost', 'Save'));
      f.onsubmit = (e) => { e.preventDefault(); onSave(i.value.trim()); redraw(); };
      return f;
    };

    head('Sources of the data archive');
    const n = problems().length;
    el.append(listEl());
    const acts = h('div', 'st-actions');
    acts.append(btn('Reload', async () => { await load(); redraw(); }), h('span', 'w-sub', n ? `${n} source(s) quiet or gave an error` : ''));
    el.append(acts);

    head('Connections and keys');
    const tok = D && D.token();
    row('Data archive (private repo)', `Fine-grained GitHub token, only ${D ? D.REPO : 'the data repo'}, Contents: Read and write`,
      tok ? ['linked', 'ok'] : ['not linked', 'bad'],
      keyForm(tok ? 'Token saved (empty = remove)' : 'github_pat_…', (v) => D.setToken(v || null)));
    const S = window.DASH_SPOTIFY;
    const sp = S && S.connected(), spTop = S && S.hasScope('user-top-read');
    row('Spotify', 'Player, save, monthly overview', sp ? (spTop === false ? ['log in again needed', 'warn'] : ['logged in', 'ok']) : ['not logged in', 'bad'],
      ...(S && (!sp || spTop === false) ? [btn(sp ? 'Log in again' : 'Log in', () => S.login(), false)] : []));
    const G = window.DASH_GOOGLE;
    const gOk = G && G.token();
    row('Google Calendar and Gmail', 'Agenda, AH hours, Canvas, mail (token valid for 1 hour; the helper refreshes it quietly)',
      gOk ? [G.gmail() ? 'linked (with Gmail)' : 'linked (without Gmail)', 'ok'] : G && G.connected() ? ['expired', 'warn'] : ['not linked', 'bad'],
      ...(G ? [btn(gOk ? 'Again' : 'Link', () => G.connect(), !!gOk)] : []));
    const hOk = G && G.healthToken();
    row('Google Health', 'Steps (own token)', hOk ? ['linked', 'ok'] : G && G.healthEverGranted() ? ['expired', 'warn'] : ['not linked', 'bad'],
      ...(G ? [btn(hOk ? 'Again' : 'Link', () => G.connectHealth(), !!hOk)] : []));
    const td = store.get('feeds.twelvedata');
    row('Twelve Data', 'Prices in Feeds › Markets (free key from twelvedata.com)', td ? ['set', 'ok'] : ['no key', 'off'],
      keyForm(td ? 'Key saved (empty = remove)' : 'API key', (v) => lsSet('feeds.twelvedata', v)));
    const helper = row('Helper on this PC', 'Phone notifications, media, Google tokens, wishes (helper/start.bat)', ['checking…', 'off']);
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 2500);
    fetch('http://127.0.0.1:8765/notifications', { signal: ctl.signal }).then((r) => r.ok, () => false).then((ok) => {
      const st = helper.querySelector('.st-state');
      st.textContent = ok ? 'running' : 'not reachable';
      st.className = `st-state ${ok ? 'ok' : 'off'}`;
    });
    const run = store.get('data.run');
    const hm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    row('Start the archive every hour', 'Every dashboard with the archive token starts the Action itself when GitHub delays it (datarun.js; token with "Actions: Read and write")',
      !run ? ['not checked yet', 'off'] : run.error ? [run.error, 'warn']
        : [`last run ${hm(run.lastRun)}${run.started ? ` · started by this dashboard ${hm(run.started)}` : ''}`, 'ok']);
    const bday = h('input');
    bday.type = 'date';
    bday.value = store.get('theme.birthday') || '';
    bday.onchange = () => { lsSet('theme.birthday', bday.value || null); if (window.DASH_THEMES) DASH_THEMES.refresh(); };
    row('My birthday', 'For the birthday theme with age; comes from the archive (config.json → personal), here only to change for this browser', null, bday);
    const C = window.DASHBOARD_CONFIG || {};
    const pub = (v) => (v && !/^[A-Z_]+$|PLAK/.test(v) ? ['in config.js', 'ok'] : ['not filled in', 'bad']);
    row('Spotify client ID', 'Public, in config.js', pub(C.spotifyClientId));
    row('Google client ID', 'Public, in config.js', pub(C.googleClientId));
    row('TMDB key', 'Film posters (read-only), in config.js', pub(C.tmdbApiKey));
    el.append(h('p', 'th-set-note', 'Keys you save here stay only in this browser. On another computer: log in with your password (Log in tab), then they come from the bundle.'));
  }

  function open() {
    if (!pop) {
      pop = DASH.panel('Data', 'var(--c-checkin)');
      pop.dialog.classList.add('data-dialog');
    }
    fill();
    pop.open();
    load();
  }

  // Button for in the check-in tile
  function button() {
    const n = problems().length;
    const b = h('button', `text-btn ds-btn${n ? ' bad' : ''}`, n ? `⚠ Data (${n})` : 'Data');
    b.type = 'button';
    b.title = n ? `${n} source(s) quiet or gave an error` : 'Overview of your data archive';
    b.onclick = open;
    return b;
  }

  window.addEventListener('dash:data-token', load);
  DASH.every(30 * 60 * 1000, load);
  setTimeout(load, 1500);   // after the rest has loaded
  return { button, open, load, settingsTab };
})();
