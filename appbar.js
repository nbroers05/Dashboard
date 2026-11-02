// Titelbalk voor de Windows-app (repo nbroers05/dashboard-app). Alleen met ?app=pc (onthouden voor dit tabblad,
// html.app wordt al in de <head> gezet). De app heeft geen Windows-rand, dus de site tekent zelf de balk:
// slepen, dubbelklik = maximaliseren, minimaliseren / maximaliseren / sluiten, F11 = schermvullend.
// Zonder window.__TAURI__ (gewone browser met ?app=pc) staat de balk er wel, maar doen de knoppen niets.
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('app')) return;

  const win = (() => { try { return window.__TAURI__?.window?.getCurrentWindow() || null; } catch { return null; } })();
  const call = (fn) => { if (!win) return; try { Promise.resolve(fn(win)).catch(() => {}); } catch {} };

  const icon = (d) => `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${d}"/></svg>`;
  const bar = document.createElement('div');
  bar.className = 'app-bar';
  bar.innerHTML = `
    <span class="app-bar-title"><img src="favicon.svg" alt="" width="16" height="16"><span>Dashboard</span></span>
    <span class="app-bar-btns">
      <button type="button" class="app-btn app-min" aria-label="Minimaliseren" title="Minimaliseren">${icon('M1 8h8')}</button>
      <button type="button" class="app-btn app-max" aria-label="Maximaliseren" title="Maximaliseren">${icon('M1.5 1.5h7v7h-7z')}</button>
      <button type="button" class="app-btn app-close" aria-label="Sluiten" title="Sluiten (naar het systeemvak)">${icon('M1.5 1.5l7 7M8.5 1.5l-7 7')}</button>
    </span>`;
  document.body.prepend(bar);
  if (!win) bar.title = 'Titelbalk van de app (in de browser doen de knoppen niets)';

  bar.querySelector('.app-min').addEventListener('click', () => call((w) => w.minimize()));
  bar.querySelector('.app-max').addEventListener('click', () => call((w) => w.toggleMaximize()));
  bar.querySelector('.app-close').addEventListener('click', () => call((w) => w.close()));
  // Slepen op de balk zelf (niet op de knoppen); dubbelklik = maximaliseren/herstellen
  bar.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.app-btn')) return;
    e.preventDefault();
    if (e.detail === 2) call((w) => w.toggleMaximize());
    else call((w) => w.startDragging());
  });

  // Knop toont "herstellen" als het venster gemaximaliseerd is; schermvullend = balk weg (F11 terug)
  const sync = () => call(async (w) => {
    const [max, full] = await Promise.all([w.isMaximized(), w.isFullscreen()]);
    root.classList.toggle('app-maxed', max);
    if (root.classList.contains('app-full') !== full) {
      root.classList.toggle('app-full', full);
      window.dispatchEvent(new Event('resize'));   // indelingen opnieuw laten meten
    }
  });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(sync, 150); });
  sync();

  addEventListener('keydown', (e) => {
    if (e.key !== 'F11' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    call(async (w) => { await w.setFullscreen(!(await w.isFullscreen())); sync(); });
  });
})();
