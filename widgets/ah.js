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
  const euro = (v, d = 0) => v.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- Loon (alle getallen uit config.ahLoon) ----------
  const CFG = (() => {
    const c = window.DASHBOARD_CONFIG || {};
    const l = c.ahLoon || {};
    return {
      wage: Number(l.brutoUurloon ?? c.ahUurloon) || 0,
      rules: (l.toeslagen || []).filter((r) => r && r.procent != null && r.van && r.tot).map((r) => ({
        ...r, from: toMin(r.van), to: toMin(r.tot), days: new Set(r.dagen || []),
      })),
      open: (l.toeslagen || []).filter((r) => r && (r.procent == null || !r.van || !r.tot)).map((r) => r.naam),
      stack: l.meerdereToeslagen === 'optellen',
      holidays: new Set(l.feestdagen || []),
      breaks: (l.pauzes || []).filter((p) => p && p.langerDanUren != null && p.minuten != null).sort((a, b) => b.langerDanUren - a.langerDanUren),
      holidayPct: l.vakantiegeldProcent,
      holidayInPeriod: l.vakantiegeldPerPeriode === true,
      profitPct: l.winstuitkeringProcent,
      extraHours: (l.uitbetaaldeUren || []).filter((x) => x && x.procent != null),
      fixed: (l.vasteToeslagen || []).filter((f) => f && f.bedrag != null),
      ratio: l.nettoVerhouding,
    };
  })();
  function toMin(hhmm) { const [hh, mm] = String(hhmm).split(':').map(Number); return hh * 60 + (mm || 0); }

  // Nederlandse feestdagen (Pasen via de Gregoriaanse rekenregel)
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
      nieuwjaar: new Date(y, 0, 1), pasen1: easter, pasen2: plus(1), koningsdag: king, bevrijdingsdag: new Date(y, 4, 5),
      hemelvaart: plus(39), pinksteren1: plus(49), pinksteren2: plus(50), kerst1: new Date(y, 11, 25), kerst2: new Date(y, 11, 26),
    };
    const map = {};
    for (const [name, dt] of Object.entries(all)) if (CFG.holidays.has(name)) map[dt.toDateString()] = name;
    return (holidayCache[y] = map);
  }
  const WEEKDAY = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

  // Bruto voor (het deel binnen [from, to) van) één dienst: per minuut het tarief met de toeslag die dan geldt
  function shiftPay(s, from = -Infinity, to = Infinity) {
    const a = Math.max(s.start, from), b = Math.min(s.end, to);
    const out = { min: 0, paidMin: 0, gross: 0, parts: {} };
    if (b <= a) return out;
    let raw = 0;
    for (let t = a; t < b; t += 60000) {
      const d = new Date(t);
      const minute = d.getHours() * 60 + d.getMinutes();
      const holiday = holidaysOf(d.getFullYear())[d.toDateString()];
      const hits = CFG.rules.filter((r) => (r.days.has(WEEKDAY[d.getDay()]) || (holiday && r.days.has('feestdag'))) && minute >= r.from && minute < r.to);
      let pct = 0, name = 'Basis';
      if (hits.length) {
        const top = hits.reduce((x, y) => (y.procent > x.procent ? y : x));
        pct = CFG.stack ? hits.reduce((sum, r) => sum + r.procent, 0) : top.procent;
        name = CFG.stack ? hits.map((r) => r.naam).join(' + ') : top.naam;
      }
      raw += (CFG.wage / 60) * (1 + pct / 100);
      out.parts[name] = (out.parts[name] || 0) + 1;
      out.min++;
    }
    // Onbetaalde pauze (op basis van de hele dienst), naar verhouding over de tijdvakken
    const full = (s.end - s.start) / 3600000;
    const rule = CFG.breaks.find((p) => full > p.langerDanUren);
    const share = out.min / ((s.end - s.start) / 60000);
    const unpaid = rule ? Math.min(out.min, rule.minuten * share) : 0;
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
  // Periode: uren met toeslagen + vaste bedragen; netto alleen als schatting met de verhouding uit de config
  function periodPay(shifts, range) {
    const p = pay(shifts, range.start, range.end);
    const fixed = CFG.fixed.reduce((t, f) => t + Number(f.bedrag), 0);
    // Uren die elke periode worden uitbetaald (ADV, vakantie-uren), als % van al je uren inclusief toeslaguren
    // (op de loonstrook: gewerkt + toeslaguren + TVT). Toeslaguren = toeslag omgerekend naar uren, dus bruto ÷ uurloon.
    const allHours = CFG.wage > 0 ? p.gross / CFG.wage : 0;
    const extras = CFG.extraHours.map((x) => ({ naam: x.naam, hours: allHours * (x.procent / 100), pay: allHours * (x.procent / 100) * CFG.wage }));
    const extra = extras.reduce((t, x) => t + x.pay, 0);
    // Vakantietoeslag en winstuitkering: % over alle uurposten samen
    const base = p.gross + extra;
    const holidayPay = CFG.holidayPct != null ? base * (CFG.holidayPct / 100) : null;
    const profit = CFG.profitPct != null ? base * (CFG.profitPct / 100) : null;
    const gross = base + fixed + (CFG.holidayInPeriod && holidayPay ? holidayPay : 0) + (profit || 0);
    return { ...p, fixed, extras, holidayPay, profit, gross, net: CFG.ratio != null ? gross * CFG.ratio : null };
  }

  // Wat er nog in config.js moet (getallen van je loonstrook)
  function missing() {
    const m = [];
    if (!(CFG.wage > 0)) m.push('bruto uurloon');
    for (const n of CFG.open) m.push(`toeslag ${n.toLowerCase()}`);
    if (CFG.holidayPct == null) m.push('vakantiegeld %');
    if (CFG.ratio == null) m.push('netto/bruto-verhouding');
    return m;
  }

  // ---------- Pop-up met de berekening ----------
  let panel = null;
  let lastView = null;
  function openDetails() {
    if (!lastView || !lastView.per || !(CFG.wage > 0)) return;
    const { shifts, week, range } = lastView;
    if (!panel) panel = DASH.panel('Loonberekening AH', 'var(--ah, var(--c-ah))');
    panel.dialog.classList.add('ah-dialog');
    const p = periodPay(shifts, range);
    const wkPay = pay(shifts, week, addDays(week, 7));
    const short = (ms) => new Date(ms).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    const inner = h('div', 'ahp');

    const sum = h('div', 'ahp-sum');
    const cell = (label, value, sub) => { const d = h('div'); d.append(h('span', 'w-label', label), h('b', null, value)); if (sub) d.append(h('span', 'w-sub', sub)); return d; };
    sum.append(
      cell('Deze week', euro(wkPay.gross, 2), `${fmtH(wkPay.hours)} u betaald`),
      cell('Periode bruto', euro(p.gross, 2), `${fmtH(p.hours)} u gewerkt${p.extras.length || p.fixed || CFG.holidayInPeriod ? ' + extra’s, zie hieronder' : ''}`),
      cell('Netto (schatting)', p.net != null ? euro(p.net, 2) : '–', p.net != null ? `× ${nl(CFG.ratio, 2)} uit config` : 'vul nettoVerhouding in'),
    );
    inner.append(sum);

    const table = h('div', 'ahp-table');
    const head = h('div', 'ahp-row ahp-head');
    head.append(h('span', null, 'Dienst'), h('span', null, 'Uren'), h('span', null, 'Toeslagen'), h('span', null, 'Bruto'));
    table.append(head);
    for (const x of p.shifts) {
      const row = h('div', `ahp-row${x.s.end > Date.now() ? ' planned' : ''}`);
      const parts = Object.entries(x.parts).filter(([k]) => k !== 'Basis').map(([k, v]) => `${k} ${fmtH(v / 60)} u`).join(', ') || '–';
      row.append(
        h('span', null, `${short(x.s.start)} ${fmtTime(x.s.start)}–${fmtTime(x.s.end)}`),
        h('span', null, `${fmtH(x.paidMin / 60)}`),
        h('span', 'w-sub', parts),
        h('b', null, euro(x.gross, 2)),
      );
      table.append(row);
    }
    if (!p.shifts.length) table.append(h('p', 'w-note', 'Geen diensten in deze periode.'));
    inner.append(h('h3', 'ahp-title', `Periode ${short(range.start)} – ${short(addDays(range.end, -1))}`), table);

    const extra = h('ul', 'ahp-extra');
    for (const x of p.extras) extra.append(h('li', null, `${x.naam} uitbetaald: ${fmtH(Math.round(x.hours * 100) / 100)} u = ${euro(x.pay, 2)}`));
    for (const f of CFG.fixed) extra.append(h('li', null, `${f.naam}: ${euro(Number(f.bedrag), 2)}`));
    if (p.holidayPay != null) {
      extra.append(h('li', null, CFG.holidayInPeriod
        ? `Vakantietoeslag ${nl(CFG.holidayPct, CFG.holidayPct % 1 ? 2 : 0)}%: ${euro(p.holidayPay, 2)} (zit in het periodebedrag)`
        : `Vakantiegeld-opbouw deze periode: ${euro(p.holidayPay, 2)} (${nl(CFG.holidayPct, 2)}%, wordt later uitbetaald, niet in het bedrag hierboven)`));
    }
    if (p.profit != null) extra.append(h('li', null, `Winstuitkering (WUK) ${nl(CFG.profitPct, 2)}%: ${euro(p.profit, 2)} (zit in het periodebedrag)`));
    extra.append(h('li', null, `Uurloon ${euro(CFG.wage, 2)} · ${CFG.rules.length ? CFG.rules.map((r) => `${r.naam} +${nl(r.procent, r.procent % 1 ? 1 : 0)}% (${r.van}–${r.tot})`).join(', ') : 'nog geen toeslagen ingevuld'} · bij overlap ${CFG.stack ? 'opgeteld' : 'de hoogste'}`));
    if (CFG.breaks.length) extra.append(h('li', null, `Onbetaalde pauze: ${CFG.breaks.map((b) => `${b.minuten} min bij meer dan ${nl(b.langerDanUren, 1)} u`).join(', ')}`));
    const miss = missing();
    if (miss.length) extra.append(h('li', 'ahp-miss', `Nog niet ingevuld in config.js: ${miss.join(', ')}. Tot die er staan, tellen ze niet mee.`));
    inner.append(extra, h('p', 'w-note', 'Grijze regels zijn ingepland (nog niet gewerkt). Dit is een berekening op basis van je agenda, geen loonstrook.'));
    panel.body.replaceChildren(inner);
    panel.open();
  }
  card.classList.add('clickable');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'AH-uren, klik voor de loonberekening');
  card.addEventListener('click', (e) => { if (!card.closest('.editing')) openDetails(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(); } });

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
      body.replaceChildren(DASH.problem('Koppel je Google Agenda om je uren te tellen.', 'Agenda koppelen', DASH.connectGoogle));
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
    // Verwacht salaris: alle diensten in de periode (gewerkt + ingepland), met toeslag per tijdvak
    const wkPay = pay(shifts, week, addDays(week, 7));
    if (CFG.wage > 0 && wkPay.gross > 0) left.append(h('div', 'w-sub ah-wk-pay', `≈ ${euro(wkPay.gross)} bruto`));
    if (per) {
      const box = h('div', 'ah-pay');
      if (CFG.wage > 0) {
        const p = periodPay(shifts, range);
        box.append(h('b', null, euro(p.gross)));
        box.append(h('div', 'w-sub', `bruto · ${per.exact ? '' : '± '}${fmtDay(per.payday)}`));
        if (p.net != null) box.append(h('div', 'w-sub ah-net', `netto ≈ ${euro(p.net)} (schatting)`));
      } else {
        box.append(h('div', 'w-sub', `Salaris ${per.exact ? '' : '± '}${fmtDay(per.payday)}`), h('div', 'w-sub', 'uurloon in config.js voor €'));
      }
      right.append(box);
    }
    top.append(left, right);
    lastView = { shifts, week, range, per };

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
