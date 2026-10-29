'use strict';

// Data-overzicht: per bron van het privé archief wanneer hij laatst iets ophaalde, hoeveel rijen er zijn en of hij
// stil ligt (> 2 dagen). Leest alleen data/status.json uit de privé repo (de Action maakt dat elk uur), nooit de
// ruwe data. Knop "Data" in het check-in-vak opent het overzicht; een stille bron komt ook in het meldingenvak.
window.DASH_DATA_STATUS = (() => {
  const { h, store } = DASH;
  const D = window.DASH_DATA;
  const CACHE = 'data.status';
  const NAMES = {
    spotify: 'Spotify', calendar: 'Agenda', canvas: 'Canvas', weather: 'Weer', letterboxd: 'Letterboxd',
    health: 'Gezondheid', steam: 'Steam', esm: 'Check-in-meldingen', 'self-report': 'Check-ins',
    notifications: 'Telefoonmeldingen', 'pc-window': 'Pc: apps', 'pc-afk': 'Pc: actief/afk', 'pc-web': 'Pc: websites', 'pc-sessions': 'Pc: aan/uit',
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

  function fill() {
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
    pop.body.replaceChildren(list);
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
  return { button, open, load };
})();
