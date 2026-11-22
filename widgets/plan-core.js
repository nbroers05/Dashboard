'use strict';

// Planner v3 core (1.16.0): the shared rules behind tasks.exe, day.exe, rhythm.exe and wrap-up.exe. No tile of its own.
// DASH_PLAN:
// - parse(text): dates in words. "laundry every sunday 10:00 30 min low" -> { text: 'laundry', due, time, dur, rep, en, found }.
//   Understands today / tonight / tomorrow / weekday names / "next week" / "in 3 days" / 4 dec / dec 4 / 4-12 / 04-12-2026,
//   times 15:00 / 15.00 / 3pm / "at 9", durations 30 min / 1 h / 1.5 h, repeats every day / weekday(s) / week / month /
//   every mon wed / daily / weekly / monthly, energy "low|medium|high energy", "!low" or a last word low / medium / high.
//   A text that starts with "exam" is an exam ("exam AQM 4 dec 9:00").
// - Repeats: a task can have rep = { f: 'day'|'wd'|'week'|'month', d: [weekdays, Monday = 0] }. Its `due` is the next time it
//   is due. Checking it off moves `due` to the next time and remembers the day in `hist` (todo.js does that).
// - ENERGY: how much energy you have per hour (0 low .. 1 high), used for the strip in the week and to place study sessions.
// - Shared lists (sync.js): habits.list / habits.log, exams.list / exams.log / exams.skips, plan.top / plan.closed, focus.log.
(() => {
  const { store } = DASH;
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const day0 = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const plusDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
  const dow = (ms) => (new Date(ms).getDay() + 6) % 7;   // Monday = 0
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_RE = '(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const dayIdx = (w) => DAYS.indexOf(w.slice(0, 3).toLowerCase());
  const pad = (n) => String(n).padStart(2, '0');
  const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ---------- Repeats ----------
  function occursOn(rep, ms, anchor) {
    if (!rep) return false;
    const w = dow(ms);
    if (rep.f === 'day') return true;
    if (rep.f === 'wd') return w < 5;
    if (rep.f === 'week') return (rep.d && rep.d.length ? rep.d : [dow(anchor || ms)]).includes(w);
    if (rep.f === 'month') return new Date(ms).getDate() === new Date(anchor || ms).getDate();
    return false;
  }
  // First day on or after `from` (inclusive = true) that the repeat falls on
  function nextOn(rep, from, inclusive, anchor) {
    let d = day0(from);
    if (!inclusive) d = plusDays(d, 1);
    for (let i = 0; i < 400; i++, d = plusDays(d, 1)) if (occursOn(rep, d, anchor)) return d;
    return null;
  }
  function repText(rep) {
    if (!rep) return '';
    if (rep.f === 'day') return 'every day';
    if (rep.f === 'wd') return 'weekdays';
    if (rep.f === 'month') return 'every month';
    const d = rep.d || [];
    if (d.length === 1) return `every ${SHORT[d[0]]}`;
    return `every ${d.map((x) => SHORT[x]).join(' ')}`;
  }

  // ---------- Dates in words ----------
  function parse(input, now = Date.now()) {
    let s = ` ${String(input || '').replace(/\s+/g, ' ').trim()} `;
    const out = { found: [] };
    const take = (re, fn) => { const m = s.match(re); if (!m) return false; const r = fn(m); if (r === false) return false; s = s.replace(m[0], ' '); return true; };
    const today = day0(now);

    if (/^\s*exam\s+/i.test(s)) { out.exam = true; s = s.replace(/^\s*exam\s+/i, ' '); out.found.push('exam'); }

    // energy
    take(/\s(low|medium|med|high)\s+energy\b/i, (m) => { out.en = m[1].toLowerCase().startsWith('med') ? 'med' : m[1].toLowerCase(); })
      || take(/\s!(low|medium|med|high)\b/i, (m) => { out.en = m[1].toLowerCase().startsWith('med') ? 'med' : m[1].toLowerCase(); })
      || (!out.exam && take(/\s(low|medium|med|high)\s*$/i, (m) => { out.en = m[1].toLowerCase().startsWith('med') ? 'med' : m[1].toLowerCase(); }));

    // repeat
    take(new RegExp(`\\s(?:every|each)\\s+(${DAY_RE}(?:\\s*(?:,|and|&)?\\s*${DAY_RE})*)\\b`, 'i'), (m) => {
      const d = [...new Set(m[1].toLowerCase().split(/[\s,&]+|and/).filter(Boolean).map(dayIdx).filter((x) => x >= 0))].sort();
      out.rep = d.length === 5 && d.every((x, i) => x === i) ? { f: 'wd' } : { f: 'week', d };
    })
      || take(/\s(?:every|each)\s+(day|weekday|weekdays|week|month)\b/i, (m) => { const w = m[1].toLowerCase(); out.rep = { f: w === 'day' ? 'day' : w.startsWith('weekday') ? 'wd' : w }; })
      || take(/\s(daily|weekdays|weekly|monthly)\b/i, (m) => { const w = m[1].toLowerCase(); out.rep = { f: w === 'daily' ? 'day' : w === 'weekdays' ? 'wd' : w === 'weekly' ? 'week' : 'month' }; });

    // duration
    take(/\s(?:for\s+)?(\d+(?:[.,]\d+)?)\s*(min|mins|minutes|minute|h|hr|hrs|hour|hours)\b/i, (m) => {
      const n = Number(m[1].replace(',', '.'));
      const min = /^h/i.test(m[2]) ? Math.round(n * 60) : Math.round(n);
      if (!min || min > 24 * 60) return false;
      out.dur = min;
    });

    // time
    take(/\s(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/i, (m) => { out.time = `${pad(Number(m[1]))}:${m[2]}`; })
      || take(/\s(?:at\s+)?(\d{1,2})\s*(am|pm)\b/i, (m) => { let hh = Number(m[1]) % 12; if (m[2].toLowerCase() === 'pm') hh += 12; if (hh > 23) return false; out.time = `${pad(hh)}:00`; })
      || take(/\sat\s+([01]?\d|2[0-3])\b/i, (m) => { out.time = `${pad(Number(m[1]))}:00`; });

    // date
    const setDue = (ms) => { out.due = iso(ms); };
    take(/\s(?:on\s+)?(?:today|tod)\b/i, () => setDue(today))
      || take(/\stonight\b/i, () => { setDue(today); if (!out.time) out.time = '20:00'; })
      || take(/\s(?:on\s+)?(?:the\s+)?day after tomorrow\b/i, () => setDue(plusDays(today, 2)))
      || take(/\s(?:on\s+)?(?:tomorrow|tmrw|tmr|tomorow)\b/i, () => setDue(plusDays(today, 1)))
      || take(/\snext week\b/i, () => setDue(plusDays(today, 7 - dow(today))))
      || take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)\b/i, (m) => setDue(plusDays(today, Number(m[1]) * (/^w/i.test(m[2]) ? 7 : 1))))
      || take(/\s(?:on\s+)?(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?\b/, (m) => {
        const dd = Number(m[1]), mm = Number(m[2]) - 1;
        let y = m[3] ? Number(m[3]) : new Date(today).getFullYear();
        let d = new Date(y, mm, dd);
        if (d.getMonth() !== mm || d.getDate() !== dd) return false;
        if (!m[3] && d.getTime() < today) d = new Date(++y, mm, dd);
        setDue(d.getTime());
      })
      || take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE}\\b(?:\\s+(\\d{4}))?`, 'i'), (m) => {
        const mm = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), dd = Number(m[1]);
        let y = m[3] ? Number(m[3]) : new Date(today).getFullYear();
        let d = new Date(y, mm, dd);
        if (d.getMonth() !== mm) return false;
        if (!m[3] && d.getTime() < today) d = new Date(++y, mm, dd);
        setDue(d.getTime());
      })
      || take(new RegExp(`\\s(?:on\\s+)?${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => {
        const mm = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), dd = Number(m[2]);
        let y = new Date(today).getFullYear();
        let d = new Date(y, mm, dd);
        if (d.getMonth() !== mm) return false;
        if (d.getTime() < today) d = new Date(++y, mm, dd);
        setDue(d.getTime());
      })
      || take(new RegExp(`\\s(?:on\\s+|next\\s+|this\\s+)?(${DAY_RE})\\b`, 'i'), (m) => {
        const want = dayIdx(m[1]);
        let d = today;
        while (dow(d) !== want) d = plusDays(d, 1);
        if (/next/i.test(m[0]) && d - today < 7 * 864e5 && d === today) d = plusDays(d, 7);
        setDue(d);
      });

    if (out.rep) {
      if (out.rep.f === 'week' && !(out.rep.d && out.rep.d.length)) out.rep.d = [dow(out.due ? fromIso(out.due) : today)];
      const first = nextOn(out.rep, out.due ? fromIso(out.due) : today, true, out.due ? fromIso(out.due) : today);
      if (first) out.due = iso(first);
    }
    if (out.time && !out.due) out.due = iso(today);
    if (out.dur && !out.time) delete out.dur;   // a duration only means something with a time

    out.text = s.replace(/\s+/g, ' ').replace(/\s(at|on|by|for|every)\s*$/i, '').trim();
    if (out.rep) out.found.push(`↻ ${repText(out.rep).replace(/^every /, 'Every ').replace(/^weekdays/, 'Weekdays')}`);
    if (out.due && !out.rep) out.found.push(dayWord(out.due, now));
    if (out.time) out.found.push(out.time);
    if (out.dur) out.found.push(out.dur % 60 === 0 ? `${out.dur / 60} h` : out.dur > 60 ? `${Math.floor(out.dur / 60)} h ${out.dur % 60} min` : `${out.dur} min`);
    if (out.en) out.found.push(`${out.en === 'med' ? 'medium' : out.en} energy`);
    return out;
  }
  function dayWord(key, now = Date.now()) {
    const t = day0(now), d = fromIso(key), diff = Math.round((d - t) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff > 1 && diff < 7) return new Date(d).toLocaleDateString('en-GB', { weekday: 'long' });
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ---------- Energy over the day (0 = low, 1 = high): sharp in the morning, a dip after lunch, a second wind, low late ----------
  const ENERGY = { 7: .55, 8: .75, 9: .95, 10: 1, 11: .95, 12: .7, 13: .45, 14: .35, 15: .5, 16: .7, 17: .72, 18: .62, 19: .55, 20: .45, 21: .3, 22: .2, 23: .12 };
  const energyAt = (hour) => (ENERGY[Math.floor(hour)] != null ? ENERGY[Math.floor(hour)] : .2);
  const EN_LABEL = { low: 'Low', med: 'Medium', high: 'High' };

  // ---------- Small shared stores ----------
  const list = (k) => store.get(k) || [];
  const obj = (k) => store.get(k) || {};
  const ping = (name) => window.dispatchEvent(new CustomEvent(name));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Habits: habits.list = [{ id, name, days: [Monday = 0 ..] (empty = every day) }], habits.log = { 'YYYY-MM-DD': [ids] }
  const habits = {
    list: () => list('habits.list'),
    log: () => obj('habits.log'),
    save(items) { store.set('habits.list', items); ping('dash:habits'); },
    add(name, days) { habits.save([...habits.list(), { id: newId(), name, days: days || [] }]); },
    update(id, change) { habits.save(habits.list().map((x) => (x.id === id ? { ...x, ...change } : x))); },
    remove(id) { habits.save(habits.list().filter((x) => x.id !== id)); },
    due: (hb, ms) => !hb.days || !hb.days.length || hb.days.includes(dow(ms)),
    done: (id, key) => (habits.log()[key] || []).includes(id),
    toggle(id, key) {
      const lg = habits.log(), cur = new Set(lg[key] || []);
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      lg[key] = [...cur];
      const cut = iso(plusDays(Date.now(), -120));   // keep four months
      for (const k of Object.keys(lg)) if (k < cut || !lg[k].length) delete lg[k];
      store.set('habits.log', lg);
      ping('dash:habits');
    },
    // Done days in a row (scheduled days only), counting back from today (today only counts once done)
    streak(hb, now = Date.now()) {
      let n = 0, d = day0(now);
      if (!habits.done(hb.id, iso(d))) d = plusDays(d, -1);
      for (let i = 0; i < 400; i++, d = plusDays(d, -1)) {
        if (!habits.due(hb, d)) continue;
        if (!habits.done(hb.id, iso(d))) break;
        n++;
      }
      return n;
    },
    // Share of scheduled habit-days done in the week of ws, up to today
    rate(ws, now = Date.now()) {
      let due = 0, done = 0;
      for (let i = 0; i < 7; i++) {
        const d = plusDays(ws, i);
        if (d > now) break;
        for (const hb of habits.list()) if (habits.due(hb, d)) { due++; if (habits.done(hb.id, iso(d))) done++; }
      }
      return due ? done / due : null;
    },
  };

  // Exams: exams.list = [{ id, course, at (ms), need (min), len (min) }], exams.log = [{ id: exam id, day, start, end }],
  // exams.skips = { 'examId|YYYY-MM-DD': ms }
  const exams = {
    list: () => list('exams.list'),
    log: () => list('exams.log'),
    skips: () => obj('exams.skips'),
    save(items) { store.set('exams.list', items); ping('dash:exams'); },
    upsert(ex) { const all = exams.list(); const i = all.findIndex((x) => x.id === ex.id); if (i >= 0) all[i] = ex; else all.push({ ...ex, id: ex.id || newId() }); exams.save(all); },
    remove(id) { exams.save(exams.list().filter((x) => x.id !== id)); store.set('exams.log', exams.log().filter((l) => l.id !== id)); },
    studied: (id) => exams.log().filter((l) => l.id === id).reduce((a, l) => a + Math.round((l.end - l.start) / 60000), 0),
    go(s) { store.set('exams.log', [...exams.log(), { id: s.exam.id, day: iso(s.start), start: s.start, end: s.end }]); ping('dash:exams'); },
    skip(s) { store.set('exams.skips', { ...exams.skips(), [`${s.exam.id}|${iso(s.start)}`]: Date.now() }); ping('dash:exams'); },
    // Old exams (more than two weeks ago) and their log are dropped
    cleanup() {
      const cut = Date.now() - 14 * 864e5, all = exams.list(), keep = all.filter((x) => x.at > cut);
      if (keep.length !== all.length) { store.set('exams.list', keep); store.set('exams.log', exams.log().filter((l) => keep.some((x) => x.id === l.id))); }
      const sk = exams.skips(), keepS = Object.fromEntries(Object.entries(sk).filter(([k]) => keep.some((x) => k.startsWith(`${x.id}|`))));
      if (Object.keys(keepS).length !== Object.keys(sk).length) store.set('exams.skips', keepS);
    },
  };

  // Your 3 for a day: plan.top = { 'YYYY-MM-DD': [task ids] }; plan.closed = { 'YYYY-MM-DD': ms } (wrap-up done that evening)
  const top = {
    get: (key) => obj('plan.top')[key] || [],
    set(key, ids) {
      const all = obj('plan.top');
      all[key] = ids.slice(0, 3);
      const cut = iso(plusDays(Date.now(), -14));
      for (const k of Object.keys(all)) if (k < cut || !all[k].length) delete all[k];
      store.set('plan.top', all);
      ping('dash:plan');
    },
    closed: (key) => !!obj('plan.closed')[key],
    close(key) {
      const all = { ...obj('plan.closed'), [key]: Date.now() };
      const cut = iso(plusDays(Date.now(), -14));
      for (const k of Object.keys(all)) if (k < cut) delete all[k];
      store.set('plan.closed', all);
      ping('dash:plan');
    },
  };

  // Focus minutes: focus.log = { 'YYYY-MM-DD': { taskId or '_': minutes } }
  const focus = {
    add(taskId, min) {
      if (!(min >= 0.5)) return;
      const lg = obj('focus.log'), key = iso(Date.now());
      lg[key] = lg[key] || {};
      lg[key][taskId || '_'] = Math.round((lg[key][taskId || '_'] || 0) + min);
      const cut = iso(plusDays(Date.now(), -60));
      for (const k of Object.keys(lg)) if (k < cut) delete lg[k];
      store.set('focus.log', lg);
      ping('dash:focuslog');
    },
    today: (taskId) => ((obj('focus.log')[iso(Date.now())] || {})[taskId]) || 0,
    week(ws) {
      let n = 0;
      const lg = obj('focus.log');
      for (let i = 0; i < 7; i++) for (const v of Object.values(lg[iso(plusDays(ws, i))] || {})) n += v;
      return n;
    },
  };

  window.DASH_PLAN = { parse, dayWord, occursOn, nextOn, repText, ENERGY, energyAt, EN_LABEL, habits, exams, top, focus, iso, fromIso, dow, SHORT };
})();
