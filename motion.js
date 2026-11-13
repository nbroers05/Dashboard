'use strict';

// Subtle animations on load: tiles slide in softly (top to bottom) and big numbers count up briefly.
// All one-off; with "reduce motion" (prefers-reduced-motion) nothing happens.
(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dash = document.querySelector('.dashboard');
  if (!dash) return;

  // ---------- Inschuiven ----------
  // Order as you see them (after the layout from desk.js), then one by one with a small delay
  const cards = [...dash.querySelectorAll(':scope > .card, :scope > .media-stack, .widgets > .tile, .desk-col > *, .desk-more, .tall-row > *, .tall-rot')]
    .filter((c) => c.offsetParent !== null)
    .map((c) => ({ c, r: c.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  cards.forEach(({ c }, i) => c.style.setProperty('--i', Math.min(i, 12)));
  document.body.classList.add('intro');
  document.body.classList.remove('booting');
  // Remove afterwards, otherwise it plays again when a tile appears later (lyrics, minimal mode off)
  setTimeout(() => document.body.classList.remove('intro'), 2600);

  // ---------- Cijfers optellen ----------
  // The first time a tile shows a big number, it counts up from 0. Later refreshes don't.
  // A start time per tile: if the tile redraws during the count (weather + rain arrive separately), it simply carries on
  const started = new WeakMap();
  const seen = new WeakSet();
  const DURATION = 1200;
  const ease = (t) => 1 - (1 - t) ** 3;

  function countUp(el, t0) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !/\d/.test(node.nodeValue));
    if (!node) return;
    const m = node.nodeValue.match(/^(\D*?)(\d+(?:,\d+)?)(.*)$/s);
    if (!m) return;
    const [, pre, num, post] = m;
    const target = Number(num.replace(',', '.'));
    const decimals = (num.split(',')[1] || '').length;
    if (!target) return;
    const step = (now) => {
      if (!node.isConnected) return;
      const t = Math.min(1, (now - t0) / DURATION);
      node.nodeValue = `${pre}${(target * ease(t)).toFixed(decimals).replace('.', ',')}${post}`;
      if (t < 1) requestAnimationFrame(step);
    };
    step(performance.now()); // right away, otherwise the final number flashes for one frame
  }

  const scan = () => {
    const now = performance.now();
    for (const el of dash.querySelectorAll('.tile .w-big')) {
      if (seen.has(el)) continue;
      seen.add(el);
      const tile = el.closest('.tile');
      if (!started.has(tile)) started.set(tile, now);
      const t0 = started.get(tile);
      if (now - t0 < DURATION) countUp(el, t0);
    }
  };
  const obs = new MutationObserver(scan);
  obs.observe(dash, { childList: true, subtree: true });
  scan();
  // Only "on load": stop looking after half a minute (agenda and extensions are in by then)
  setTimeout(() => obs.disconnect(), 30000);
})();
