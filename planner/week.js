'use strict';

// Standard week: works out where the modules go this week. Only calculation, no screen and no storage:
// plan() gets everything it needs and returns which rows must be added, changed or removed.
//
// What is already placed stays as long as it still fits. Only dotted blocks move; pinned, checked-off and
// past blocks are not touched.
window.PlannerWeek = (() => {
  const SLOT = 15;
  const LAST_END = 23 * 60;       // nothing after 23:00
  const SHIFT_BEFORE = 25;        // cycling to the shift
  const SHIFT_AFTER = 30;         // cycling back and nothing within half an hour after a shift
  const PREF_WINDOWS = { morning: [0, 12 * 60], afternoon: [12 * 60, 18 * 60], evening: [18 * 60, 24 * 60] };

  const RULES = [
    { key: 'no_shift', label: 'Day without a shift' },
    { key: 'not_after_shift', label: 'Not after a shift' },
    { key: 'empty_day', label: 'Preferably an empty day' },
    { key: 'after_dinner', label: 'After dinner' },
    { key: 'sunday_first', label: 'Sunday or first free moment' },
    { key: 'before_college', label: 'Before the first lecture of the chosen subject' },
    { key: 'per_course', label: 'One block per subject, before the first lecture of the week' },
  ];
  const PREFS = { any: "doesn't matter", morning: 'morning', afternoon: 'afternoon', evening: 'evening' };

  // Travel time and dinner time are placeholders: set them yourself in Standard week
  const DEFAULTS = { eur_travel_min: 30, day_start_min: 8 * 60, dinner_min: 19 * 60 + 30, course_map: {} };
  const mod = (n, name, duration_min, freq, times, pref, rules, color, alternate) => ({
    id: `5a7d0e00-0000-4000-8000-00000000000${n}`, name, duration_min, freq, times, pref, rules, color, alternate: alternate || null, subject_id: null, enabled: true, sort: n,
  });
  const BEGIN = [
    // Only for a new account: existing modules keep the name they were saved with
    mod(1, 'Reading per subject', 60, 'weekly', 1, 'any', ['per_course'], '#2fbf71'),
    mod(2, 'Laundry + groceries + plan meals', 90, 'weekly', 1, 'any', ['no_shift'], '#ff7a45'),
    mod(3, 'Projects', 180, 'weekly', 1, 'any', ['empty_day'], '#f5b02e'),
    mod(4, 'Call friends or grandma', 60, 'weekly', 1, 'evening', ['not_after_shift'], '#a78bfa'),
    mod(5, 'Tidy room', 45, 'weekly', 1, 'any', [], '#4fa8ff', 'bed'),
    mod(6, 'Week review + plan next week', 30, 'weekly', 1, 'any', ['sunday_first'], '#4fa8ff'),
    mod(7, 'Empty Still to reply', 15, 'daily', 1, 'any', ['after_dinner'], '#a78bfa'),
  ];

  // ---------- Dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const dayStart = (k) => fromKey(k).getTime();
  const mondayOf = (k) => shift(k, -((fromKey(k).getDay() + 6) % 7));
  function isoWeek(k) {
    const d = fromKey(shift(mondayOf(k), 3));   // the Thursday decides which year the week belongs to
    const first = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round((d - first) / (7 * 86400000) - ((first.getDay() + 6) % 7 - 3) / 7);
  }
  const ceilSlot = (m) => Math.ceil(m / SLOT) * SLOT;
  const floorSlot = (m) => Math.floor(m / SLOT) * SLOT;

  // ---------- Recognising the timetable (same words as the collector in dashboard-data) ----------
  const COLLEGE = /\b(hoorcollege|werkcollege|college|werkgroep|tutorial|lecture|seminar|practicum|responsiecollege)\b/i;
  const ROOSTER_CAL = /timetable|rooster|erasmus|\beur\b/i;
  const EXAM = /\b(hertentamen|tentamen|toets|exam|resit|retake|midterm|finals?)\b/i;

  // Titles in the EUR timetable look like "ESSB-MP1000 - Name of the subject"
  function courseOf(title) {
    const m = title.match(/^\s*([A-Z]{2,}[-A-Z0-9]*\d[A-Z0-9]*)\s*[-–—:]\s*(.+)$/);
    if (m) return { code: m[1], name: m[2].split(/\s+[-–—]\s+/)[0].trim() };
    const name = title.replace(new RegExp(COLLEGE.source, 'gi'), ' ').replace(/[-–—:]+/g, ' ').replace(/\s+/g, ' ').trim();
    return name ? { code: name, name } : null;
  }
  function classify(ev, calendarName, isShift) {
    const rooster = ROOSTER_CAL.test(calendarName || '');
    const college = !isShift && (rooster || COLLEGE.test(ev.title || ''));
    return {
      id: ev.id, title: ev.title || '', start: ev.start, end: ev.end, shift: isShift, college,
      course: college && !EXAM.test(ev.title || '') ? courseOf(ev.title || '') : null,
    };
  }

  // Per week the subjects with their first lecture
  function weekCourses(events, week) {
    const a = dayStart(week), b = dayStart(shift(week, 7));
    const found = new Map();
    for (const e of events) {
      if (!e.course || e.start < a || e.start >= b) continue;
      const seen = found.get(e.course.code);
      if (!seen || e.start < seen.first) found.set(e.course.code, { ...e.course, first: e.start });
    }
    return [...found.values()].sort((x, y) => x.first - y.first);
  }
  function courseSubject(course, subjects, map) {
    const chosen = map && map[course.code];
    if (chosen === 'skip') return 'skip';
    if (chosen) return subjects.find((s) => s.id === chosen) || null;
    const lower = (course.name || '').toLowerCase();
    return subjects.find((s) => s.name === course.code)
      || subjects.find((s) => s.name.length >= 3 && lower.includes(s.name.toLowerCase())) || null;
  }

  function describe(m) {
    const hours = m.duration_min >= 60 ? `${m.duration_min / 60} h` : `${m.duration_min} min`;
    const often = m.freq === 'daily' ? 'every day' : m.freq === 'biweekly' ? 'every other week' : `${m.times}x per week`;
    const rules = (m.rules || []).map((r) => (RULES.find((x) => x.key === r) || {}).label).filter(Boolean).map((t) => t.charAt(0).toLowerCase() + t.slice(1));
    const per = (m.rules || []).includes('per_course');
    return [hours, per ? null : often, m.pref !== 'any' ? PREFS[m.pref] : null, m.alternate ? `${m.alternate} every other week` : null, ...rules].filter(Boolean).join(' · ');
  }

  function subtract(win, busy) {
    let spans = win[1] > win[0] ? [win] : [];
    for (const [a, b] of busy) {
      spans = spans.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [...(a > x ? [[x, a]] : []), ...(b < y ? [[b, y]] : [])]));
    }
    return spans;
  }

  // ---------- Planning ----------
  function plan({ modules, settings, subjects, tasks, events, weeks, now, fresh }) {
    const set = { ...DEFAULTS, ...settings };
    const nowDate = new Date(now);
    const today = keyOf(nowDate);
    const thisWeek = mondayOf(today);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    const out = { inserts: [], updates: [], deletes: [], conflicts: [], moves: [] };

    // Events per day, in minutes after midnight
    const clip = (a, b, k) => {
      const d = dayStart(k), e = dayStart(shift(k, 1));
      return a < e && b > d ? [Math.round((Math.max(a, d) - d) / 60000), Math.round((Math.min(b, e) - d) / 60000)] : null;
    };
    const buffered = (e) => {
      if (e.shift) return [e.start - SHIFT_BEFORE * 60000, e.end + SHIFT_AFTER * 60000];
      if (e.college) return [e.start - set.eur_travel_min * 60000, e.end + set.eur_travel_min * 60000];
      return [e.start, e.end];
    };
    const cache = new Map();
    function dayInfo(k) {
      if (cache.has(k)) return cache.get(k);
      const info = { blocked: [], raw: [], shifts: [] };
      for (const e of events) {
        const raw = clip(e.start, e.end, k);
        if (raw) {
          info.raw.push({ s: raw[0], e: raw[1], ev: e });
          if (e.shift) info.shifts.push({ s: raw[0], e: raw[1] });
        }
        const [a, b] = buffered(e);
        const wide = clip(a, b, k);
        if (wide) info.blocked.push(wide);
      }
      cache.set(k, info);
      return info;
    }

    // What's already there, per day. Fixed things first; dotted ones are added once checked or placed.
    const occ = new Map();
    const occupy = (k, s, e, row, auto) => { if (!occ.has(k)) occ.set(k, []); occ.get(k).push({ s, e, row, auto }); };
    const isPast = (t) => t.day && t.start_min != null && dayStart(t.day) + (t.start_min + t.duration_min) * 60000 <= now;
    const activeAuto = (t) => t.module_state === 'auto' && !t.done && !isPast(t);
    for (const t of tasks) {
      if (t.start_min == null || !t.day || t.module_state === 'skipped' || activeAuto(t)) continue;
      occupy(t.day, t.start_min, t.start_min + t.duration_min, t, false);
    }

    // ---------- What should be in these weeks ----------
    const realSubjects = subjects.filter((s) => !s.name.startsWith('@'));
    const slots = [];
    for (const m of modules) {
      if (!m.enabled) continue;
      const rules = new Set(m.rules || []);
      for (const week of weeks) {
        const even = isoWeek(week) % 2 === 0;
        if (m.freq === 'biweekly' && !even) continue;
        const days = [...Array(7).keys()].map((i) => shift(week, i));
        const title = m.alternate && even ? `${m.name} + ${m.alternate}` : m.name;
        const base = { module: m, week, rules, title, duration: m.duration_min, subject_id: m.subject_id || null, days };
        const courses = weekCourses(events, week);
        if (rules.has('per_course')) {
          for (const c of courses) {
            const sub = courseSubject(c, realSubjects, set.course_map);
            if (sub === 'skip') continue;
            const collegeDay = keyOf(new Date(c.first));
            const range = [];
            for (let k = shift(week, -2); k <= collegeDay; k = shift(k, 1)) range.push(k);
            const label = sub && sub.name !== c.code ? sub.name : c.name || c.code;
            slots.push({ ...base, key: `${m.id}|${week}|c:${c.code}`, title: `${m.name.replace(/\s*per (vak|subject)\s*$/i, '')} ${label}`.slice(0, 200), subject_id: sub ? sub.id : base.subject_id, days: range, beforeMs: c.first, expired: c.first <= now });
          }
        } else if (m.freq === 'daily') {
          days.forEach((k, i) => { if (k >= today) slots.push({ ...base, key: `${m.id}|${week}|d${i}`, days: [k], daily: true }); });
        } else {
          let beforeMs = null;
          if (rules.has('before_college') && m.subject_id) {
            const c = courses.find((x) => { const s = courseSubject(x, realSubjects, set.course_map); return s && s !== 'skip' && s.id === m.subject_id; });
            if (c && c.first > now) beforeMs = c.first;
          }
          const n = m.freq === 'biweekly' ? 1 : Math.max(1, m.times || 1);
          for (let i = 0; i < n; i++) slots.push({ ...base, key: `${m.id}|${week}|${i}`, beforeMs });
        }
      }
    }

    const rank = (s) => {
      if (s.rules.has('per_course')) return 0;
      if (s.rules.has('before_college')) return 1;
      if (s.daily) return 4;
      return s.rules.has('no_shift') || s.rules.has('not_after_shift') || s.rules.has('sunday_first') ? 2 : 3;
    };
    const byPriority = (a, b) => rank(a.slot || a) - rank(b.slot || b)
      || (b.slot || b).duration - (a.slot || a).duration
      || (a.slot || a).module.sort - (b.slot || b).module.sort
      || ((a.slot || a).key < (b.slot || b).key ? -1 : 1);

    const limitOf = (slot, k) => {
      if (!slot.beforeMs) return 1440;
      return Math.min(1440, Math.round((slot.beforeMs - dayStart(k)) / 60000));
    };
    const allowed = (slot, k, s, dur) => {
      if (s + dur > LAST_END || s + dur > limitOf(slot, k)) return false;
      const info = dayInfo(k);
      if (slot.rules.has('no_shift') && info.shifts.length) return false;
      if (slot.rules.has('not_after_shift') && info.shifts.some((x) => x.e <= s)) return false;
      if (slot.rules.has('after_dinner') && s < set.dinner_min) return false;
      return true;
    };
    const blockedOn = (k, ignore) => [...dayInfo(k).blocked, ...(occ.get(k) || []).filter((o) => o.row !== ignore || !ignore).map((o) => [o.s, o.e])];
    const stillFits = (slot, k, s, dur) => s >= set.day_start_min && allowed(slot, k, s, dur)
      && !blockedOn(k).some(([a, b]) => a < s + dur && b > s);

    const used = new Map();     // which days a module already has in a week: spread x per week
    const markUsed = (slot, k) => { const id = `${slot.module.id}|${slot.week}`; if (!used.has(id)) used.set(id, new Set()); used.get(id).add(k); };

    function findBest(slot, ignore) {
      const dur = slot.duration;
      const win = PREF_WINDOWS[slot.module.pref];
      let best = null;
      slot.days.forEach((k, index) => {
        if (k < today) return;
        const info = dayInfo(k);
        const earliest = Math.max(set.day_start_min, k === today ? ceilSlot(nowMin + 5) : 0);
        const end = Math.min(LAST_END, limitOf(slot, k));
        for (const [a, b] of subtract([earliest, end], blockedOn(k, ignore).sort((x, y) => x[0] - y[0]))) {
          const starts = new Set([ceilSlot(a), floorSlot(b - dur)]);
          if (win) starts.add(ceilSlot(Math.max(a, win[0])));
          if (slot.rules.has('after_dinner')) starts.add(ceilSlot(Math.max(a, set.dinner_min)));
          for (const s of starts) {
            if (s < a || s + dur > b || !allowed(slot, k, s, dur)) continue;
            let score = slot.beforeMs ? 0 : index * 2;
            score += s / 600;
            if (win && !(s >= win[0] && s < win[1])) score += 500;
            if (slot.rules.has('empty_day') && info.raw.length) score += 300 + info.raw.reduce((n, x) => n + x.e - x.s, 0) / 10;
            score += (occ.get(k) || []).filter((o) => o.auto).reduce((n, o) => n + o.e - o.s, 0) / (slot.beforeMs ? 20 : 5);
            if ((used.get(`${slot.module.id}|${slot.week}`) || new Set()).has(k)) score += 400;
            if (slot.rules.has('sunday_first')) score += fromKey(k).getDay() === 0 ? -1000 : index * 10;
            // Reading preferably shortly before the lecture, but not late in the evening
            if (slot.beforeMs) score += (slot.beforeMs - (dayStart(k) + s * 60000)) / 14400000 + (s >= 21 * 60 ? 10 : 0);
            if (!best || score < best.score || (score === best.score && (k < best.k || (k === best.k && s < best.s)))) best = { k, s, score };
          }
        }
      });
      return best;
    }

    // ---------- Checking existing rows ----------
    const bySlot = new Map(tasks.filter((t) => t.slot_key).map((t) => [t.slot_key, t]));
    const wanted = new Set(slots.map((s) => s.key));
    const check = [];
    const pending = [];
    const pinned = [];
    for (const slot of slots) {
      const row = bySlot.get(slot.key);
      if (!row) { if (!slot.expired) pending.push({ slot }); continue; }
      if (row.done || row.module_state === 'skipped') continue;
      if (row.module_state === 'pinned') { pinned.push({ slot, row }); continue; }
      if (isPast(row)) continue;
      if (slot.expired) { out.deletes.push(row.id); continue; }
      check.push({ slot, row });
    }

    function patchFor(slot, row, extra) {
      const want = { title: slot.title, duration_min: slot.duration, subject_id: slot.subject_id, ...extra };
      const patch = {};
      for (const [f, v] of Object.entries(want)) if ((row[f] ?? null) !== v) patch[f] = v;
      return patch;
    }
    const sendPatch = (row, patch) => { if (Object.keys(patch).length) out.updates.push({ id: row.id, patch }); };

    for (const item of check.sort(byPriority)) {
      const { slot, row } = item;
      const placed = row.day && row.start_min != null;
      if (placed && !(fresh && fresh.has(slot.module.id)) && stillFits(slot, row.day, row.start_min, slot.duration)) {
        occupy(row.day, row.start_min, row.start_min + slot.duration, row, true);
        markUsed(slot, row.day);
        sendPatch(row, patchFor(slot, row));
      } else {
        pending.push(item);
      }
    }

    // ---------- What still needs a place ----------
    for (const { slot, row } of pending.sort(byPriority)) {
      const best = findBest(slot);
      if (best) {
        occupy(best.k, best.s, best.s + slot.duration, row || slot, true);
        markUsed(slot, best.k);
        if (row) {
          sendPatch(row, patchFor(slot, row, { day: best.k, start_min: best.s }));
          if (row.day && !(fresh && fresh.has(slot.module.id)) && (row.day !== best.k || row.start_min !== best.s)) out.moves.push({ title: slot.title, day: best.k, start: best.s });
        } else {
          out.inserts.push(newRow(slot, best.k, best.s));
        }
      } else if (slot.daily && slot.days[0] === today) {
        // No room left today: not a row in the Inbox every evening
        if (row) out.deletes.push(row.id);
      } else if (row) {
        sendPatch(row, patchFor(slot, row, { day: null, start_min: null }));
        if (row.day) out.moves.push({ title: slot.title, day: null, start: null });
      } else {
        out.inserts.push(newRow(slot, null, null));
      }
    }

    function newRow(slot, day, start) {
      return { kind: 'task', title: slot.title, day, start_min: start, duration_min: slot.duration, done: false, subject_id: slot.subject_id, module_id: slot.module.id, slot_key: slot.key, module_week: slot.week, module_state: 'auto' };
    }

    // ---------- Pinned and clashing: the planner asks about that ----------
    for (const { slot, row } of pinned) {
      if (!row.day || row.start_min == null || isPast(row)) continue;
      const end = row.start_min + row.duration_min;
      const hit = dayInfo(row.day).raw.find((x) => x.s < end && x.e > row.start_min);
      if (!hit) continue;
      const best = findBest({ ...slot, duration: row.duration_min }, row);
      out.conflicts.push({ row, event: hit.ev, suggestion: best ? { day: best.k, start: best.s } : null });
    }

    // ---------- Cleaning up ----------
    const known = new Set(modules.filter((m) => m.enabled).map((m) => m.id));
    const oldest = shift(thisWeek, -14);
    const inScope = new Set(weeks);
    for (const t of tasks) {
      if (!t.slot_key || out.deletes.includes(t.id) || t.done) continue;
      const placedOrWaiting = t.module_state === 'auto' && !isPast(t);
      if ((t.module_state === 'auto' || t.module_state === 'skipped') && t.module_week && t.module_week < oldest) { out.deletes.push(t.id); continue; }
      if (t.module_state === 'auto' && t.day == null && t.module_week && t.module_week < thisWeek) { out.deletes.push(t.id); continue; }
      if (!placedOrWaiting || wanted.has(t.slot_key)) continue;
      if (!known.has(t.module_id) || inScope.has(t.module_week)) out.deletes.push(t.id);
    }
    return out;
  }

  return { plan, classify, weekCourses, courseSubject, describe, BEGIN, DEFAULTS, RULES, PREFS };
})();
