'use strict';

// Gezondheid: stappen, slaap en hartslag via de Google Health API (opvolger van Google Fit).
// Route: Samsung Health → Health Connect → Google Health-app → Google-cloud → hier. Zelfde Google-inlog als agenda en mail, alleen lezen.
DASH.widget('w-health', (card, body, guard) => {
  const { h, fmtTime, startOfDay, addDays, DEMO } = DASH;
  const API = 'https://health.googleapis.com/v4/users/me/dataTypes';
  const G = window.DASH_GOOGLE;
  // Dagdoel: eigen keuze (klik op "doel …" in het vak, bewaard in health.goal), anders config, anders 10.000
  const DEF_GOAL = Number(((window.DASHBOARD_CONFIG || {}).gezondheid || {}).stappenDoel) || 10000;
  const goal = () => Number(DASH.store.get('health.goal')) || DEF_GOAL;
  const DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

  // ---------- Ophalen ----------
  async function call(path, init) {
    const token = G && G.healthToken();
    if (!token) throw Object.assign(new Error('geen token'), { auth: true });
    const res = await fetch(`${API}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init && init.headers) } });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error('verlopen'), { auth: true });
    if (!res.ok) {
      // Volledige melding, inclusief eventuele details (welke scope, welke reden), zodat je hem kunt doorsturen
      const err = json.error || {};
      const extra = (err.details || []).map((d) => d.reason || (d.metadata && Object.values(d.metadata).join(', ')) || '').filter(Boolean).join('; ');
      throw Object.assign(new Error(`${err.status ? `${err.status}: ` : ''}${err.message || `HTTP ${res.status}`}${extra ? ` (${extra})` : ''}`), { status: res.status });
    }
    return json;
  }

  const civil = (ms, end) => {
    const d = new Date(ms);
    return { date: { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }, time: end ? { hours: 23, minutes: 59, seconds: 59 } : { hours: 0, minutes: 0, seconds: 0 } };
  };
  const fromCivil = (c) => new Date(c.date.year, c.date.month - 1, c.date.day).getTime();
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  async function fetchAll() {
    const today = startOfDay(Date.now());
    // Losse delen mogen mislukken (bijv. nog geen hartslag): dan ontbreekt alleen dat stukje
    const [steps, sleep, hr, rest] = await Promise.allSettled([
      call('steps/dataPoints:dailyRollUp', { method: 'POST', body: JSON.stringify({ range: { start: civil(addDays(today, -6)), end: civil(today, true) }, windowSizeDays: 1 }) }),
      call(`sleep/dataPoints?${new URLSearchParams({ pageSize: 5, filter: `sleep.interval.civil_end_time >= "${iso(addDays(today, -1))}"` })}`),
      call(`heart-rate/dataPoints?${new URLSearchParams({ pageSize: 1 })}`),
      call(`daily-resting-heart-rate/dataPoints?${new URLSearchParams({ pageSize: 7 })}`),
    ]);
    // Alles mislukt met dezelfde fout (bijv. API staat uit): die fout tonen
    const all = [steps, sleep, hr, rest];
    if (all.every((r) => r.status === 'rejected')) throw all[0].reason;

    const out = { steps: [], sleep: null, hr: null, rest: null };
    if (steps.status === 'fulfilled') {
      out.steps = (steps.value.rollupDataPoints || []).map((p) => ({ day: fromCivil(p.civilStartTime), count: p.steps && p.steps.countSum != null ? Number(p.steps.countSum) : null }));
    }
    if (sleep.status === 'fulfilled') {
      const s = (sleep.value.dataPoints || []).map((p) => p.sleep).filter(Boolean)
        .sort((a, b) => Date.parse(b.interval.endTime) - Date.parse(a.interval.endTime))[0];
      if (s) {
        const sum = s.summary || {};
        out.sleep = {
          start: Date.parse(s.interval.startTime), end: Date.parse(s.interval.endTime),
          asleep: sum.minutesAsleep != null ? Number(sum.minutesAsleep) : null,
          stages: (sum.stagesSummary || []).map((x) => ({ type: x.type, minutes: Number(x.minutes) || 0 })),
        };
      }
    }
    if (hr.status === 'fulfilled') {
      const p = (hr.value.dataPoints || [])[0];
      if (p && p.heartRate) out.hr = { bpm: Number(p.heartRate.beatsPerMinute), at: Date.parse(p.heartRate.sampleTime && p.heartRate.sampleTime.physicalTime) };
    }
    if (rest.status === 'fulfilled') {
      const p = (rest.value.dataPoints || []).map((x) => x.dailyRestingHeartRate).filter(Boolean)
        .sort((a, b) => (b.date.year - a.date.year) || (b.date.month - a.date.month) || (b.date.day - a.date.day))[0];
      if (p) out.rest = { bpm: Number(p.beatsPerMinute), day: new Date(p.date.year, p.date.month - 1, p.date.day).getTime() };
    }
    return out;
  }

  function demo() {
    const today = startOfDay(Date.now());
    const counts = [8412, 11230, 6120, 9876, 12890, 4310, 6234];
    const end = today + 7.2 * 3600000;
    return {
      steps: counts.map((c, i) => ({ day: addDays(today, i - 6), count: c })),
      sleep: { start: end - 7.6 * 3600000, end, asleep: 412, stages: [{ type: 'LIGHT', minutes: 228 }, { type: 'DEEP', minutes: 74 }, { type: 'REM', minutes: 110 }, { type: 'AWAKE', minutes: 44 }] },
      hr: { bpm: 72, at: Date.now() - 12 * 60000 },
      rest: { bpm: 58, day: today },
    };
  }

  // ---------- Tonen ----------
  const STAGE = { DEEP: ['Diep', '#5b6cff'], LIGHT: ['Licht', '#8fb4ff'], REM: ['REM', '#c58bff'], AWAKE: ['Wakker', '#ff9e7a'], ASLEEP: ['Slaap', '#8fb4ff'], RESTLESS: ['Onrustig', '#ffc27a'] };
  const dur = (min) => `${Math.floor(min / 60)}u ${String(Math.round(min % 60)).padStart(2, '0')}m`;

  let last = null;
  function render(d) {
    last = d;
    // Voor de telefoon (phone.js): stappen vandaag en laatste slaap
    window.DASH_HEALTH = d;
    window.dispatchEvent(new CustomEvent('dash:health'));
    const GOAL = goal();
    const today = startOfDay(Date.now());
    const todaySteps = (d.steps.find((x) => x.day === today) || {}).count;
    const asleep = d.sleep ? (d.sleep.asleep != null ? d.sleep.asleep : (d.sleep.end - d.sleep.start) / 60000) : null;

    // Ring = % van het dagdoel (SVG, ronde kop); stappen en slaap ernaast
    const stepsBox = h('div', 'hl-steps');
    const p = Math.min(1, (todaySteps || 0) / GOAL);
    const ring = h('div', 'hl-ring');
    ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="hl-ring-bg"/>${p > 0 ? `<circle cx="50" cy="50" r="42" class="hl-ring-fg" pathLength="100" stroke-dasharray="${(p * 100).toFixed(1)} 100"/>` : ''}</svg>`;
    ring.append(h('span', 'hl-num', todaySteps != null ? `${Math.round(((todaySteps || 0) / GOAL) * 100)}%` : '–'));
    ring.title = `${Math.round(p * 100)}% van je dagdoel`;

    const side = h('div', 'hl-side');
    const stepsCell = h('div', 'hl-stat');
    const goalBtn = h('button', 'hl-goal', `doel ${GOAL.toLocaleString('nl-NL')}`);
    goalBtn.type = 'button';
    goalBtn.title = 'Dagdoel wijzigen';
    goalBtn.onclick = () => editGoal(goalBtn);
    const stepsSub = h('span', 'w-sub', 'stappen · ');
    stepsSub.append(goalBtn);
    stepsCell.append(h('b', 'hl-num', todaySteps != null ? todaySteps.toLocaleString('nl-NL') : '–'), stepsSub);
    const sleepCell = h('div', 'hl-stat');
    sleepCell.append(h('b', 'hl-num', asleep != null ? `${Math.floor(asleep / 60)}u ${String(Math.round(asleep % 60)).padStart(2, '0')}` : '–'),
      h('span', 'w-sub', d.sleep ? `slaap · ${fmtTime(d.sleep.start)}–${fmtTime(d.sleep.end)}` : 'slaap · niets gevonden'));
    side.append(stepsCell, sleepCell);
    stepsBox.append(ring, side);

    const bars = h('div', 'hl-bars');
    const max = Math.max(GOAL, ...d.steps.map((x) => x.count || 0));
    for (let i = 6; i >= 0; i--) {
      const day = addDays(today, -i);
      const x = d.steps.find((s) => s.day === day) || {};
      const col = h('div', `hl-bar${day === today ? ' today' : ''}${(x.count || 0) >= GOAL ? ' goal' : ''}`);
      const fill = h('i');
      fill.style.height = `${Math.max(3, ((x.count || 0) / max) * 100)}%`;
      col.title = `${DAYS[new Date(day).getDay()]}: ${x.count != null ? x.count.toLocaleString('nl-NL') : 'geen data'} stappen`;
      col.append(fill, h('span', null, DAYS[new Date(day).getDay()]));
      bars.append(col);
    }

    // Slaap en hartslag
    const row = h('div', 'hl-row');
    const sleepBox = h('div', 'hl-cell');
    sleepBox.append(h('span', 'w-label', '😴 Slaapfases'));
    const total = d.sleep ? d.sleep.stages.reduce((t, s) => t + s.minutes, 0) : 0;
    if (total) {
      const st = h('div', 'hl-stages');
      const legend = h('span', 'w-sub');
      for (const s of d.sleep.stages) {
        const [name, color] = STAGE[s.type] || [s.type, '#888'];
        const seg = h('i');
        seg.style.flex = String(s.minutes);
        seg.style.background = color;
        seg.title = `${name}: ${dur(s.minutes)}`;
        st.append(seg);
      }
      const deep = d.sleep.stages.find((s) => s.type === 'DEEP');
      legend.textContent = deep ? `diep ${dur(deep.minutes)}` : `${d.sleep.stages.length} fases`;
      sleepBox.append(st, legend);
    } else sleepBox.append(h('span', 'w-sub', d.sleep ? 'geen fases' : '–'));

    const hrBox = h('div', 'hl-cell');
    hrBox.append(h('span', 'w-label', '❤️ Hartslag'));
    if (d.rest) hrBox.append(h('b', null, `${d.rest.bpm} bpm`), h('span', 'w-sub', d.rest.day === today ? 'rust, vandaag' : `rust, ${new Date(d.rest.day).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' })}`));
    else hrBox.append(h('b', null, '–'));
    if (d.hr && d.hr.bpm) hrBox.append(h('span', 'w-sub', `laatste ${d.hr.bpm} bpm${d.hr.at ? ` om ${fmtTime(d.hr.at)}` : ''}`));
    row.append(sleepBox, hrBox);

    body.replaceChildren(stepsBox, bars, row);
  }

  // Doel aanpassen in het vak zelf: knopje wordt een getalveld (Enter/klik ernaast = opslaan, Esc = laten)
  function editGoal(btn) {
    const input = h('input', 'hl-goal-in');
    input.type = 'number';
    input.min = 1000;
    input.max = 50000;
    input.step = 500;
    input.value = goal();
    input.setAttribute('aria-label', 'Dagdoel stappen');
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const v = Math.round(Number(input.value));
      if (ok && v >= 500 && v <= 100000) DASH.store.set('health.goal', v);
      if (last) render(last);
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    input.onblur = () => finish(true);
    btn.replaceWith(input);
    input.focus();
    input.select();
  }

  function message(text, button, onClick) {
    const box = h('div', 'w-empty');
    box.append(h('p', null, text));
    if (button) {
      const b = h('button', 'w-btn', button);
      b.type = 'button';
      b.onclick = onClick;
      box.append(b);
    }
    body.replaceChildren(box);
  }

  const load = guard(async () => {
    if (DEMO) return render(demo());
    if (G && G.refresh) await G.refresh();
    if (!G || !G.connected()) return message('Koppel eerst je Google Agenda (onderaan). Daarna kan gezondheid erbij.');
    if (!G.healthToken()) {
      return G.healthEverGranted()
        ? message('Toegang tot je gezondheidsgegevens is verlopen (Google geeft een website maar 1 uur).', 'Vernieuwen', () => G.connectHealth())
        : message('Geef het dashboard leesrechten voor je stappen, slaap en hartslag.', 'Gezondheid koppelen', () => G.connectHealth());
    }
    try {
      render(await fetchAll());
    } catch (e) {
      if (e.auth) return message('Toegang tot je gezondheidsgegevens is verlopen.', 'Vernieuwen', () => G.connectHealth());
      // Fout van Google zelf laten zien: helpt bij het instellen (API uit, app niet gekoppeld, ...)
      message(`Google Health gaf een fout: ${e.message} (README, stap 10)`, 'Opnieuw koppelen', () => G.connectHealth());
      console.warn('[health]', e);
    }
  });

  window.addEventListener('dash:google', load);
  DASH.every(10 * 60 * 1000, load);
  load();
});
