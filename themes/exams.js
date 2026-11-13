'use strict';

// Exam week: the week (Mon to Sun) in which your agenda has an exam. Recognised by the title, Dutch or English
// (the same words as EXAM in scripts/lib.py of the archive): tentamen, hertentamen, herkansing, toets, exam(s),
// examen, examination, resit, retake, midterm, final exam, finals.
// Only from the agenda in your browser, nothing from the archive. Muted: everything that moves goes off (also on a holiday),
// only a calm border around the top bar.
DASH_THEMES.add({
  id: 'exams', name: 'Exam week', icon: '📚', tier: 'event', prio: 50, c1: '#8fa3bf', c2: '#56657a', topbar: 'soft', quiet: true,
  when(day, data) {
    const { isoDay, addDays } = DASH_THEMES.util;
    const mon = addDays(day, -((day.getDay() + 6) % 7));
    const from = isoDay(mon), to = isoDay(addDays(mon, 6));
    return data.events.some((e) => {
      if (!/\b(tentamen|hertentamen|deeltentamen|herkansing|toets|exams?|examen|examination|resit|re-sit|retake|midterm|mid-term|final exam|finals)\b/i.test(e.title || '') || e.birthday) return false;
      const d = isoDay(new Date(e.start));
      return d >= from && d <= to;
    });
  },
});
