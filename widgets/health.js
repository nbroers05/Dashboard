'use strict';

// Health: steps via the Google Health API (successor of Google Fit). Sleep and heart rate gone since 0.59.0 (they aren't measured).
// Route: Samsung Health → Health Connect → Google Health app → Google cloud → here. The same Google login as agenda and mail, read-only.
DASH.widget('w-health', (card, body, guard) => {
  const { h, fmtTime, startOfDay, addDays, DEMO } = DASH;
  const API = 'https://health.googleapis.com/v4/users/me/dataTypes';
  const G = window.DASH_GOOGLE;
  // Daily goal: own choice (click "goal …" in the tile, saved in health.goal), otherwise config, otherwise 10,000
  const DEF_GOAL = Number(((window.DASHBOARD_CONFIG || {}).health || {}).stepGoal) || 10000;
  const goal = () => Number(DASH.store.get('health.goal')) || DEF_GOAL;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- Ophalen ----------
  async function call(path, init) {
    const token = G && G.healthToken();
    if (!token) throw Object.assign(new Error('no token'), { auth: true });
    const res = await fetch(`${API}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init && init.headers) } });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error('verlopen'), { auth: true });
    if (!res.ok) {
      // The full message, including any details (which scope, which reason), so you can pass it on
      const err = json.error || {};
      const extra = (err.details || []).map((d) => d.reason || (d.metadata && Object.values(d.metadata).join(', ')) || '').filter(Boolean).join('; ');
      throw Object.assign(new Error(`${err.status ? `${err.status}: ` : ''}${err.message || `HTTP ${res.status}`}${extra ? ` (${extra})` : ''}`), { status: res.status });
    }
    return json;
  }

  const fromCivil = (c) => new Date(c.date.year, c.date.month - 1, c.date.day).getTime();
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // Steps per day, counted per source; the highest source counts (since 0.52.2). Not dailyRollUp: since 28 Oct 2026 the
  // same steps come in via three sources (Google Health app/Fitbit "MobileTrack", Samsung Health and the phone sensor
  // via Health Connect) and Google's sum partly counted them twice (30 Oct: 24,494 instead of 13,701).
  // The same rule as scripts/collectors/health.py in the archive. ~250 points per day, so 2 pages for 7 days.
  async function stepsPerDay(from, to) {
    const per = new Map();   // day -> Map(source -> steps)
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

  // Steps only (since 0.59.0): sleep and heart rate aren't measured (the API always returned them empty), so removed.
  async function fetchAll() {
    const today = startOfDay(Date.now());
    return { steps: await stepsPerDay(addDays(today, -6), today), sleep: null };
  }

  function demo() {
    const today = startOfDay(Date.now());
    const counts = [8412, 11230, 6120, 9876, 12890, 4310, 6234];
    return { steps: counts.map((c, i) => ({ day: addDays(today, i - 6), count: c })), sleep: null };
  }

  // ---------- Showing ----------

  let last = null;
  // Daily goal from another device arrived (sync.js, since 1.1.0)
  window.addEventListener('dash:synced', (e) => { if (e.detail.key === 'health.goal' && last) render(last); });
  function render(d) {
    last = d;
    // For the phone (phone.js): steps today and last sleep
    window.DASH_HEALTH = d;
    window.dispatchEvent(new CustomEvent('dash:health'));
    const GOAL = goal();
    const today = startOfDay(Date.now());
    const todaySteps = (d.steps.find((x) => x.day === today) || {}).count;

    // Ring = % of the daily goal (SVG, round cap); steps next to it
    const stepsBox = h('div', 'hl-steps');
    const p = Math.min(1, (todaySteps || 0) / GOAL);
    const ring = h('div', 'hl-ring');
    ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="hl-ring-bg"/>${p > 0 ? `<circle cx="50" cy="50" r="42" class="hl-ring-fg" pathLength="100" stroke-dasharray="${(p * 100).toFixed(1)} 100"/>` : ''}</svg>`;
    ring.append(h('span', 'hl-num', todaySteps != null ? `${Math.round(((todaySteps || 0) / GOAL) * 100)}%` : '–'));
    ring.title = `${Math.round(p * 100)}% of your daily goal`;

    const side = h('div', 'hl-side');
    const stepsCell = h('div', 'hl-stat');
    const goalBtn = h('button', 'hl-goal', `goal ${GOAL.toLocaleString('en-GB')}`);
    goalBtn.type = 'button';
    goalBtn.title = 'Change the daily goal';
    goalBtn.onclick = () => editGoal(goalBtn);
    const stepsSub = h('span', 'w-sub', 'steps · ');
    stepsSub.append(goalBtn);
    stepsCell.append(h('b', 'hl-num', todaySteps != null ? todaySteps.toLocaleString('en-GB') : '–'), stepsSub);
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
      col.title = `${DAYS[new Date(day).getDay()]}: ${x.count != null ? x.count.toLocaleString('en-GB') : 'no data'} steps`;
      col.append(fill, h('span', null, DAYS[new Date(day).getDay()]));
      bars.append(col);
    }

    body.replaceChildren(stepsBox, bars);
  }

  // Change the goal in the tile itself: the button becomes a number field (Enter/click next to it = save, Esc = leave it)
  function editGoal(btn) {
    const input = h('input', 'hl-goal-in');
    input.type = 'number';
    input.min = 1000;
    input.max = 50000;
    input.step = 500;
    input.value = goal();
    input.setAttribute('aria-label', 'Daily step goal');
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
    if (!G || !G.connected()) return message('Link your Google Calendar first (at the bottom). After that health can be added.');
    if (!G.healthToken()) {
      return G.healthEverGranted()
        ? message('Access to your health data has expired (Google gives a website only 1 hour).', 'Refresh', () => G.connectHealth())
        : message('Give the dashboard read access to your steps.', 'Link health', () => G.connectHealth());
    }
    try {
      render(await fetchAll());
    } catch (e) {
      if (e.auth) return message('Access to your health data has expired.', 'Refresh', () => G.connectHealth());
      // Show Google's own error: helps with setting up (API off, app not linked, ...)
      message(`Google Health returned an error: ${e.message} (README, step 9)`, 'Link again', () => G.connectHealth());
      console.warn('[health]', e);
    }
  });

  window.addEventListener('dash:google', load);
  DASH.every(10 * 60 * 1000, load);
  load();
});
