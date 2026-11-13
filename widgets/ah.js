'use strict';

// AH hours from appointments with "AH" in the title: a big number for this week, bars per day, the period and the next shift.
DASH.widget('w-ah', (card, body, guard) => {
  const { h, dec, startOfWeek, addDays, startOfDay, fmtTime, fmtDay } = DASH;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let calendar = null;

  // Hours within [from, to): what's already over counts as worked, the rest as planned
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
  const fmtH = (v) => dec(v, v % 1 ? 1 : 0);
  const euro = (v, d = 0) => v.toLocaleString('en-GB', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- Wage ----------
  // Since 0.44.18 the hourly wage and percentages aren't in the public repo anymore but in config.json → ahWage of the
  // private data archive, read with the archive token (datarepo.js). The last version read is in ah.loon (this browser
  // only), so the tile is right straight away. Without a token: hours yes, amounts no. Demo: made-up round numbers.
  // Format (English since 1.7.0; the old Dutch format "ahLoon" is converted by normalize()):
  //   { hourlyWage, allowances: [{ name, days: ['mon'..'sun' | 'holiday'], from: 'HH:MM', to: 'HH:MM', percent }],
  //     multipleAllowances: 'highest' | 'add', holidays: ['newyear', 'easter1', 'easter2', 'kingsday', 'liberationday',
  //     'ascension', 'whit1', 'whit2', 'christmas1', 'christmas2'], breaks: [{ longerThanHours, minutes }],
  //     holidayPayPercent, holidayPayPerPeriod, profitSharePercent, paidHours: [{ name, percent }],
  //     fixedAllowances: [{ name, amount }], netRatio }
  const DEMO_WAGE = {
    hourlyWage: 12, allowances: [{ name: 'Sunday', days: ['sun'], from: '00:00', to: '24:00', percent: 50 }],
    paidHours: [{ name: 'Holiday hours', percent: 10 }], holidayPayPercent: 8, holidayPayPerPeriod: true, netRatio: 0.95,
  };
  const OLD_DAY = { ma: 'mon', di: 'tue', wo: 'wed', do: 'thu', vr: 'fri', za: 'sat', zo: 'sun', feestdag: 'holiday' };
  const OLD_HOLIDAY = { nieuwjaar: 'newyear', pasen1: 'easter1', pasen2: 'easter2', koningsdag: 'kingsday', bevrijdingsdag: 'liberationday',
    hemelvaart: 'ascension', pinksteren1: 'whit1', pinksteren2: 'whit2', kerst1: 'christmas1', kerst2: 'christmas2' };
  // Old Dutch field names (before 1.7.0) → English
  function normalize(l) {
    if (!l || l.hourlyWage != null || l.brutoUurloon == null) return l || {};
    const many = (list, f) => (list || []).map(f);
    return {
      hourlyWage: l.brutoUurloon,
      allowances: many(l.toeslagen, (r) => ({ name: r.naam, days: many(r.dagen, (d) => OLD_DAY[d] || d), from: r.van, to: r.tot, percent: r.procent })),
      multipleAllowances: l.meerdereToeslagen === 'optellen' ? 'add' : 'highest',
      holidays: many(l.feestdagen, (d) => OLD_HOLIDAY[d] || d),
      breaks: many(l.pauzes, (p) => ({ longerThanHours: p.langerDanUren, minutes: p.minuten })),
      holidayPayPercent: l.vakantiegeldProcent,
      holidayPayPerPeriod: l.vakantiegeldPerPeriode,
      profitSharePercent: l.winstuitkeringProcent,
      paidHours: many(l.uitbetaaldeUren, (x) => ({ name: x.naam, percent: x.procent })),
      fixedAllowances: many(l.vasteToeslagen, (f) => ({ name: f.naam, amount: f.bedrag })),
      netRatio: l.nettoVerhouding,
    };
  }
  let wageState = DASH.DEMO ? 'demo' : 'loading';   // demo | loading | ok | no-token | error
  let CFG = parseWage(DASH.DEMO ? DEMO_WAGE : normalize(DASH.store.get('ah.loon')));
  if (!DASH.DEMO && DASH.store.get('ah.loon')) wageState = 'ok';
  function parseWage(l) {
    return {
      wage: Number(l.hourlyWage) || 0,
      rules: (l.allowances || []).filter((r) => r && r.percent != null && r.from && r.to).map((r) => ({
        ...r, fromMin: toMin(r.from), toMin: toMin(r.to), daySet: new Set(r.days || []),
      })),
      open: (l.allowances || []).filter((r) => r && (r.percent == null || !r.from || !r.to)).map((r) => r.name),
      stack: l.multipleAllowances === 'add',
      holidays: new Set(l.holidays || []),
      breaks: (l.breaks || []).filter((p) => p && p.longerThanHours != null && p.minutes != null).sort((a, b) => b.longerThanHours - a.longerThanHours),
      holidayPct: l.holidayPayPercent,
      holidayInPeriod: l.holidayPayPerPeriod === true,
      profitPct: l.profitSharePercent,
      extraHours: (l.paidHours || []).filter((x) => x && x.percent != null),
      fixed: (l.fixedAllowances || []).filter((f) => f && f.amount != null),
      ratio: l.netRatio,
    };
  }
  async function loadWage() {
    const D = window.DASH_DATA;
    if (DASH.DEMO) return;
    // datarepo.js loads after this tile: wait a bit instead of reporting "no token"
    if (!D) { if ((loadWage.tries = (loadWage.tries || 0) + 1) < 40) setTimeout(guard(loadWage), 250); return; }
    if (!D.token()) { DASH.store.set('ah.loon', null); CFG = parseWage({}); wageState = 'no-token'; return render(); }
    try {
      const f = await D.read('config.json');
      const cfg = f ? JSON.parse(f.text) : {};
      const l = normalize(cfg.ahWage || cfg.ahLoon);
      if (!l || l.hourlyWage == null) throw new Error('no ahWage in config.json');
      DASH.store.set('ah.loon', l);
      CFG = parseWage(l);
      wageState = 'ok';
      // Phone app (since 1.5.0, Noah's choice): the wage settings also in the dashboard's Supabase (only his account),
      // so the app can calculate the net pay itself. Only on a change. (The old `_telefoon.loon` isn't written since 1.7.1.)
      const json = JSON.stringify(l);
      if (window.DASH_SB && DASH_SB.linked() && DASH.store.get('ah.loon.pushed') !== json) {
        DASH_SB.flag('_phone.wage', l)
          .then(() => DASH.store.set('ah.loon.pushed', json)).catch((e) => DASH_SB.fail(e));
      }
    } catch (e) {
      console.warn('[ah] wage', e);
      if (wageState !== 'ok') wageState = 'error';    // a wage read earlier simply stays
    }
    render();
  }
  function toMin(hhmm) { const [hh, mm] = String(hhmm).split(':').map(Number); return hh * 60 + (mm || 0); }

  // Dutch public holidays (Easter via the Gregorian rule)
  const holidayCache = {};
  function holidaysOf(y) {
    if (holidayCache[y]) return holidayCache[y];
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    const month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(y, month - 1, day);
    const plus = (n) => { const x = new Date(easter); x.setDate(x.getDate() + n); return x; };
    const king = new Date(y, 3, 27); if (king.getDay() === 0) king.setDate(26);
    const all = {
      newyear: new Date(y, 0, 1), easter1: easter, easter2: plus(1), kingsday: king, liberationday: new Date(y, 4, 5),
      ascension: plus(39), whit1: plus(49), whit2: plus(50), christmas1: new Date(y, 11, 25), christmas2: new Date(y, 11, 26),
    };
    const map = {};
    for (const [name, dt] of Object.entries(all)) if (CFG.holidays.has(name)) map[dt.toDateString()] = name;
    return (holidayCache[y] = map);
  }
  const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // Gross for (the part within [from, to) of) one shift: per minute the rate with the allowance that applies then
  function shiftPay(s, from = -Infinity, to = Infinity) {
    const a = Math.max(s.start, from), b = Math.min(s.end, to);
    const out = { min: 0, paidMin: 0, gross: 0, parts: {} };
    if (b <= a) return out;
    let raw = 0;
    for (let t = a; t < b; t += 60000) {
      const d = new Date(t);
      const minute = d.getHours() * 60 + d.getMinutes();
      const holiday = holidaysOf(d.getFullYear())[d.toDateString()];
      const hits = CFG.rules.filter((r) => (r.daySet.has(WEEKDAY[d.getDay()]) || (holiday && r.daySet.has('holiday'))) && minute >= r.fromMin && minute < r.toMin);
      let pct = 0, name = 'Base';
      if (hits.length) {
        const top = hits.reduce((x, y) => (y.percent > x.percent ? y : x));
        pct = CFG.stack ? hits.reduce((sum, r) => sum + r.percent, 0) : top.percent;
        name = CFG.stack ? hits.map((r) => r.name).join(' + ') : top.name;
      }
      raw += (CFG.wage / 60) * (1 + pct / 100);
      out.parts[name] = (out.parts[name] || 0) + 1;
      out.min++;
    }
    // Unpaid break (based on the whole shift), spread proportionally over the time slots
    const full = (s.end - s.start) / 3600000;
    const rule = CFG.breaks.find((p) => full > p.longerThanHours);
    const share = out.min / ((s.end - s.start) / 60000);
    const unpaid = rule ? Math.min(out.min, rule.minutes * share) : 0;
    const factor = out.min ? (out.min - unpaid) / out.min : 0;
    out.paidMin = out.min - unpaid;
    out.gross = raw * factor;
    for (const k of Object.keys(out.parts)) out.parts[k] *= factor;
    return out;
  }
  function pay(shifts, from, to) {
    const per = shifts.map((s) => ({ s, ...shiftPay(s, from, to) })).filter((x) => x.min > 0).sort((a, b) => a.s.start - b.s.start);
    return { shifts: per, gross: per.reduce((t, x) => t + x.gross, 0), hours: per.reduce((t, x) => t + x.paidMin, 0) / 60 };
  }
  // Period: hours with allowances + fixed amounts; net only as an estimate with the ratio from the config
  function periodPay(shifts, range) {
    const p = pay(shifts, range.start, range.end);
    const fixed = CFG.fixed.reduce((t, f) => t + Number(f.amount), 0);
    // Hours paid out every period (ADV, holiday hours), as a % of all your hours including allowance hours
    // (on the payslip: worked + allowance hours + TVT). Allowance hours = allowance converted to hours, so gross ÷ hourly wage.
    const allHours = CFG.wage > 0 ? p.gross / CFG.wage : 0;
    const extras = CFG.extraHours.map((x) => ({ name: x.name, hours: allHours * (x.percent / 100), pay: allHours * (x.percent / 100) * CFG.wage }));
    const extra = extras.reduce((t, x) => t + x.pay, 0);
    // Holiday pay and profit share: % over all hour items together
    const base = p.gross + extra;
    const holidayPay = CFG.holidayPct != null ? base * (CFG.holidayPct / 100) : null;
    const profit = CFG.profitPct != null ? base * (CFG.profitPct / 100) : null;
    const gross = base + fixed + (CFG.holidayInPeriod && holidayPay ? holidayPay : 0) + (profit || 0);
    return { ...p, fixed, extras, holidayPay, profit, gross, net: CFG.ratio != null ? gross * CFG.ratio : null };
  }

  // What's still missing in the archive (config.json → ahWage, numbers from your payslip)
  function missing() {
    const m = [];
    if (!(CFG.wage > 0)) m.push('gross hourly wage');
    for (const n of CFG.open) m.push(`allowance ${String(n).toLowerCase()}`);
    if (CFG.holidayPct == null) m.push('holiday pay %');
    if (CFG.ratio == null) m.push('net/gross ratio');
    return m;
  }

  // ---------- Pop-up with the calculation ----------
  let panel = null;
  let lastView = null;
  function openDetails() {
    if (!lastView || !lastView.per || !(CFG.wage > 0)) return;
    const { shifts, week, range } = lastView;
    if (!panel) panel = DASH.panel('AH pay calculation', 'var(--ah, var(--c-ah))');
    panel.dialog.classList.add('ah-dialog');
    const p = periodPay(shifts, range);
    const wkPay = pay(shifts, week, addDays(week, 7));
    const short = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    const inner = h('div', 'ahp');

    const sum = h('div', 'ahp-sum');
    const cell = (label, value, sub) => { const d = h('div'); d.append(h('span', 'w-label', label), h('b', null, value)); if (sub) d.append(h('span', 'w-sub', sub)); return d; };
    sum.append(
      cell('This week', euro(wkPay.gross, 2), `${fmtH(wkPay.hours)} h paid`),
      cell('Period gross', euro(p.gross, 2), `${fmtH(p.hours)} h worked${p.extras.length || p.fixed || CFG.holidayInPeriod ? ' + extras, see below' : ''}`),
      cell('Net (estimate)', p.net != null ? euro(p.net, 2) : '–', p.net != null ? `× ${dec(CFG.ratio, 2)} from the archive` : 'fill in netRatio'),
    );
    inner.append(sum);

    const table = h('div', 'ahp-table');
    const head = h('div', 'ahp-row ahp-head');
    head.append(h('span', null, 'Shift'), h('span', null, 'Hours'), h('span', null, 'Allowances'), h('span', null, 'Gross'));
    table.append(head);
    for (const x of p.shifts) {
      const row = h('div', `ahp-row${x.s.end > Date.now() ? ' planned' : ''}`);
      const parts = Object.entries(x.parts).filter(([k]) => k !== 'Base').map(([k, v]) => `${k} ${fmtH(v / 60)} h`).join(', ') || '–';
      row.append(
        h('span', null, `${short(x.s.start)} ${fmtTime(x.s.start)}–${fmtTime(x.s.end)}`),
        h('span', null, `${fmtH(x.paidMin / 60)}`),
        h('span', 'w-sub', parts),
        h('b', null, euro(x.gross, 2)),
      );
      table.append(row);
    }
    if (!p.shifts.length) table.append(h('p', 'w-note', 'No shifts in this period.'));
    inner.append(h('h3', 'ahp-title', `Period ${short(range.start)} – ${short(addDays(range.end, -1))}`), table);

    const extra = h('ul', 'ahp-extra');
    for (const x of p.extras) extra.append(h('li', null, `${x.name} paid out: ${fmtH(Math.round(x.hours * 100) / 100)} h = ${euro(x.pay, 2)}`));
    for (const f of CFG.fixed) extra.append(h('li', null, `${f.name}: ${euro(Number(f.amount), 2)}`));
    if (p.holidayPay != null) {
      extra.append(h('li', null, CFG.holidayInPeriod
        ? `Holiday allowance ${dec(CFG.holidayPct, CFG.holidayPct % 1 ? 2 : 0)}%: ${euro(p.holidayPay, 2)} (included in the period amount)`
        : `Holiday pay built up this period: ${euro(p.holidayPay, 2)} (${dec(CFG.holidayPct, 2)}%, paid out later, not in the amount above)`));
    }
    if (p.profit != null) extra.append(h('li', null, `Profit share (WUK) ${dec(CFG.profitPct, 2)}%: ${euro(p.profit, 2)} (included in the period amount)`));
    extra.append(h('li', null, `Hourly wage ${euro(CFG.wage, 2)} · ${CFG.rules.length ? CFG.rules.map((r) => `${r.name} +${dec(r.percent, r.percent % 1 ? 1 : 0)}% (${r.from}–${r.to})`).join(', ') : 'no allowances filled in yet'} · on overlap ${CFG.stack ? 'added up' : 'the highest'}`));
    if (CFG.breaks.length) extra.append(h('li', null, `Unpaid break: ${CFG.breaks.map((b) => `${b.minutes} min for more than ${dec(b.longerThanHours, 1)} h`).join(', ')}`));
    const miss = missing();
    if (miss.length) extra.append(h('li', 'ahp-miss', `Not filled in yet in the data archive (config.json → ahWage): ${miss.join(', ')}. Until they are, they don't count.`));
    inner.append(extra, h('p', 'w-note', 'Grey rows are planned (not worked yet). This is a calculation based on your agenda, not a payslip.'));
    panel.body.replaceChildren(inner);
    panel.open();
  }
  card.classList.add('clickable');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'AH hours, click for the pay calculation');
  card.addEventListener('click', () => openDetails());
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(); } });

  // An AH period lasts 4 weeks (Mon to Sun). After that there's a week in between, and the week after that the pay comes.
  // Example: period 5 Oct – 1 Nov, week 2–8 Nov in between, pay in the week of 9 Nov.
  // The pay day is an appointment with "Salaris" (Dutch for salary) or "salary" in the title.
  const DAY = 86400000;
  function period(events, now) {
    const paydays = events.filter((e) => /salaris|salary/i.test(e.title || '')).map((e) => e.start).sort((a, b) => a - b);
    if (!paydays.length) return null;
    const endOf = (payday) => addDays(startOfWeek(payday), -7);   // first day after the period
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
      body.replaceChildren(DASH.problem('Link your Google Calendar to count your hours.', 'Link agenda', DASH.connectGoogle));
      return;
    }
    const now = Date.now();
    const d = new Date(now);
    const shifts = calendar.events.filter(DASH.isAH);
    // AH always in the bright AH blue (Noah's preference, 13 Nov 2026), not the calendar color

    const week = startOfWeek(now);
    const wk = hours(shifts, week, addDays(week, 7), now);
    // AH period (4 weeks) based on the pay day in your agenda; no pay day found → this month
    const per = period(calendar.events, now);
    const range = per || { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
    const month = hours(shifts, range.start, range.end, now);

    const top = h('div', 'ah-top');
    const big = h('div', 'w-big', fmtH(wk.worked));
    big.append(h('small', null, 'hours'));
    const left = h('div');
    left.append(h('div', 'w-label', 'This week'), big);
    if (wk.planned > 0) left.append(h('div', 'w-sub', `+${fmtH(wk.planned)} h planned`));
    const right = h('div', 'ah-month');
    const short = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('.', '');
    const label = per ? `Period ${short(range.start)} – ${short(addDays(range.end, -1))}` : d.toLocaleDateString('en-GB', { month: 'long' });
    right.append(h('div', 'w-label', label), h('b', null, `${fmtH(month.worked)} h`));
    if (month.planned > 0) right.append(h('div', 'w-sub', `+${fmtH(month.planned)} h planned`));
    // Expected pay: all shifts in the period (worked + planned), with the allowance per time slot
    const wkPay = pay(shifts, week, addDays(week, 7));
    if (CFG.wage > 0 && wkPay.gross > 0) left.append(h('div', 'w-sub ah-wk-pay', `≈ ${euro(wkPay.gross)} gross`));
    if (per) {
      const box = h('div', 'ah-pay');
      if (CFG.wage > 0) {
        const p = periodPay(shifts, range);
        box.append(h('b', null, euro(p.gross)));
        box.append(h('div', 'w-sub', `gross · ${per.exact ? '' : '± '}${fmtDay(per.payday)}`));
        if (p.net != null) box.append(h('div', 'w-sub ah-net', `net ≈ ${euro(p.net)} (estimate)`));
      } else {
        box.append(h('div', 'w-sub', `Pay ${per.exact ? '' : '± '}${fmtDay(per.payday)}`));
        if (wageState === 'no-token' || wageState === 'error') {
          const b = h('button', 'text-btn ah-link', wageState === 'error' ? 'wage not read' : 'link the archive for €');
          b.type = 'button';
          b.title = wageState === 'error' ? 'The wage settings couldn\'t come from the data archive (config.json → ahWage). Try again' : 'Your wage settings are in the private data archive. Link it in Settings › Data';
          b.onclick = (e) => { e.stopPropagation(); if (wageState === 'error') loadWage(); else if (window.DASH_SETTINGS) DASH_SETTINGS.open('data'); };
          box.append(b);
        } else if (wageState === 'loading') box.append(h('div', 'w-sub', 'loading wage…'));
      }
      right.append(box);
    }
    top.append(left, right);
    lastView = { shifts, week, range, per };

    // Bars per day (solid = worked, light = planned)
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
      col.title = tot ? `${DAYS[i]}: ${fmtH(x.worked)} h worked${x.planned ? `, ${fmtH(x.planned)} h planned` : ''}` : `${DAYS[i]}: off`;
      bars.append(col);
      labels.append(h('span', i === todayIdx ? 'today' : '', DAYS[i]));
    });

    const next = shifts.filter((s) => s.end > now).sort((a, b) => a.start - b.start)[0];
    const foot = h('div', 'w-sub', next ? `Next: ${fmtDay(next.start)} ${fmtTime(next.start)}–${fmtTime(next.end)}` : 'No more shifts planned');
    foot.style.marginTop = 'auto';
    body.replaceChildren(top, bars, labels, foot);
  }

  DASH.onCalendar(guard((detail) => { calendar = detail; render(); }));
  window.addEventListener('dash:data-token', guard(loadWage));
  DASH.every(60 * 60 * 1000, guard(loadWage));
  loadWage();
});
