'use strict';

// plan.exe / wrap-up.exe (Planner v3, 1.16.0): the top of the Planner tab.
// - Morning and day (plan.exe): "Your 3 for today": up to three tasks you pick from the open ones (click a task below the slots),
//   ticked off right here, plus one line with what the day holds (AH, classes, gym and study suggestions, exams).
// - Evening from 20:00, Sunday from 19:00 (wrap-up.exe): how the day (Sunday: the week) went, the tasks still open with
//   Tomorrow / Later / Drop, and "Your 3 for tomorrow" (Sunday: Monday). "Done" closes it until the next morning; the 3 wait there.
// Picks and "closed" are shared between devices (DASH_PLAN.top: plan.top, plan.closed).
DASH.widget('w-wrap', (card, body, guard) => {
  const { h, startOfDay, addDays, startOfWeek, fmtTime, isAH } = DASH;
  const P = window.DASH_PLAN;
  if (!P) throw new Error('planner core missing');
  const iso = P.iso;
  const tasks = () => (window.DASH_TASKS ? DASH_TASKS.list() : DASH.store.get('todo.items') || []);
  const upd = (id, ch) => window.DASH_TASKS && DASH_TASKS.update(id, ch);
  const ISO_WEEK = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
  const hrs = (min) => { const x = Math.round((min / 60) * 10) / 10; return `${x}`.replace(/\.0$/, ''); };

  let reopened = null;   // "Open again" after Done (this browser, this evening)

  function mode(now) {
    const d = new Date(now), hr = d.getHours(), sunday = d.getDay() === 0;
    const evening = hr >= 20 || (sunday && hr >= 19);
    const today = iso(now);
    if (evening) return P.top.closed(today) && reopened !== today ? 'closed' : sunday ? 'week' : 'wrap';
    return 'plan';
  }

  // What got done on a day / in a range: normal tasks by doneAt, repeating ones by their hist
  function doneIn(from, to) {
    let n = 0;
    for (const t of tasks()) {
      if (t.done && t.doneAt >= from && t.doneAt < to) n++;
      for (const k of t.hist || []) { const ms = P.fromIso(k); if (ms >= from && ms < to) n++; }
    }
    return n;
  }
  const openTasks = () => tasks().filter((t) => !t.done);
  const label = (t) => `${t.rep ? '↻ ' : ''}${t.text}`;

  // The three slots for a day + the tasks to pick from
  function picker(key, heading) {
    const ids = P.top.get(key).filter((id) => tasks().some((t) => t.id === id));
    const box = h('div', 'wr-picks');
    box.append(h('p', 'wr-h', heading));
    for (let i = 0; i < 3; i++) {
      const t = tasks().find((x) => x.id === ids[i]);
      const slot = h('div', `wr-slot${t ? ' full' : ''}${t && (t.done || (t.hist || []).includes(key)) ? ' done' : ''}`);
      slot.append(h('b', 'wr-n', String(i + 1)));
      if (t) {
        const finished = t.done || (t.hist || []).includes(key);
        const c = h('button', 'wr-check', finished ? '✓' : '');
        c.type = 'button';
        c.setAttribute('aria-label', finished ? 'Done' : `Tick off ${t.text}`);
        c.onclick = guard(() => { if (!finished) upd(t.id, { done: true }); });
        const x = h('button', 'wr-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Take out of the 3');
        x.onclick = guard(() => P.top.set(key, ids.filter((id) => id !== t.id)));
        const meta = t.due && !finished ? h('small', null, window.DASH_TASKS ? DASH_TASKS.dayLabel(t.due, t.time) : t.due) : null;
        slot.append(c, h('span', 'wr-t', label(t)), ...(meta ? [meta] : []), x);
      } else slot.append(h('span', 'wr-empty', ids.length === i ? 'Click a task below to put it here' : ''));
      box.append(slot);
    }
    if (ids.length < 3) {
      const end = P.fromIso(key) + 864e5;
      const weekEnd = addDays(startOfWeek(P.fromIso(key)), 7);
      const cands = openTasks().filter((t) => !ids.includes(t.id)).sort((a, b) => {
        const ra = !a.due ? 3 : P.fromIso(a.due) < end ? 0 : P.fromIso(a.due) < weekEnd ? 1 : 2;
        const rb = !b.due ? 3 : P.fromIso(b.due) < end ? 0 : P.fromIso(b.due) < weekEnd ? 1 : 2;
        return ra - rb || `${a.due || ''}${a.time || ''}`.localeCompare(`${b.due || ''}${b.time || ''}`);
      }).slice(0, 8);
      if (cands.length) {
        const row = h('div', 'wr-cands');
        for (const t of cands) {
          const b = h('button', 'tk-chip wr-cand', label(t));
          b.type = 'button';
          b.title = `Put "${t.text}" in your 3${t.due ? ` (${window.DASH_TASKS ? DASH_TASKS.dayLabel(t.due, t.time) : t.due})` : ''}`;
          b.onclick = guard(() => P.top.set(key, [...ids, t.id]));
          row.append(b);
        }
        box.append(row);
      } else if (!ids.length) box.append(h('p', 'w-sub', 'No open tasks. Add one in tasks.exe (or Ctrl+K).'));
    }
    return box;
  }

  // One line: what today holds
  function dayLine(now) {
    const d0 = startOfDay(now), d1 = d0 + 864e5;
    const ev = ((window.DASH_CALENDAR && DASH_CALENDAR.events) || []).filter((e) => !e.allDay && !e.canvas && !e.hidden && e.start < d1 && e.end > d0);
    const bits = [];
    for (const e of ev.filter(isAH)) bits.push(`Appie ${fmtTime(e.start)}–${fmtTime(e.end)}`);
    const school = ev.filter((e) => /rooster|timetable|erasmus|college|lecture|werkgroep|tutorial/i.test(`${e.calName} ${e.title}`) && !isAH(e));
    if (school.length) bits.push(`${school.length} class${school.length > 1 ? 'es' : ''} from ${fmtTime(Math.min(...school.map((e) => e.start)))}`);
    const gymEv = ev.filter((e) => /\b(gym|fitness|workout|training)\b/i.test(e.title || '') && !isAH(e));
    for (const e of gymEv) bits.push(`Gym ${fmtTime(e.start)}`);
    const other = ev.filter((e) => !isAH(e) && !school.includes(e) && !gymEv.includes(e) && !/formula 1|\bF1\b/i.test(e.title || ''));
    for (const e of other.slice(0, 2)) bits.push(`${e.title} ${fmtTime(e.start)}`);
    if (other.length > 2) bits.push(`+${other.length - 2} more`);
    const gym = window.DASH_GYM ? DASH_GYM.suggest().list.filter((g) => g.day === iso(now)) : [];
    for (const g of gym) bits.push(`Gym? ${fmtTime(g.start)}`);
    const study = window.DASH_STUDY ? DASH_STUDY.plan().filter((s) => s.day === iso(now)) : [];
    for (const s of study) bits.push(`Study? ${s.exam.course} ${fmtTime(s.start)}`);
    for (const x of P.exams.list().filter((x) => x.at >= d0 && x.at < d1)) bits.push(`Exam ${x.course} ${fmtTime(x.at)}`);
    const due = openTasks().filter((t) => t.due && t.due <= iso(now)).length;
    if (due) bits.push(`${due} task${due > 1 ? 's' : ''} due`);
    return bits.length ? bits.join(' · ') : 'Nothing planned today.';
  }

  // The open tasks of today and before, with where they go
  function leftovers(now, target, targetName) {
    const today = iso(now);
    const left = openTasks().filter((t) => t.due && t.due <= today).sort((a, b) => `${a.due}${a.time || ''}`.localeCompare(`${b.due}${b.time || ''}`));
    const box = h('div', 'wr-left');
    box.append(h('p', 'wr-h', left.length ? `${left.length} LEFT - WHERE DO THEY GO?` : 'NOTHING LEFT OPEN'));
    if (!left.length) { box.append(h('p', 'w-sub', 'Everything due today is done.')); return box; }
    for (const t of left.slice(0, 6)) {
      const r = h('div', 'wr-lrow');
      r.append(h('span', 'wr-t', label(t)));
      const acts = h('span', 'wr-acts');
      const mk = (txt, cls, fn, tip) => { const b = h('button', `wr-btn${cls ? ` ${cls}` : ''}`, txt); b.type = 'button'; b.title = tip; b.onclick = guard(fn); acts.append(b); };
      mk(targetName, 'go', () => upd(t.id, { due: target }), `Move to ${targetName}`);
      if (!t.rep) mk('Later', '', () => upd(t.id, { due: undefined }), 'No date (Later)');
      mk(t.rep ? 'Skip' : 'Drop', '', () => {
        if (t.rep) { const n = P.nextOn(t.rep, Math.max(P.fromIso(t.due), startOfDay(now)), false, P.fromIso(t.due)); if (n) upd(t.id, { due: iso(n) }); }
        else if (window.DASH_TASKS) DASH_TASKS.remove(t.id);
      }, t.rep ? 'Skip this time' : 'Delete the task');
      r.append(acts);
      box.append(r);
    }
    if (left.length > 6) box.append(h('p', 'w-sub', `+ ${left.length - 6} more in tasks.exe`));
    return box;
  }

  function stats(now, week) {
    const box = h('div', 'wr-stats');
    const d0 = startOfDay(now);
    if (week) {
      const ws = startOfWeek(now), we = addDays(ws, 7);
      const n = doneIn(ws, we);
      box.append(h('p', 'wr-h', `WEEK ${ISO_WEEK(now)} IS DONE`), h('p', 'wr-big', String(n)), h('p', 'wr-bigsub', `task${n === 1 ? '' : 's'} done`));
      const rows = [];
      if (window.DASH_GYM) { const g = DASH_GYM.week(); rows.push(['Gym', `${g.done} of ${DASH_GYM.goal}`]); }
      const studied = P.exams.log().filter((l) => l.start >= ws && l.start < we).reduce((a, l) => a + (l.end - l.start) / 60000, 0);
      if (studied || P.exams.list().length) rows.push(['Study', `${hrs(studied)} h`]);
      const rate = P.habits.rate(ws, now);
      if (rate != null) rows.push(['Habits', `${Math.round(rate * 100)}%`]);
      const fm = P.focus.week(ws);
      if (fm) rows.push(['Focus', `${hrs(fm)} h`]);
      for (const [k, v] of rows) { const r = h('div', 'wr-stat'); r.append(h('span', null, k), h('b', null, v)); box.append(r); }
    } else {
      const doneToday = doneIn(d0, d0 + 864e5);
      const open = openTasks().filter((t) => t.due && t.due <= iso(now)).length;
      box.append(h('p', 'wr-h', 'TODAY'), h('p', 'wr-big', `${doneToday} / ${doneToday + open}`), h('p', 'wr-bigsub', 'tasks done'));
      const picks = P.top.get(iso(now)).map((id) => tasks().find((t) => t.id === id)).filter(Boolean);
      if (picks.length) { const r = h('div', 'wr-stat'); r.append(h('span', null, 'Your 3'), h('b', null, `${picks.filter((t) => t.done || (t.hist || []).includes(iso(now))).length} of ${picks.length}`)); box.append(r); }
      const hb = P.habits.list().filter((x) => P.habits.due(x, d0));
      if (hb.length) { const r = h('div', 'wr-stat'); r.append(h('span', null, 'Habits'), h('b', null, `${hb.filter((x) => P.habits.done(x.id, iso(now))).length} of ${hb.length}`)); box.append(r); }
      const fm = P.focus.today ? Object.values((DASH.store.get('focus.log') || {})[iso(now)] || {}).reduce((a, b) => a + b, 0) : 0;
      if (fm) { const r = h('div', 'wr-stat'); r.append(h('span', null, 'Focus'), h('b', null, `${hrs(fm)} h`)); box.append(r); }
    }
    return box;
  }

  const eyebrow = card.querySelector(':scope > .eyebrow');
  card.dataset.nhDyn = '1';
  function setTitle(m) {
    const [name, kanji] = m === 'plan' ? ['plan', '計画'] : ['wrap-up', '振返'];
    Object.assign(card.dataset, { nhExe: `${name}.exe`, nhName: name, nhKanji: kanji });
    if (eyebrow) { Object.assign(eyebrow.dataset, { nhExe: `${name}.exe`, nhName: name, nhKanji: kanji }); eyebrow.textContent = name === 'plan' ? 'Plan' : 'Wrap-up'; }
  }

  function render() {
    const now = Date.now(), m = mode(now), today = iso(now);
    setTitle(m);
    card.dataset.mode = m;
    const tomorrow = iso(addDays(startOfDay(now), 1));
    const tName = new Date(now).getDay() === 0 ? 'Monday' : 'tomorrow';
    if (m === 'plan') {
      const line = h('p', 'wr-dayline', dayLine(now));
      body.replaceChildren(picker(today, 'YOUR 3 FOR TODAY'), line);
      return;
    }
    if (m === 'closed') {
      const ids = P.top.get(tomorrow).map((id) => tasks().find((t) => t.id === id)).filter(Boolean);
      const again = h('button', 'text-btn', 'Open again');
      again.type = 'button';
      again.onclick = () => { reopened = today; render(); };
      const line = h('p', 'wr-closed');
      line.append(h('b', null, 'Wrapped up ✓'), document.createTextNode(ids.length ? ` · Your 3 for ${tName}: ${ids.map((t) => t.text).join(' · ')}` : ` · See you ${tName}.`), again);
      body.replaceChildren(line);
      return;
    }
    const week = m === 'week';
    const grid = h('div', 'wr-grid');
    const right = h('div', 'wr-right');
    right.append(picker(tomorrow, `YOUR 3 FOR ${tName.toUpperCase()}`));
    const doneB = h('button', 'dx-btn dx-primary wr-done', week ? `Done - plan week ${ISO_WEEK(addDays(startOfDay(now), 1))}` : 'Done - see you tomorrow');
    doneB.type = 'button';
    doneB.onclick = guard(() => { reopened = null; P.top.close(today); });
    right.append(doneB);
    grid.append(stats(now, week), leftovers(now, tomorrow, week ? 'Mon' : 'Tomorrow'), right);
    body.replaceChildren(grid);
  }

  for (const ev of ['dash:tasks', 'dash:plan', 'dash:habits', 'dash:gym', 'dash:exams', 'dash:calendar', 'dash:focuslog']) window.addEventListener(ev, guard(render));
  window.addEventListener('storage', guard((e) => { if (/^(todo\.items|plan\.|habits\.|focus\.log)/.test(e.key || '')) render(); }));
  window.addEventListener('dash:synced', guard((e) => { if (/^(todo\.items|plan\.|habits\.|focus\.log)/.test(e.detail.key)) render(); }));
  DASH.every(60 * 1000, guard(render));
  render();
});
