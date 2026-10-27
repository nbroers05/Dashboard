'use strict';

// Buienalarm: neerslag voor de komende 2 uur per 5 minuten, met een zin erboven.
// Bron: DASH.radar() (Buienradar, anders Open-Meteo).
DASH.widget('w-rain', (card, body, guard) => {
  const { h, fmtTime, nl, RAIN_MIN } = DASH;

  const intensity = (mmh) => (mmh < 1 ? 'lichte' : mmh < 4 ? 'matige' : 'zware');

  function sentence(slots, now) {
    const wetNow = slots[0].mmh >= RAIN_MIN;
    if (wetNow) {
      const dry = slots.find((s) => s.mmh < RAIN_MIN);
      const peak = Math.max(...slots.filter((s) => !dry || s.start < dry.start).map((s) => s.mmh));
      return dry ? `Regen tot ${fmtTime(dry.start)}` : `Regen, de komende 2 uur ${intensity(peak)} regen`;
    }
    const wet = slots.find((s) => s.mmh >= RAIN_MIN);
    if (!wet) return `Droog tot ${fmtTime(slots[slots.length - 1].end)}`;
    const min = Math.max(1, Math.round((wet.start - now) / 60000));
    return min <= 60 ? `Over ${min} ${min === 1 ? 'minuut' : 'minuten'} ${intensity(wet.mmh)} regen` : `Droog tot ${fmtTime(wet.start)}`;
  }

  function render(r) {
    const now = Date.now();
    const slots = r.slots.filter((s) => s.end > now).slice(0, 24);
    if (!slots.length) {
      body.replaceChildren(h('p', 'w-note', 'Geen neerslagdata op dit moment.'));
      return;
    }
    const wet = slots.some((s) => s.mmh >= RAIN_MIN);
    card.classList.toggle('is-wet', wet);

    const text = sentence(slots, now);
    const head = h('div', 'rn-head');
    head.append(h('div', 'w-mid rn-text', text));

    // Staafjes: wortel-schaal, zodat motregen ook zichtbaar is naast een flinke bui
    const top = Math.max(2, ...slots.map((s) => s.mmh));
    const chart = h('div', 'rn-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', text);
    for (const s of slots) {
      const bar = h('div', `rn-bar${s.mmh < RAIN_MIN ? ' dry' : ''}`);
      const fill = h('i');
      fill.style.height = s.mmh < RAIN_MIN ? '' : `${Math.max(8, Math.sqrt(s.mmh / top) * 100)}%`;
      bar.title = `${fmtTime(s.start)}: ${s.mmh < RAIN_MIN ? 'droog' : `${nl(s.mmh)} mm/u`}`;
      bar.append(fill);
      chart.append(bar);
    }
    const axis = h('div', 'rn-axis');
    for (let i = 0; i < slots.length; i += 6) axis.append(h('span', null, i === 0 ? 'nu' : fmtTime(slots[i].start)));

    const foot = h('div', 'w-sub rn-foot', `Bron: ${r.source}${r.source === 'Open-Meteo' ? ' (Buienradar niet bereikbaar)' : ''} · ${fmtTime(r.updated)}`);
    body.replaceChildren(head, chart, axis, foot);
  }

  const load = guard(async () => render(await DASH.radar()));
  DASH.every(5 * 60 * 1000, load);
  load();
});
