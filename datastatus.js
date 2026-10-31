'use strict';

// Data-overzicht: per bron van het privé archief wanneer hij laatst iets ophaalde, hoeveel rijen er zijn en of hij
// stil ligt (> 2 dagen). Leest alleen data/status.json uit de privé repo (de Action maakt dat elk uur), nooit de
// ruwe data. Knop "Data" in het check-in-vak opent het overzicht; een stille bron komt ook in het meldingenvak.
// Sinds 0.44.10 staat het overzicht ook in Instellingen › Data, met alle koppelingen en sleutels (settingsTab).
window.DASH_DATA_STATUS = (() => {
  const { h, store } = DASH;
  const D = window.DASH_DATA;
  const CACHE = 'data.status';
  const NAMES = {
    spotify: 'Spotify', calendar: 'Agenda', canvas: 'Canvas', weather: 'Weer', letterboxd: 'Letterboxd',
    health: 'Gezondheid', steam: 'Steam', esm: 'Check-in-meldingen', 'self-report': 'Check-ins',
    notifications: 'Telefoonmeldingen', 'pc-window': 'Pc: apps', 'pc-afk': 'Pc: actief/afk', 'pc-web': 'Pc: websites', 'pc-sessions': 'Pc: sessies', 'pc-power': 'Pc: aan/uit', 'firefox-history': 'Firefox-geschiedenis',
  };
  const WHERE = { cloud: 'cloud', dashboard: 'dashboard', pc: 'pc' };
  let status = store.get(CACHE), error = null, pop = null;

  const ago = (iso) => {
    if (!iso) return 'nooit';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return `${Math.max(1, m)} min geleden`;
    if (m < 48 * 60) return `${Math.round(m / 60)} u geleden`;
    return `${Math.round(m / 1440)} dagen geleden`;
  };
  // Een bron telt als probleem als hij stil ligt of een fout gaf (niet als hij gewoon nog niet is ingesteld)
  const problems = () => (status ? Object.entries(status.sources).filter(([, s]) => (s.stale && !s.skipped) || s.error) : []);

  async function load() {
    if (!D || !D.token()) return;
    try {
      const f = await D.read('data/status.json');
      if (!f) throw new Error('data/status.json bestaat nog niet (heeft de Action al gedraaid?)');
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
      sub: p.map(([k, s]) => `${NAMES[k] || k}${s.error ? ' (fout)' : ''}`).join(', '),
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
      list.append(h('p', 'w-note', D && D.token() ? 'Nog geen status geladen.' : 'Koppel eerst het data-archief (check-in-vak → "Data-archief koppelen").'));
    } else {
      const order = Object.keys(NAMES);
      const entries = Object.entries(status.sources).sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
      for (const [key, s] of entries) {
        const bad = (s.stale && !s.skipped) || s.error;
        const row = h('div', `ds-row${bad ? ' bad' : s.skipped ? ' off' : ''}`);
        const name = h('div', 'ds-name');
        name.append(h('b', null, NAMES[key] || key), h('span', 'w-sub', `${WHERE[s.where] || s.where} · ${s.kind === 'hourly' ? 'elk uur' : s.kind === 'daily' ? 'dagelijks' : 'als er iets is'}`));
        const when = h('div', 'ds-when');
        const last = s.last_success || s.last_new_data;
        when.append(h('span', null, s.skipped && !s.rows ? s.skipped : `laatst: ${ago(last)}`),
          h('span', 'w-sub', `${(s.rows || 0).toLocaleString('nl-NL')} rijen${s.latest_row ? ` · nieuwste ${new Date(s.latest_row).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}` : ''}`));
        row.append(h('span', 'ds-dot', bad ? '⚠' : s.skipped && !s.rows ? '○' : '●'), name, when);
        if (s.error) row.append(h('p', 'ds-err', s.error));
        list.append(row);
      }
      list.append(h('p', 'w-sub ds-foot', `Status van ${ago(status.generated_at)} · ${D.REPO}`));
    }
    return list;
  }

  // ---------- Instellingen › Data: bronnen + alle koppelingen en sleutels ----------
  // Sleutels typt Noah zelf; ze blijven alleen in localStorage van deze browser (nooit in de code of de repo).
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
      f.append(i, h('button', 'w-btn ghost', 'Opslaan'));
      f.onsubmit = (e) => { e.preventDefault(); onSave(i.value.trim()); redraw(); };
      return f;
    };

    head('Bronnen van het data-archief');
    const n = problems().length;
    el.append(listEl());
    const acts = h('div', 'st-actions');
    acts.append(btn('Opnieuw laden', async () => { await load(); redraw(); }), h('span', 'w-sub', n ? `${n} bron(nen) liggen stil of gaven een fout` : ''));
    el.append(acts);

    head('Koppelingen en sleutels');
    const tok = D && D.token();
    row('Data-archief (privé repo)', `Fine-grained GitHub-token, alleen ${D ? D.REPO : 'de data-repo'}, Contents: Read and write`,
      tok ? ['gekoppeld', 'ok'] : ['niet gekoppeld', 'bad'],
      keyForm(tok ? 'Token opgeslagen (leeg = wissen)' : 'github_pat_…', (v) => D.setToken(v || null)));
    const S = window.DASH_SPOTIFY;
    const sp = S && S.connected(), spTop = S && S.hasScope('user-top-read');
    row('Spotify', 'Speler, opslaan, maandoverzicht', sp ? (spTop === false ? ['opnieuw inloggen nodig', 'warn'] : ['ingelogd', 'ok']) : ['niet ingelogd', 'bad'],
      ...(S && (!sp || spTop === false) ? [btn(sp ? 'Opnieuw inloggen' : 'Inloggen', () => S.login(), false)] : []));
    const G = window.DASH_GOOGLE;
    const gOk = G && G.token();
    row('Google Agenda en Gmail', 'Agenda, AH-uren, Canvas, mail (token 1 uur geldig; het hulpprogramma vernieuwt stil)',
      gOk ? [G.gmail() ? 'gekoppeld (met Gmail)' : 'gekoppeld (zonder Gmail)', 'ok'] : G && G.connected() ? ['verlopen', 'warn'] : ['niet gekoppeld', 'bad'],
      ...(G ? [btn(gOk ? 'Opnieuw' : 'Koppelen', () => G.connect(), !!gOk)] : []));
    const hOk = G && G.healthToken();
    row('Google Gezondheid', 'Stappen, slaap, hartslag (eigen token)', hOk ? ['gekoppeld', 'ok'] : G && G.healthEverGranted() ? ['verlopen', 'warn'] : ['niet gekoppeld', 'bad'],
      ...(G ? [btn(hOk ? 'Opnieuw' : 'Koppelen', () => G.connectHealth(), !!hOk)] : []));
    const td = store.get('feeds.twelvedata');
    row('Twelve Data', 'Koersen bij Feeds › Markten (gratis key van twelvedata.com)', td ? ['ingesteld', 'ok'] : ['geen key', 'off'],
      keyForm(td ? 'Key opgeslagen (leeg = wissen)' : 'API-key', (v) => lsSet('feeds.twelvedata', v)));
    const helper = row('Hulpprogramma op deze pc', 'Telefoonmeldingen, media, Google-tokens, wensen (helper/start.bat)', ['kijken…', 'off']);
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 2500);
    fetch('http://127.0.0.1:8765/meldingen', { signal: ctl.signal }).then((r) => r.ok, () => false).then((ok) => {
      const st = helper.querySelector('.st-state');
      st.textContent = ok ? 'draait' : 'niet bereikbaar';
      st.className = `st-state ${ok ? 'ok' : 'off'}`;
    });
    const run = store.get('data.run');
    row('Archief elk uur starten', 'Dit dashboard start de Action zelf als GitHub hem uitstelt (datarun.js; token met "Actions: Read and write")',
      !run ? ['nog niet geprobeerd', 'off'] : run.error ? [run.error, 'warn'] : [`laatst gestart ${new Date(run.started).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`, 'ok']);
    const bday = h('input');
    bday.type = 'date';
    bday.value = store.get('theme.birthday') || '';
    bday.onchange = () => { lsSet('theme.birthday', bday.value || null); if (window.DASH_THEMES) DASH_THEMES.refresh(); };
    row('Mijn verjaardag', 'Voor het verjaardagsthema met leeftijd; komt uit het archief (config.json → persoonlijk), hier alleen voor deze browser aan te passen', null, bday);
    const C = window.DASHBOARD_CONFIG || {};
    const pub = (v) => (v && !/^[A-Z_]+$|PLAK/.test(v) ? ['in config.js', 'ok'] : ['niet ingevuld', 'bad']);
    row('Spotify client-ID', 'Openbaar, staat in config.js', pub(C.spotifyClientId));
    row('Google client-ID', 'Openbaar, staat in config.js', pub(C.googleClientId));
    row('TMDB-key', 'Filmposters (alleen-lezen), staat in config.js', pub(C.tmdbApiKey));
    el.append(h('p', 'th-set-note', 'Sleutels die je hier opslaat blijven alleen in deze browser. Op een andere computer moet je ze opnieuw invullen.'));
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

  // Knop voor in het check-in-vak
  function button() {
    const n = problems().length;
    const b = h('button', `text-btn ds-btn${n ? ' bad' : ''}`, n ? `⚠ Data (${n})` : 'Data');
    b.type = 'button';
    b.title = n ? `${n} bron(nen) liggen stil of gaven een fout` : 'Overzicht van je data-archief';
    b.onclick = open;
    return b;
  }

  window.addEventListener('dash:data-token', load);
  DASH.every(30 * 60 * 1000, load);
  setTimeout(load, 1500);   // na het laden van de rest
  return { button, open, load, settingsTab };
})();
