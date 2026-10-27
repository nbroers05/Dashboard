'use strict';

// Canvas-deadlines van deze week (ma–zo), uit de Canvas-agenda die in Google Agenda is geabonneerd.
DASH.widget('w-canvas', (card, body, guard) => {
  const { h, fmtTime, fmtWeekday, startOfWeek, addDays, startOfDay } = DASH;
  const MAX = 6;
  let calendar = null;

  // "Essay week 6 [ESSB-MP6020]" → titel + vak
  function split(title) {
    const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    return m ? { name: m[1], course: m[2] } : { name: title, course: '' };
  }

  function render() {
    if (!calendar) return;
    if (!calendar.connected) {
      body.replaceChildren(h('p', 'w-note', 'Koppel je Google Agenda om je deadlines te zien.'));
      return;
    }
    const canvas = calendar.events.filter((e) => e.canvas);
    if (!canvas.length) {
      body.replaceChildren(h('p', 'w-note', 'Nog geen Canvas-agenda gevonden. Abonneer je Canvas-feed in Google Agenda (zie README).'));
      return;
    }
    // Als Canvas opdrachten herkenbaar markeert, alleen die tonen (geen colleges)
    const pool = canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
    const now = Date.now();
    const from = startOfWeek(now), to = addDays(from, 7);
    const due = (e) => (e.allDay ? e.end - 1 : e.end);
    const items = pool.filter((e) => due(e) >= from && due(e) < to).sort((a, b) => due(a) - due(b));

    if (!items.length) {
      body.replaceChildren(h('p', 'w-note', 'Niks in te leveren deze week.'));
      return;
    }

    const list = h('ul', 'w-list');
    for (const e of items.slice(0, MAX)) {
      const { name, course } = split(e.title);
      const t = due(e);
      const li = h('li');
      if (t < now) li.className = 'past';
      const when = startOfDay(t) === startOfDay(now) ? 'vandaag' : fmtWeekday(t);
      li.append(h('span', 'd', `${when} ${e.allDay ? '' : fmtTime(t)}`.trim()));
      const title = h('span', 't', name);
      title.title = course ? `${name} · ${course}` : name;
      li.append(title);
      list.append(li);
    }
    body.replaceChildren(list);
    if (items.length > MAX) body.append(h('span', 'w-more', `+${items.length - MAX} meer`));
  }

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
});
