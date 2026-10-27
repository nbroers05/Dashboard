'use strict';

// Vakken verplaatsen en van grootte veranderen. Klik rechtsonder op "Indelen":
// sleep een vak aan ⠿ naar een andere plek, en trek aan de hoek rechtsonder om het groter/kleiner te maken.
// De indeling wordt per apparaat-breedte (telefoon / groot scherm) in deze browser bewaard.
(() => {
  const dash = document.querySelector('.dashboard');
  const holder = document.querySelector('.widgets'); // display: contents, de vakken doen mee in het grid van .dashboard
  if (!dash || !holder) return;
  const tiles = () => [...holder.querySelectorAll(':scope > .tile')];

  // Standaard: [breedte in kolommen (van 12), hoogte in rijen]
  const ORDER = ['w-weather', 'w-f1', 'w-rain', 'w-alerts', 'w-ah', 'w-canvas', 'w-mail', 'w-health', 'w-episodes', 'w-stars', 'w-letterboxd', 'w-todo'];
  // Vakken die vervangen zijn: het nieuwe vak neemt de plek en grootte van het oude over
  const RENAMED = { 'w-sun': 'w-rain' };
  const DEFAULT_WIDE = [4, 2];
  // Vakken die standaard breder zijn
  const DEFAULTS = { 'w-letterboxd': [8, 2] };
  const MAX_ROWS = 10;
  const mode = () => (window.matchMedia('(max-width: 700px)').matches ? 'phone' : 'wide');
  const key = () => `dash.layout.v2.${mode()}`;

  const load = () => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key())) || {}; } catch { return {}; }
    for (const [from, to] of Object.entries(RENAMED)) {
      if (saved.order) saved.order = saved.order.map((id) => (id === from ? to : id));
      if (saved.sizes && saved.sizes[from] && !saved.sizes[to]) saved.sizes[to] = saved.sizes[from];
    }
    return saved;
  };
  const save = () => {
    const sizes = {};
    for (const t of tiles()) sizes[t.id] = [Number(t.dataset.w), Number(t.dataset.h)];
    try { localStorage.setItem(key(), JSON.stringify({ order: tiles().map((t) => t.id), sizes })); } catch {}
  };

  const cols = () => getComputedStyle(dash).gridTemplateColumns.split(' ').length;

  function setSize(t, w, h) {
    w = Math.max(1, Math.min(cols(), w));
    h = Math.max(1, Math.min(MAX_ROWS, h));
    t.dataset.w = w;
    t.dataset.h = h;
    // Op de telefoon is er één kolom: daar alleen de hoogte
    t.style.gridColumn = mode() === 'phone' ? '' : `span ${w}`;
    t.style.gridRow = `span ${h}`;
  }

  function apply() {
    const saved = load();
    const order = saved.order || ORDER;
    // Nieuwe vakken die nog niet in een opgeslagen indeling staan, komen achteraan
    for (const id of [...order, ...ORDER.filter((x) => !order.includes(x))]) {
      const t = document.getElementById(id);
      if (t && t.parentElement === holder) holder.append(t);
    }
    for (const t of tiles()) {
      const [w, h] = (saved.sizes && saved.sizes[t.id]) || DEFAULTS[t.id] || DEFAULT_WIDE;
      setSize(t, w, h);
    }
  }

  // ---------- Bewerkmodus ----------
  const bar = document.createElement('div');
  bar.className = 'layout-bar';
  const toggle = document.createElement('button');
  toggle.className = 'layout-btn';
  toggle.textContent = 'Indelen';
  const reset = document.createElement('button');
  reset.className = 'layout-btn';
  reset.textContent = 'Herstel';
  reset.hidden = true;
  bar.append(reset, toggle);
  document.body.append(bar);

  toggle.onclick = () => {
    const on = !dash.classList.contains('editing');
    dash.classList.toggle('editing', on);
    toggle.textContent = on ? 'Klaar' : 'Indelen';
    reset.hidden = !on;
  };
  reset.onclick = () => {
    try { localStorage.removeItem(key()); } catch {}
    apply();
  };

  for (const t of tiles()) {
    const move = document.createElement('button');
    move.className = 'tile-move';
    move.setAttribute('aria-label', 'Verplaats dit vak');
    move.textContent = '⠿';
    const size = document.createElement('div');
    size.className = 'tile-resize';
    size.setAttribute('aria-hidden', 'true');
    t.append(move, size);
    move.addEventListener('pointerdown', (e) => startMove(e, t));
    size.addEventListener('pointerdown', (e) => startResize(e, t));
  }

  function track(onMove, onDone) {
    const up = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onDone();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function startMove(e, tile) {
    e.preventDefault();
    tile.classList.add('dragging');
    track((ev) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = under && under.closest('.widgets > .tile');
      if (!target || target === tile) return;
      const r = target.getBoundingClientRect();
      const before = mode() === 'phone' ? ev.clientY < r.top + r.height / 2 : ev.clientX < r.left + r.width / 2;
      const ref = before ? target : target.nextElementSibling;
      if (ref !== tile && tile.nextElementSibling !== ref) holder.insertBefore(tile, ref);
    }, () => { tile.classList.remove('dragging'); save(); });
  }

  function startResize(e, tile) {
    e.preventDefault();
    const cs = getComputedStyle(dash);
    const gap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const n = cols();
    const inner = dash.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const colW = (inner - gap * (n - 1)) / n;
    const rowH = parseFloat((cs.gridAutoRows.match(/[\d.]+px/) || ['110px'])[0]);
    const box = tile.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: box.width, h: box.height };
    tile.classList.add('resizing');
    track((ev) => {
      const w = Math.round((start.w + ev.clientX - start.x + gap) / (colW + gap));
      const h = Math.round((start.h + ev.clientY - start.y + rowGap) / (rowH + rowGap));
      setSize(tile, w, h);
    }, () => { tile.classList.remove('resizing'); save(); });
  }

  apply();
  window.matchMedia('(max-width: 700px)').addEventListener('change', apply);
})();
