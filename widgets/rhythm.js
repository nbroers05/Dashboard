'use strict';

// rhythm.exe (Planner v2 since 1.12.0; habits since 1.16.0): habits with streaks, gym, screen time and focus time of this week.
// - Habits (DASH_PLAN.habits, shared via sync.js: habits.list, habits.log): one row each with seven day squares (Monday..Sunday),
//   the streak (scheduled days done in a row) and a circle to tick today. "+ Add habit" or click a name: name + which days.
// - Gym x of 4: from day.exe (DASH_GYM), as squares.
// - "Phone away by 23:00": from the phone app, which fills the row `_phone.rhythm` in the dashboard's Supabase (dashboard_settings):
//   { at, lastUse: { 'YYYY-MM-DD': 'HH:MM' } (the night that starts that evening; after midnight is just '00:40'),
//   screenPhone: { 'YYYY-MM-DD': minutes } }. The row only shows once that data exists.
// - Screen time: phone today (the app), pc (computer.pc_active_min in the private archive via DASH_DATA), focus this week (focus.log).
DASH.widget('w-rhythm', (card, body, guard) => {
  const { h, startOfDay, addDays, startOfWeek } = DASH;
  const P = window.DASH_PLAN;
  const GOAL_MIN = 23 * 60;
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hm = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}`;
  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  let app = null, pc = null;   // app = _phone.rhythm, pc = { day: minutes }

  function demo() {
    const ws = startOfWeek(Date.now());
    const lastUse = {};
    ['23:20', '22:40', '23:05', '01:10', '22:50'].forEach((t, i) => { if (addDays(ws, i) < startOfDay(Date.now())) lastUse[iso(addDays(ws, i))] = t; });
    // Demo habits once, only in a local test copy (never on the real site, where they would sync)
    if (P && location.hostname === '127.0.0.1' && !localStorage.getItem('habits.list')) {
      P.habits.save([{ id: 'dw', name: 'Water 2 L', days: [] }, { id: 'dr', name: 'Read 20 min', days: [] }, { id: 'ds', name: 'Stretch', days: [0, 2, 4] }]);
      const lg = {};
      for (let i = 1; i < 30; i++) { const k = iso(addDays(startOfDay(Date.now()), -i)); lg[k] = ['dw', ...(i % 4 ? ['dr'] : []), ...([0, 2, 4].includes((new Date(addDays(Date.now(), -i)).getDay() + 6) % 7) ? ['ds'] : [])]; }
      localStorage.setItem('habits.log', JSON.stringify(lg));
    }
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

  // ---------- The habit window: name + days ----------
  const dlg = h('dialog', 'panel-dialog dx-pop rh-win');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  card.append(dlg);
  function openHabit(hb) {
    const f = h('form', 'dx-tf');
    const name = h('input');
    name.maxLength = 60;
    name.placeholder = 'Water 2 L, Read 20 min, Stretch…';
    name.value = hb ? hb.name : '';
    let days = hb ? [...(hb.days || [])] : [];
    const row = h('div', 'dx-dows');
    const every = h('button', 'tk-chip', 'Every day');
    every.type = 'button';
    every.onclick = () => { days = []; draw(); };
    const btns = (P ? P.SHORT : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((n, i) => {
      const b = h('button', 'dx-dow', n[0]);
      b.type = 'button';
      b.title = n;
      b.onclick = () => { const s = new Set(days); if (s.has(i)) s.delete(i); else s.add(i); days = s.size === 7 ? [] : [...s].sort(); draw(); };
      return b;
    });
    row.append(every, ...btns);
    const draw = () => { every.setAttribute('aria-pressed', String(!days.length)); btns.forEach((b, i) => b.setAttribute('aria-pressed', String(days.includes(i)))); };
    const err = h('p', 'dx-err');
    const foot = h('div', 'dx-d-foot dx-tfoot');
    if (hb) { const del = h('button', 'dx-btn dx-del', 'Delete'); del.type = 'button'; del.onclick = () => { P.habits.remove(hb.id); dlg.close(); }; foot.append(del); }
    const cancel = h('button', 'dx-btn', 'Cancel'), save = h('button', 'dx-btn dx-primary', 'Save');
    cancel.type = 'button';
    cancel.onclick = () => dlg.close();
    foot.append(h('span', 'dx-grow'), cancel, save);
    const lab = (t, el) => { const l = h('label'); l.append(h('span', null, t), el); return l; };
    f.append(h('b', 'dx-d-title', hb ? 'Habit' : 'New habit'), lab('Name', name), lab('Days', row), h('p', 'dx-hint', 'Tick it off in rhythm.exe each day. The streak counts the days in a row you did it (days off don\'t break it).'), err, foot);
    f.onsubmit = (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) { err.textContent = 'Give it a name.'; return; }
      if (hb) P.habits.update(hb.id, { name: n, days }); else P.habits.add(n, days);
      dlg.close();
    };
    dlg.replaceChildren(f);
    draw();
    dlg.showModal();
    name.focus();
  }

  // One habit row: name (+ small schedule), seven squares, streak, today
  function habitRow({ name, sub, marks, streak, today, onToday, onName, cls }) {
    const r = h('div', `rh-habit${cls ? ` ${cls}` : ''}`);
    const nm = h(onName ? 'button' : 'span', 'rh-hname');
    if (onName) { nm.type = 'button'; nm.onclick = onName; nm.title = 'Change or delete'; }
    nm.append(h('b', null, name), h('small', null, sub || ''));
    const sq = h('span', 'rh-days');
    marks.forEach((m) => sq.append(h('i', m)));
    const st = h('span', `rh-streak${streak ? '' : ' none'}`, streak || '–');
    if (streak) st.title = 'In a row';
    r.append(nm, sq, st);
    if (onToday) {
      const c = h('button', `rh-today${today ? ' on' : ''}`, today ? '✓' : '');
      c.type = 'button';
      c.setAttribute('aria-label', today ? `Untick ${name} for today` : `Tick ${name} for today`);
      c.onclick = onToday;
      r.append(c);
    } else r.append(h('span', 'rh-today-pad'));
    return r;
  }

  function render() {
    const now = Date.now(), ws = startOfWeek(now), today = iso(now), todayMs = startOfDay(now);
    const parts = [];
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

    const headRow = h('div', 'rh-habit rh-hhead');
    const dl = h('span', 'rh-days');
    LETTERS.forEach((l, i) => dl.append(h('span', days[i] === todayMs ? 'now' : '', l)));
    headRow.append(h('span', 'rh-hname', 'HABITS'), dl, h('span', 'rh-streak', 'streak'), h('span', 'rh-today-pad', 'today'));
    parts.push(headRow);

    // Gym
    const g = window.DASH_GYM ? DASH_GYM.week() : { done: 0, planned: 0 }, goal = window.DASH_GYM ? DASH_GYM.goal : 4;
    const gymLog = new Set((JSON.parse(localStorage.getItem('gym.log') || '[]') || []).map((l) => l.day));
    const gymCal = new Set(((window.DASH_CALENDAR && DASH_CALENDAR.events) || []).filter((e) => !e.allDay && /\b(gym|fitness|workout|training)\b/i.test(e.title || '') && !DASH.isAH(e) && e.end <= now).map((e) => iso(e.start)));
    parts.push(habitRow({
      name: 'Gym', sub: `${g.done} of ${goal} this week${g.planned ? ` · ${g.planned} planned` : ''}`, cls: 'gym',
      marks: days.map((d) => (gymLog.has(iso(d)) || gymCal.has(iso(d)) ? 'on' : d > todayMs ? 'later' : '')),
      streak: g.done >= goal ? '✓' : '',
    }));

    // Own habits
    if (P) {
      for (const hb of P.habits.list()) {
        const sched = !hb.days || !hb.days.length ? 'every day' : hb.days.length === 5 && hb.days.every((x, i) => x === i) ? 'weekdays' : hb.days.map((x) => P.SHORT[x]).join(' ');
        const st = P.habits.streak(hb, now);
        parts.push(habitRow({
          name: hb.name, sub: sched,
          marks: days.map((d) => (!P.habits.due(hb, d) ? 'off' : P.habits.done(hb.id, iso(d)) ? 'on' : d > todayMs ? 'later' : d === todayMs ? 'today' : '')),
          streak: st ? `${st} d` : '', today: P.habits.done(hb.id, today),
          onToday: P.habits.due(hb, todayMs) || P.habits.done(hb.id, today) ? guard(() => P.habits.toggle(hb.id, today)) : null,
          onName: () => openHabit(hb),
        }));
      }
    }

    // Phone away by 23:00 (phone app)
    const nights = app && app.lastUse;
    if (nights && Object.keys(nights).length) {
      let st = 0;
      for (let d = addDays(todayMs, -1), i = 0; i < 60; i++, d = addDays(d, -1)) { const t = nights[iso(d)]; if (!t || late(t) > 0) break; st++; }
      parts.push(habitRow({
        name: 'Phone away by 23:00', sub: 'from the phone app',
        marks: days.map((d) => { const t = nights[iso(d)]; return t ? (late(t) > 0 ? 'miss' : 'on') : d >= todayMs ? 'later' : ''; }),
        streak: st ? `${st} d` : '',
      }));
      const sq = parts[parts.length - 1].querySelectorAll('.rh-days i');
      days.forEach((d, i) => { const t = nights[iso(d)]; if (t && sq[i]) sq[i].title = `Phone away at ${t}`; });
    }

    const add = h('button', 'text-btn rh-add', '+ Add habit');
    add.type = 'button';
    add.onclick = () => openHabit(null);
    parts.push(add);

    // Screen time and focus
    const rows = [];
    const phoneMin = app && app.screenPhone && app.screenPhone[today];
    if (phoneMin != null) rows.push(['Phone today', hm(phoneMin)]);
    const pcKeys = pc ? Object.keys(pc).sort() : [];
    const pcDay = pcKeys.length ? pcKeys[pcKeys.length - 1] : null;
    if (pcDay) rows.push([pcDay === today ? 'Pc today' : `Pc ${new Date(`${pcDay}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' })}`, hm(Number(pc[pcDay]))]);
    const focusMin = P ? P.focus.week(ws) : 0;
    if (focusMin) rows.push(['Focus this week', hm(focusMin)]);
    if (rows.length) {
      parts.push(h('p', 'rh-sec', 'SCREEN TIME'));
      for (const [k, v] of rows) { const r = h('div', 'rh-row'); r.append(h('span', 'rh-label', k), h('b', 'rh-val2', v)); parts.push(r); }
    }
    body.replaceChildren(...parts);
  }

  window.addEventListener('dash:gym', guard(render));
  window.addEventListener('dash:habits', guard(render));
  window.addEventListener('dash:focuslog', guard(render));
  window.addEventListener('dash:calendar', guard(render));
  window.addEventListener('storage', guard((e) => { if (/^(habits\.|focus\.log|gym\.)/.test(e.key || '')) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if (/^(habits\.|focus\.log)/.test(e.detail.key)) render(); }));
  window.addEventListener('dash:data-token', guard(load));
  DASH.every(10 * 60 * 1000, guard(load));
  DASH.every(60 * 1000, guard(() => { if (!dlg.open) render(); }));
  render();
  load();
});
