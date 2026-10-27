'use strict';

// AH-uren uit afspraken met "AH" in de titel: groot getal voor deze week, staafjes per dag, maand en volgende dienst.
DASH.widget('w-ah', (card, body, guard) => {
  const { h, nl, startOfWeek, addDays, startOfDay, fmtTime, fmtDay } = DASH;
  const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
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
  const fmtH = (v) => nl(v, v % 1 ? 1 : 0);

  // Een AH-periode duurt 4 weken (ma t/m zo). Daarna zit er een week tussen, en in de week erna komt het salaris.
  // Voorbeeld: periode 5 okt – 1 nov, week 2–8 nov ertussen, salaris in de week van 9 nov.
  const DAY = 86400000;
  function period(events, now) {
    const paydays = events.filter((e) => /salaris/i.test(e.title || '')).map((e) => e.start).sort((a, b) => a - b);
    if (!paydays.length) return null;
    const endOf = (payday) => addDays(startOfWeek(payday), -7);   // eerste dag ná de periode
    const anchor = addDays(endOf(paydays[0]), -28);
    const k = Math.floor(Math.round((startOfDay(now) - anchor) / DAY) / 28);
    const start = addDays(anchor, 28 * k);
    const end = addDays(start, 28);
    const payday = paydays.find((p) => endOf(p) === end);
    return { start, end, payday: payday || addDays(end, 7), exact: !!payday };
  }

  function render() {
    if (!calendar) return;
    if (!calendar.connected) {
      body.replaceChildren(h('div', 'w-empty', null));
      body.firstChild.append(h('p', null, 'Koppel je Google Agenda om je uren te tellen.'));
      return;
    }
    const now = Date.now();
    const d = new Date(now);
    const shifts = calendar.events.filter(DASH.isAH);
    // Zelfde blauw als je AH-diensten in de agenda
    const color = (shifts.find((s) => s.color) || {}).color;
    if (color) card.style.setProperty('--ah', color);

    const week = startOfWeek(now);
    const wk = hours(shifts, week, addDays(week, 7), now);
    // AH-periode (4 weken) op basis van "Salaris" in je agenda; geen salaris gevonden → deze maand
    const per = period(calendar.events, now);
    const range = per || { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
    const month = hours(shifts, range.start, range.end, now);

    const top = h('div', 'ah-top');
    const big = h('div', 'w-big', fmtH(wk.worked));
    big.append(h('small', null, 'uur'));
    const left = h('div');
    left.append(h('div', 'w-label', 'Deze week'), big);
    if (wk.planned > 0) left.append(h('div', 'w-sub', `+${fmtH(wk.planned)} u ingepland`));
    const right = h('div', 'ah-month');
    const short = (ms) => new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '');
    const label = per ? `Periode ${short(range.start)} – ${short(addDays(range.end, -1))}` : d.toLocaleDateString('nl-NL', { month: 'long' });
    right.append(h('div', 'w-label', label), h('b', null, `${fmtH(month.worked)} u`));
    if (month.planned > 0) right.append(h('div', 'w-sub', `+${fmtH(month.planned)} u ingepland`));
    // Verwacht salaris: alle uren in de periode (gewerkt + ingepland) × uurloon
    if (per) {
      const wage = Number((window.DASHBOARD_CONFIG || {}).ahUurloon);
      const pay = h('div', 'ah-pay');
      if (wage > 0) {
        const euro = (month.worked + month.planned) * wage;
        pay.append(h('b', null, euro.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })));
        pay.append(h('div', 'w-sub', `bruto · ${per.exact ? '' : '± '}${fmtDay(per.payday)}`));
      } else {
        pay.append(h('div', 'w-sub', `Salaris ${per.exact ? '' : '± '}${fmtDay(per.payday)}`), h('div', 'w-sub', 'uurloon in config.js voor €'));
      }
      right.append(pay);
    }
    top.append(left, right);

    // Staafjes per dag (vol = gewerkt, licht = ingepland)
    const perDay = DAYS.map((_, i) => hours(shifts, addDays(week, i), addDays(week, i + 1), now));
    const max = Math.max(8, ...perDay.map((x) => x.worked + x.planned));
    const bars = h('div', 'ah-bars');
    const labels = h('div', 'ah-days');
    const todayIdx = Math.round((startOfDay(now) - week) / 86400000);
    perDay.forEach((x, i) => {
      const col = h('div', 'ah-bar');
      const tot = x.worked + x.planned;
      col.append(h('span', 'v', tot ? fmtH(tot) : ''));
      const stack = h('div', 'stack');
      stack.style.height = `${Math.max(4, (tot / max) * 85)}%`;
      if (x.worked) { const w = h('i', 'w'); w.style.flex = String(x.worked); stack.append(w); }
      if (x.planned) { const p = h('i', 'p'); p.style.flex = String(x.planned); stack.append(p); }
      col.append(stack);
      col.title = tot ? `${DAYS[i]}: ${fmtH(x.worked)} u gewerkt${x.planned ? `, ${fmtH(x.planned)} u ingepland` : ''}` : `${DAYS[i]}: vrij`;
      bars.append(col);
      labels.append(h('span', i === todayIdx ? 'today' : '', DAYS[i]));
    });

    const next = shifts.filter((s) => s.end > now).sort((a, b) => a.start - b.start)[0];
    const foot = h('div', 'w-sub', next ? `Volgende: ${fmtDay(next.start)} ${fmtTime(next.start)}–${fmtTime(next.end)}` : 'Geen dienst meer gepland');
    foot.style.marginTop = 'auto';
    body.replaceChildren(top, bars, labels, foot);
  }

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
});
