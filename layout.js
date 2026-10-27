'use strict';

// Vakken verplaatsen en van grootte veranderen. Klik rechtsonder op "Indelen":
// sleep een vak aan ⠿ naar een andere plek, en trek aan de hoek rechtsonder om het groter/kleiner te maken.
// De indeling wordt per apparaat-breedte (telefoon / groot scherm) in deze browser bewaard.
(() => {
  const grid = document.querySelector('.widgets');
  if (!grid) return;
  const tiles = () => [...grid.querySelectorAll(':scope > .tile')];

  // Standaard: [breedte in kolommen, hoogte in rijen]
  const DEFAULTS = {
    wide: { 'w-weather': [2, 3], 'w-f1': [1, 3], 'w-sun': [1, 3], 'w-ah': [1, 2], 'w-canvas': [1, 2], 'w-episodes': [1, 3], 'w-stars': [2, 4] },
    phone: { 'w-weather': [2, 4], 'w-f1': [2, 2], 'w-sun': [1, 3], 'w-ah': [1, 3], 'w-canvas': [2, 2], 'w-episodes': [2, 3], 'w-stars': [2, 8] },
  };
  const MAX_ROWS = 10;
  const mode = () => (window.matchMedia('(max-width: 700px)').matches ? 'phone' : 'wide');
  const key = () => `dash.layout.${mode()}`;

  const load = () => { try { return JSON.parse(localStorage.getItem(key())) || {}; } catch { return {}; } };
  const save = () => {
    const sizes = {};
    for (const t of tiles()) sizes[t.id] = [Number(t.dataset.w), Number(t.dataset.h)];
    try { localStorage.setItem(key(), JSON.stringify({ order: tiles().map((t) => t.id), sizes })); } catch {}
  };

  const cols = () => getComputedStyle(grid).gridTemplateColumns.split(' ').length;

  function setSize(t, w, h) {
    w = Math.max(1, Math.min(cols(), w));
    h = Math.max(1, Math.min(MAX_ROWS, h));
    t.dataset.w = w;
    t.dataset.h = h;
    t.style.gridColumn = `span ${w}`;
    t.style.gridRow = `span ${h}`;
  }

  function apply() {
    const saved = load();
    const defaults = DEFAULTS[mode()];
    if (saved.order) {
      for (const id of saved.order) {
        const t = document.getElementById(id);
        if (t && t.parentElement === grid) grid.append(t);
      }
    }
    for (const t of tiles()) {
      const [w, h] = (saved.sizes && saved.sizes[t.id]) || defaults[t.id] || [1, 2];
      setSize(t, w, h);
    }
  }

  // ---------- Bewerkmodus ----------
  const dash = document.querySelector('.dashboard');
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
    const order = Object.keys(DEFAULTS[mode()]);
    for (const id of order) { const t = document.getElementById(id); if (t) grid.append(t); }
    apply();
  };

  // Handvatten in elk vak
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

  function startMove(e, tile) {
    e.preventDefault();
    tile.classList.add('dragging');
    const onMove = (ev) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = under && under.closest('.widgets > .tile');
      if (!target || target === tile) return;
      const r = target.getBoundingClientRect();
      const before = ev.clientX < r.left + r.width / 2;
      const ref = before ? target : target.nextElementSibling;
      if (ref !== tile && tile.nextElementSibling !== ref) grid.insertBefore(tile, ref);
    };
    const onUp = () => {
      tile.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      save();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function startResize(e, tile) {
    e.preventDefault();
    const cs = getComputedStyle(grid);
    const gap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const n = cols();
    const colW = (grid.clientWidth - gap * (n - 1)) / n;
    const rowH = parseFloat(cs.gridAutoRows) || 90;
    const start = { x: e.clientX, y: e.clientY, w: tile.getBoundingClientRect().width, h: tile.getBoundingClientRect().height };
    tile.classList.add('resizing');
    const onMove = (ev) => {
      const w = Math.round((start.w + ev.clientX - start.x + gap) / (colW + gap));
      const h = Math.round((start.h + ev.clientY - start.y + rowGap) / (rowH + rowGap));
      setSize(tile, w, h);
    };
    const onUp = () => {
      tile.classList.remove('resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      save();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  apply();
  // Telefoon draaien of venster smaller maken: andere indeling laden
  window.matchMedia('(max-width: 700px)').addEventListener('change', apply);
})();
