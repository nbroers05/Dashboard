'use strict';

// Rain alarm: precipitation for the next 2 hours per 5 minutes, with a sentence above it.
// Source: DASH.radar() (Buienradar, otherwise Open-Meteo).
DASH.widget('w-rain', (card, body, guard) => {
  const { h, fmtTime, dec, RAIN_MIN } = DASH;

  const intensity = (mmh) => (mmh < 1 ? 'light' : mmh < 4 ? 'moderate' : 'heavy');

  function sentence(slots, now) {
    const wetNow = slots[0].mmh >= RAIN_MIN;
    if (wetNow) {
      const dry = slots.find((s) => s.mmh < RAIN_MIN);
      const peak = Math.max(...slots.filter((s) => !dry || s.start < dry.start).map((s) => s.mmh));
      return dry ? `Rain until ${fmtTime(dry.start)}` : `Rain, ${intensity(peak)} rain for the next 2 hours`;
    }
    const wet = slots.find((s) => s.mmh >= RAIN_MIN);
    if (!wet) return `Dry until ${fmtTime(slots[slots.length - 1].end)}`;
    const min = Math.max(1, Math.round((wet.start - now) / 60000));
    return min <= 60 ? `${intensity(wet.mmh)[0].toUpperCase()}${intensity(wet.mmh).slice(1)} rain in ${min} ${min === 1 ? 'minute' : 'minutes'}` : `Dry until ${fmtTime(wet.start)}`;
  }

  function render(r) {
    const now = Date.now();
    const slots = r.slots.filter((s) => s.end > now).slice(0, 24);
    if (!slots.length) {
      body.replaceChildren(h('p', 'w-note', 'No precipitation data right now.'));
      return;
    }
    const wet = slots.some((s) => s.mmh >= RAIN_MIN);
    card.classList.toggle('is-wet', wet);

    const text = sentence(slots, now);
    const head = h('div', 'rn-head');
    head.append(h('div', 'w-mid rn-text', text));

    // Completely dry: a flat line with the message in the middle, no empty bars
    if (!wet) {
      const flat = h('div', 'rn-flat');
      flat.setAttribute('role', 'img');
      flat.setAttribute('aria-label', 'No rain in the next 2 hours');
      flat.append(h('span', null, 'No rain in the next 2 hours'));
      const foot = h('div', 'w-sub rn-foot', `Source: ${r.source}${r.source === 'Open-Meteo' ? ' (Buienradar not reachable)' : ''} · ${fmtTime(r.updated)}`);
      body.replaceChildren(head, flat, foot);
      return;
    }

    // Bars: square-root scale, so drizzle is visible next to a heavy shower too
    const top = Math.max(2, ...slots.map((s) => s.mmh));
    const chart = h('div', 'rn-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', text);
    for (const s of slots) {
      const bar = h('div', `rn-bar${s.mmh < RAIN_MIN ? ' dry' : ''}`);
      const fill = h('i');
      fill.style.height = s.mmh < RAIN_MIN ? '' : `${Math.max(8, Math.sqrt(s.mmh / top) * 100)}%`;
      bar.title = `${fmtTime(s.start)}: ${s.mmh < RAIN_MIN ? 'dry' : `${dec(s.mmh)} mm/h`}`;
      bar.append(fill);
      chart.append(bar);
    }
    const axis = h('div', 'rn-axis');
    for (let i = 0; i < slots.length; i += 6) axis.append(h('span', null, i === 0 ? 'now' : fmtTime(slots[i].start)));

    const foot = h('div', 'w-sub rn-foot', `Source: ${r.source}${r.source === 'Open-Meteo' ? ' (Buienradar not reachable)' : ''} · ${fmtTime(r.updated)}`);
    body.replaceChildren(head, chart, axis, foot);
  }

  const load = guard(async () => render(await DASH.radar()));
  DASH.every(5 * 60 * 1000, load);
  load();
});
