'use strict';

// Subtiele animaties bij het laden: vakken schuiven zacht in (van boven naar beneden) en grote cijfers tellen kort op.
// Alles eenmalig; bij "beweging beperken" (prefers-reduced-motion) gebeurt er niets.
(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dash = document.querySelector('.dashboard');
  if (!dash) return;

  // ---------- Inschuiven ----------
  // Volgorde zoals je ze ziet (na de indeling uit layout.js), daarna één voor één met een klein verschil
  const cards = [...dash.querySelectorAll(':scope > .card, :scope > .media-stack, .widgets > .tile, .desk-col > *, .desk-more, .tall-row > *, .tall-rot')]
    .filter((c) => c.offsetParent !== null)
    .map((c) => ({ c, r: c.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  cards.forEach(({ c }, i) => c.style.setProperty('--i', Math.min(i, 12)));
  document.body.classList.add('intro');
  document.body.classList.remove('booting');
  // Daarna weghalen, anders speelt het opnieuw als een vak later verschijnt (songtekst, minimale modus uit)
  setTimeout(() => document.body.classList.remove('intro'), 2600);

  // ---------- Cijfers optellen ----------
  // De eerste keer dat een vak een groot getal laat zien, telt het vanaf 0 op. Latere verversingen niet.
  // Per vak de starttijd: tekent het vak zich tijdens het optellen opnieuw (weer + regen komen los binnen), dan loopt het gewoon door
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
    step(performance.now()); // meteen, anders flitst het eindgetal één beeld lang
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
  // Alleen "bij laden": na een halve minuut niet meer kijken (agenda en extensies zijn dan binnen)
  setTimeout(() => obs.disconnect(), 30000);
})();
