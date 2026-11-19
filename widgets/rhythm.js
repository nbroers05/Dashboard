'use strict';

// rhythm.exe (Planner v2, since 1.12.0): sleep rhythm, gym and screen time of this week. Nothing to fill in.
// - Last phone use per night against 23:00, and phone screen time: from the phone app, which will fill the row `_phone.rhythm`
//   in the dashboard's Supabase (dashboard_settings) in its own round: { at, lastUse: { 'YYYY-MM-DD': 'HH:MM' } (the night that
//   starts that evening; after midnight is just '00:40'), screenPhone: { 'YYYY-MM-DD': minutes } }. Until it is there those
//   parts say "comes with the app".
// - Gym x of 4: from day.exe (DASH_GYM).
// - Pc screen time: computer.pc_active_min in the private archive (via DASH_DATA, same as the Data page).
DASH.widget('w-rhythm', (card, body, guard) => {
  const { h, startOfDay, addDays, startOfWeek } = DASH;
  const GOAL_MIN = 23 * 60;
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hm = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}`;

  let app = null, pc = null;   // app = _phone.rhythm, pc = { day: minutes }

  function demo() {
    const ws = startOfWeek(Date.now());
    const lastUse = {};
    ['23:20', '00:40', '23:05', '01:10', '23:50'].forEach((t, i) => { if (addDays(ws, i) < startOfDay(Date.now())) lastUse[iso(addDays(ws, i))] = t; });
    return { app: { at: Date.now(), lastUse, screenPhone: { [iso(Date.now())]: 192 } }, pc: { [iso(Date.now())]: 280 } };
  }

  async function load() {
    if (DASH.DEMO) { ({ app, pc } = demo()); return render(); }
    try { if (window.DASH_SB && DASH_SB.linked()) app = await DASH_SB.flag('_phone.rhythm'); } catch (e) { console.warn('[rhythm]', e); }
    try {
      const D = window.DASH_DATA;
      if (D && D.token()) {
        const f = await D.read('data/aggregates/computer.json').catch(() => null);
        if (f) pc = (JSON.parse(f.text).daily || {}).pc_active_min || null;
      }
    } catch (e) { console.warn('[rhythm]', e); }
    render();
  }

  // Minutes after 23:00 for a time like '23:35' or '01:40' (before 12:00 counts as after midnight)
  const late = (t) => { const [hh, mm] = t.split(':').map(Number); const m = hh * 60 + mm; return (m < 12 * 60 ? m + 24 * 60 : m) - GOAL_MIN; };

  function render() {
    const now = Date.now(), ws = startOfWeek(now), today = iso(now);
    const parts = [];

    // Last phone use
    parts.push(h('p', 'rh-head', 'Last phone use (goal 23:00)'));
    const nights = app && app.lastUse;
    if (nights && Object.keys(nights).length) {
      const row = h('div', 'rh-nights');
      for (let i = 0; i < 7; i++) {
        const day = addDays(ws, i), key = iso(day), t = nights[key];
        const col = h('div', 'rh-night');
        const bar = h('i', t && late(t) > 0 ? 'late' : 'ok');
        const mins = t ? Math.max(0, Math.min(180, late(t))) : 0;
        bar.style.height = t ? `${Math.max(6, (mins / 180) * 100)}%` : '0';
        const lab = h('span', 'rh-val', t ? (late(t) > 0 ? hm(late(t)).replace('h ', ':') : '✓') : '');
        lab.title = t ? `Phone away at ${t}` : '';
        const barBox = h('div', 'rh-bar');
        barBox.append(bar);
        col.append(barBox, lab, h('span', 'rh-day', new Date(day).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3)));
        row.append(col);
      }
      parts.push(row);
    } else parts.push(h('p', 'w-note', 'Comes with the app'));

    // Gym
    const g = window.DASH_GYM ? DASH_GYM.week() : { done: 0, planned: 0 }, goal = window.DASH_GYM ? DASH_GYM.goal : 4;
    const gym = h('div', 'rh-row');
    gym.append(h('span', 'rh-label', 'Gym'), h('b', null, `${g.done} of ${goal}`));
    const pips = h('span', 'rh-pips');
    for (let i = 0; i < goal; i++) pips.append(h('i', i < g.done ? 'on' : i < g.done + g.planned ? 'plan' : ''));
    gym.append(pips);
    parts.push(gym);

    // Screen time today
    const phoneMin = app && app.screenPhone && app.screenPhone[today];
    const pcKeys = pc ? Object.keys(pc).sort() : [];
    const pcDay = pcKeys.length ? pcKeys[pcKeys.length - 1] : null;
    const pcMin = pcDay ? Number(pc[pcDay]) : null;
    const scr = h('div', 'rh-row rh-screen');
    scr.append(h('span', 'rh-label', 'Screen time today'));
    scr.append(h('span', null, `phone ${phoneMin != null ? hm(phoneMin) : 'comes with the app'} · pc ${pcMin != null ? `${hm(pcMin)}${pcDay !== today ? ` (${new Date(`${pcDay}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' })})` : ''}` : 'no data yet'}`));
    parts.push(scr);

    parts.push(h('p', 'w-sub rh-foot', 'All measured by the app and the archive. Nothing to fill in.'));
    body.replaceChildren(...parts);
  }

  window.addEventListener('dash:gym', guard(render));
  window.addEventListener('dash:data-token', guard(load));
  DASH.every(10 * 60 * 1000, guard(load));
  render();
  load();
});
