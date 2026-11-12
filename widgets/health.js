'use strict';

// Gezondheid: stappen via de Google Health API (opvolger van Google Fit). Slaap en hartslag sinds 0.59.0 weg (worden niet gemeten).
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

  const fromCivil = (c) => new Date(c.date.year, c.date.month - 1, c.date.day).getTime();
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // Stappen per dag, per bron geteld; de hoogste bron telt (sinds 0.52.2). Niet dailyRollUp: sinds 28 okt 2026 komen
  // dezelfde stappen via drie bronnen binnen (Google Health-app/Fitbit "MobileTrack", Samsung Health en de telefoonsensor
  // via Health Connect) en Google's optelsom telde die deels dubbel (30 okt: 24.494 in plaats van 13.701).
  // Zelfde regel als scripts/collectors/health.py in het archief. ~250 punten per dag, dus 2 pagina's voor 7 dagen.
  async function stepsPerDay(from, to) {
    const per = new Map();   // dag -> Map(bron -> stappen)
    let pageToken = null;
    for (let i = 0; i < 10; i++) {
      const q = { pageSize: 1000, filter: `steps.interval.civil_start_time >= "${iso(from)}" AND steps.interval.civil_start_time < "${iso(addDays(to, 1))}"` };
      if (pageToken) q.pageToken = pageToken;
      const r = await call(`steps/dataPoints?${new URLSearchParams(q)}`);
      for (const p of r.dataPoints || []) {
        const st = p.steps || {};
        const c = st.interval && st.interval.civilStartTime;
        if (!c) continue;
        const day = fromCivil(c);
        const ds = p.dataSource || {};
        const src = `${ds.platform}|${(ds.application && ds.application.packageName) || (ds.device && ds.device.displayName) || ''}`;
        if (!per.has(day)) per.set(day, new Map());
        const m = per.get(day);
        m.set(src, (m.get(src) || 0) + (Number(st.count) || 0));
      }
      pageToken = r.nextPageToken;
      if (!pageToken) break;
    }
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, count: per.has(d) ? Math.max(...per.get(d).values()) : null });
    return out;
  }

  // Alleen stappen (sinds 0.59.0): slaap en hartslag worden niet gemeten (de API gaf ze altijd leeg), dus weggehaald.
  async function fetchAll() {
    const today = startOfDay(Date.now());
    return { steps: await stepsPerDay(addDays(today, -6), today), sleep: null };
  }

  function demo() {
    const today = startOfDay(Date.now());
    const counts = [8412, 11230, 6120, 9876, 12890, 4310, 6234];
    return { steps: counts.map((c, i) => ({ day: addDays(today, i - 6), count: c })), sleep: null };
  }

  // ---------- Tonen ----------

  let last = null;
  // Dagdoel van een ander apparaat binnengekomen (sync.js, sinds 1.1.0)
  window.addEventListener('dash:synced', (e) => { if (e.detail.key === 'health.goal' && last) render(last); });
  function render(d) {
    last = d;
    // Voor de telefoon (phone.js): stappen vandaag en laatste slaap
    window.DASH_HEALTH = d;
    window.dispatchEvent(new CustomEvent('dash:health'));
    const GOAL = goal();
    const today = startOfDay(Date.now());
    const todaySteps = (d.steps.find((x) => x.day === today) || {}).count;

    // Ring = % van het dagdoel (SVG, ronde kop); stappen ernaast
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
    side.append(stepsCell);
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

    body.replaceChildren(stepsBox, bars);
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
        : message('Geef het dashboard leesrechten voor je stappen.', 'Gezondheid koppelen', () => G.connectHealth());
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
