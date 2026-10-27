'use strict';

// Canvas-deadlines van deze week (ma–zo) als tijdlijn: één bolletje per deadline, kleur per vak.
DASH.widget('w-canvas', (card, body, guard) => {
  const { h, fmtTime, fmtDay, startOfWeek, addDays, startOfDay } = DASH;
  const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const PALETTE = ['#2fbf71', '#4fc3f7', '#ffb74d', '#ba68c8', '#f06292', '#aed581', '#4db6ac', '#ffd54f'];
  let calendar = null;
  let selected = null;

  // "Essay week 6 [ESSB-MP6020]" → titel + vak
  function split(title) {
    const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    return m ? { name: m[1], course: m[2] } : { name: title, course: '' };
  }
  // Vaste kleur per vak (zelfde vak = altijd dezelfde kleur)
  function courseColor(course) {
    let n = 0;
    for (const ch of course) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[n % PALETTE.length];
  }

  function empty(text) {
    const box = h('div', 'w-empty');
    box.append(h('p', null, text));
    body.replaceChildren(box);
  }

  function render() {
    if (!calendar) return;
    if (!calendar.connected) return empty('Koppel je Google Agenda om je deadlines te zien.');
    const canvas = calendar.events.filter((e) => e.canvas);
    if (!canvas.length) return empty('Nog geen Canvas-agenda gevonden (zie README, stap 4).');

    const pool = canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
    const now = Date.now();
    const from = startOfWeek(now), to = addDays(from, 7);
    const due = (e) => (e.allDay ? e.end - 1 : e.end);
    const items = pool.filter((e) => due(e) >= from && due(e) < to).sort((a, b) => due(a) - due(b))
      .map((e) => ({ e, t: due(e), ...split(e.title) }));

    const pos = (t) => `${((t - from) / (to - from)) * 100}%`;
    const line = h('div', 'cv-line');
    DAYS.forEach((d, i) => {
      const tick = h('span', `cv-tick${startOfDay(now) === addDays(from, i) ? ' today' : ''}`, d);
      tick.style.left = `${((i + 0.5) / 7) * 100}%`;
      line.append(tick);
    });
    const nowMark = h('span', 'cv-now');
    nowMark.style.left = pos(now);
    line.append(nowMark);

    // Bolletjes op hun tijdstip; vallen ze dicht bij elkaar, dan stapelen ze omhoog
    const placed = [];
    for (const it of items) {
      const x = (it.t - from) / (to - from);
      const level = placed.filter((p) => Math.abs(p - x) < 0.035).length;
      placed.push(x);
      const dot = h('button', `cv-dot${it.t < now ? ' past' : ''}`);
      dot.style.left = pos(it.t);
      dot.style.top = `${50 - level * 22}px`;
      dot.style.setProperty('--dot', courseColor(it.course || it.name));
      dot.setAttribute('aria-label', `${it.name}, ${fmtDay(it.t)} ${fmtTime(it.t)}`);
      dot.title = `${it.name}${it.course ? ` · ${it.course}` : ''}\n${fmtDay(it.t)} ${fmtTime(it.t)}`;
      dot.onclick = dot.onmouseenter = () => { selected = it.e.id; showFocus(); };
      dot.dataset.id = it.e.id;
      line.append(dot);
    }

    const focus = h('div', 'cv-focus');
    function showFocus() {
      const it = items.find((x) => x.e.id === selected) || items.find((x) => x.t >= now) || items[items.length - 1];
      line.querySelectorAll('.cv-dot').forEach((d) => d.classList.toggle('sel', !!it && d.dataset.id === it.e.id));
      if (!it) {
        focus.replaceChildren(h('span', 'w-mid', 'Niks in te leveren deze week 🎉'));
        return;
      }
      const sw = h('span', 'sw');
      sw.style.setProperty('--dot', courseColor(it.course || it.name));
      const txt = h('div');
      txt.style.minWidth = '0';
      const b = h('b', null, it.name);
      b.title = it.name;
      txt.append(h('span', 'w-label', it.t < now ? 'Verlopen' : it === items.find((x) => x.t >= now) ? 'Eerstvolgende' : 'Deadline'), b,
        h('div', 'w-sub', `${fmtDay(it.t)} ${it.e.allDay ? '' : fmtTime(it.t)}${it.course ? ` · ${it.course}` : ''}`));
      focus.replaceChildren(sw, txt);
    }
    showFocus();

    // Legenda: één kleur per vak
    const legend = h('div', 'cv-legend');
    for (const course of [...new Set(items.map((x) => x.course).filter(Boolean))]) {
      const s = h('span');
      const i = h('i');
      i.style.setProperty('--dot', courseColor(course));
      s.append(i, document.createTextNode(course));
      legend.append(s);
    }

    const head = h('div', 'w-row');
    const count = items.filter((x) => x.t >= now).length;
    const big = h('div', 'w-big', String(count));
    big.append(h('small', null, count === 1 ? 'deadline te gaan' : 'deadlines te gaan'));
    head.append(big);
    body.replaceChildren(head, line, focus, legend);
  }

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
});
