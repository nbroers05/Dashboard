'use strict';

// Gewerkte AH-uren deze week en deze maand, uit afspraken met "AH" in de titel.
DASH.widget('w-ah', (card, body, guard) => {
  const { h, nl, startOfWeek, fmtTime, fmtDay } = DASH;
  let calendar = null;

  // Uren binnen [from, to): wat al voorbij is telt als gewerkt, de rest als ingepland
  function hours(shifts, from, to, now) {
    let worked = 0, planned = 0;
    for (const s of shifts) {
      const a = Math.max(s.start, from), b = Math.min(s.end, to);
      if (b <= a) continue;
      worked += Math.max(0, Math.min(b, now) - a);
      planned += Math.max(0, b - Math.max(a, now));
    }
    return { worked: worked / 3600000, planned: planned / 3600000 };
  }

  const fmtH = (v) => `${nl(v, v % 1 ? 1 : 0)} u`;

  function row(label, r) {
    const li = h('li');
    li.append(h('span', 't', label), h('span', 'n', fmtH(r.worked)));
    if (r.planned > 0) li.append(h('span', 'd', `+${fmtH(r.planned)}`));
    return li;
  }

  function render() {
    if (!calendar) return;
    if (!calendar.connected) {
      body.replaceChildren(h('p', 'w-note', 'Koppel je Google Agenda om je uren te tellen.'));
      return;
    }
    const now = Date.now();
    const d = new Date(now);
    const shifts = calendar.events.filter(DASH.isAH);
    const week = startOfWeek(now);
    const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();

    const list = h('ul', 'w-list');
    list.append(
      row('Deze week', hours(shifts, week, DASH.addDays(week, 7), now)),
      row(d.toLocaleDateString('nl-NL', { month: 'long' }).replace(/^./, (c) => c.toUpperCase()), hours(shifts, month, nextMonth, now)),
    );

    const next = shifts.filter((s) => s.end > now).sort((a, b) => a.start - b.start)[0];
    const foot = h('p', 'w-note',
      next ? `Volgende: ${fmtDay(next.start)} ${fmtTime(next.start)}–${fmtTime(next.end)}` : 'Geen dienst meer gepland.');
    foot.style.marginTop = 'auto';
    const legend = h('p', 'w-note', 'gewerkt · +ingepland, pauzes niet afgetrokken');
    legend.style.fontSize = '.75rem';
    body.replaceChildren(list, foot, legend);
  }

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
});
