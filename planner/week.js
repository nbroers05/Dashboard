'use strict';

// Standaardweek: rekent uit waar de modules deze week komen. Alleen rekenen, geen scherm en geen opslag:
// plan() krijgt alles wat het nodig heeft en geeft terug welke rijen erbij moeten, anders moeten of weg moeten.
//
// Wat al staat blijft staan zolang het nog past. Alleen gestippelde blokken schuiven; vastgezette, afgevinkte en
// voorbije blokken worden niet aangeraakt.
window.PlannerWeek = (() => {
  const SLOT = 15;
  const LAST_END = 23 * 60;       // niks na 23:00
  const SHIFT_BEFORE = 25;        // fietsen naar de dienst
  const SHIFT_AFTER = 30;         // fietsen terug en niks binnen een half uur na een dienst
  const PREF_WINDOWS = { morning: [0, 12 * 60], afternoon: [12 * 60, 18 * 60], evening: [18 * 60, 24 * 60] };

  const RULES = [
    { key: 'no_shift', label: 'Dag zonder dienst' },
    { key: 'not_after_shift', label: 'Niet na een dienst' },
    { key: 'empty_day', label: 'Liefst lege dag' },
    { key: 'after_dinner', label: 'Na het eten' },
    { key: 'sunday_first', label: 'Zondag of eerste vrije moment' },
    { key: 'before_college', label: 'Vóór het eerste college van het gekozen vak' },
    { key: 'per_course', label: 'Eén blok per vak, vóór het eerste college van de week' },
  ];
  const PREFS = { any: 'maakt niet uit', morning: 'ochtend', afternoon: 'middag', evening: 'avond' };

  // Reistijd en etenstijd zijn placeholders: zelf in te stellen bij Standaardweek
  const DEFAULTS = { eur_travel_min: 30, day_start_min: 8 * 60, dinner_min: 19 * 60 + 30, course_map: {} };
  const mod = (n, name, duration_min, freq, times, pref, rules, color, alternate) => ({
    id: `5a7d0e00-0000-4000-8000-00000000000${n}`, name, duration_min, freq, times, pref, rules, color, alternate: alternate || null, subject_id: null, enabled: true, sort: n,
  });
  const BEGIN = [
    mod(1, 'Lezen per vak', 60, 'weekly', 1, 'any', ['per_course'], '#2fbf71'),
    mod(2, 'Was + boodschappen + eten bedenken', 90, 'weekly', 1, 'any', ['no_shift'], '#ff7a45'),
    mod(3, 'Projecten', 180, 'weekly', 1, 'any', ['empty_day'], '#f5b02e'),
    mod(4, 'Mensen of oma bellen', 60, 'weekly', 1, 'evening', ['not_after_shift'], '#a78bfa'),
    mod(5, 'Kamer opruimen', 45, 'weekly', 1, 'any', [], '#4fa8ff', 'bed'),
    mod(6, 'Weekreview + volgende week plannen', 30, 'weekly', 1, 'any', ['sunday_first'], '#4fa8ff'),
    mod(7, 'Nog reageren leegmaken', 15, 'daily', 1, 'any', ['after_dinner'], '#a78bfa'),
  ];

  // ---------- Datums ----------
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const dayStart = (k) => fromKey(k).getTime();
  const mondayOf = (k) => shift(k, -((fromKey(k).getDay() + 6) % 7));
  function isoWeek(k) {
    const d = fromKey(shift(mondayOf(k), 3));   // de donderdag bepaalt bij welk jaar de week hoort
    const first = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round((d - first) / (7 * 86400000) - ((first.getDay() + 6) % 7 - 3) / 7);
  }
  const ceilSlot = (m) => Math.ceil(m / SLOT) * SLOT;
  const floorSlot = (m) => Math.floor(m / SLOT) * SLOT;

  // ---------- Rooster herkennen (zelfde woorden als de collector in dashboard-data) ----------
  const COLLEGE = /\b(hoorcollege|werkcollege|college|werkgroep|tutorial|lecture|seminar|practicum|responsiecollege)\b/i;
  const ROOSTER_CAL = /timetable|rooster|erasmus|\beur\b/i;
  const EXAM = /\b(hertentamen|tentamen|toets|exam|resit|retake|midterm|finals?)\b/i;

  // Titels in het EUR-rooster zien eruit als "ESSB-MP1000 - Naam van het vak"
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

  // Per week de vakken met hun eerste college
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
    const hours = m.duration_min >= 60 ? `${String(m.duration_min / 60).replace('.', ',')} u` : `${m.duration_min} min`;
    const often = m.freq === 'daily' ? 'elke dag' : m.freq === 'biweekly' ? 'om de week' : `${m.times}x per week`;
    const rules = (m.rules || []).map((r) => (RULES.find((x) => x.key === r) || {}).label).filter(Boolean).map((t) => t.charAt(0).toLowerCase() + t.slice(1));
    const per = (m.rules || []).includes('per_course');
    return [hours, per ? null : often, m.pref !== 'any' ? PREFS[m.pref] : null, m.alternate ? `${m.alternate} om de week` : null, ...rules].filter(Boolean).join(' · ');
  }

  function subtract(win, busy) {
    let spans = win[1] > win[0] ? [win] : [];
    for (const [a, b] of busy) {
      spans = spans.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [...(a > x ? [[x, a]] : []), ...(b < y ? [[b, y]] : [])]));
    }
    return spans;
  }

  // ---------- Plannen ----------
  function plan({ modules, settings, subjects, tasks, events, weeks, now, fresh }) {
    const set = { ...DEFAULTS, ...settings };
    const nowDate = new Date(now);
    const today = keyOf(nowDate);
    const thisWeek = mondayOf(today);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    const out = { inserts: [], updates: [], deletes: [], conflicts: [], moves: [] };

    // Afspraken per dag, in minuten na middernacht
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

    // Wat er al ligt, per dag. Vaste dingen eerst; gestippelde komen erbij als ze zijn nagekeken of geplaatst.
    const occ = new Map();
    const occupy = (k, s, e, row, auto) => { if (!occ.has(k)) occ.set(k, []); occ.get(k).push({ s, e, row, auto }); };
    const isPast = (t) => t.day && t.start_min != null && dayStart(t.day) + (t.start_min + t.duration_min) * 60000 <= now;
    const activeAuto = (t) => t.module_state === 'auto' && !t.done && !isPast(t);
    for (const t of tasks) {
      if (t.start_min == null || !t.day || t.module_state === 'skipped' || activeAuto(t)) continue;
      occupy(t.day, t.start_min, t.start_min + t.duration_min, t, false);
    }

    // ---------- Wat moet er deze weken staan ----------
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
            slots.push({ ...base, key: `${m.id}|${week}|c:${c.code}`, title: `${m.name.replace(/\s*per vak\s*$/i, '')} ${label}`.slice(0, 200), subject_id: sub ? sub.id : base.subject_id, days: range, beforeMs: c.first, expired: c.first <= now });
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

    const used = new Map();     // welke dagen een module al heeft in een week: x per week spreiden
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
            // Lezen liefst kort voor het college, maar niet laat op de avond
            if (slot.beforeMs) score += (slot.beforeMs - (dayStart(k) + s * 60000)) / 14400000 + (s >= 21 * 60 ? 10 : 0);
            if (!best || score < best.score || (score === best.score && (k < best.k || (k === best.k && s < best.s)))) best = { k, s, score };
          }
        }
      });
      return best;
    }

    // ---------- Bestaande regels nakijken ----------
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

    // ---------- Wat nog een plek nodig heeft ----------
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
        // Vandaag is er geen plek meer: niet elke avond een regel in de Inbox
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

    // ---------- Vastgezet en botst: dat vraagt de planner ----------
    for (const { slot, row } of pinned) {
      if (!row.day || row.start_min == null || isPast(row)) continue;
      const end = row.start_min + row.duration_min;
      const hit = dayInfo(row.day).raw.find((x) => x.s < end && x.e > row.start_min);
      if (!hit) continue;
      const best = findBest({ ...slot, duration: row.duration_min }, row);
      out.conflicts.push({ row, event: hit.ev, suggestion: best ? { day: best.k, start: best.s } : null });
    }

    // ---------- Opruimen ----------
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
