// Title bar for the Windows app (repo nbroers05/dashboard-app). Only with ?app=pc (remembered for this tab,
// html.app is already set in the <head>). The app has no Windows border, so the site draws the bar itself:
// drag, double-click = maximise, minimise / maximise / close, F11 = full screen.
// Without window.__TAURI__ (a normal browser with ?app=pc) the bar is there, but the buttons do nothing.
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
      <button type="button" class="app-btn app-min" aria-label="Minimise" title="Minimise">${icon('M1 8h8')}</button>
      <button type="button" class="app-btn app-max" aria-label="Maximise" title="Maximise">${icon('M1.5 1.5h7v7h-7z')}</button>
      <button type="button" class="app-btn app-close" aria-label="Close" title="Close (to the system tray)">${icon('M1.5 1.5l7 7M8.5 1.5l-7 7')}</button>
    </span>`;
  document.body.prepend(bar);
  if (!win) bar.title = 'The app\'s title bar (in the browser the buttons do nothing)';

  bar.querySelector('.app-min').addEventListener('click', () => call((w) => w.minimize()));
  bar.querySelector('.app-max').addEventListener('click', () => call((w) => w.toggleMaximize()));
  bar.querySelector('.app-close').addEventListener('click', () => call((w) => w.close()));
  // Drag on the bar itself (not on the buttons); double-click = maximise/restore
  bar.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.app-btn')) return;
    e.preventDefault();
    if (e.detail === 2) call((w) => w.toggleMaximize());
    else call((w) => w.startDragging());
  });

  // The button shows "restore" when the window is maximised; full screen = bar gone (F11 back)
  const sync = () => call(async (w) => {
    const [max, full] = await Promise.all([w.isMaximized(), w.isFullscreen()]);
    root.classList.toggle('app-maxed', max);
    if (root.classList.contains('app-full') !== full) {
      root.classList.toggle('app-full', full);
      window.dispatchEvent(new Event('resize'));   // let the layouts measure again
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
