'use strict';

// Aftelklok naar de volgende F1-sessie via de Jolpica-API (opvolger van Ergast).
DASH.widget('w-f1', (card, body, guard) => {
  const { h, store, fmtTime, fmtDay } = DASH;
  const KEY = 'f1.schedule';
  const SESSIONS = [
    ['FirstPractice', 'Vrije training 1', 60],
    ['SecondPractice', 'Vrije training 2', 60],
    ['ThirdPractice', 'Vrije training 3', 60],
    ['SprintQualifying', 'Sprintkwalificatie', 45],
    ['SprintShootout', 'Sprintkwalificatie', 45],
    ['Sprint', 'Sprint', 45],
    ['Qualifying', 'Kwalificatie', 60],
  ];

  let sessions = [];
  let countdown = null;

  function toSessions(races) {
    const out = [];
    for (const r of races) {
      const gp = r.raceName.replace(/\s*Grand Prix$/i, '');
      const add = (obj, name, min) => {
        if (!obj || !obj.date) return;
        const start = Date.parse(`${obj.date}T${obj.time || '12:00:00Z'}`);
        out.push({ gp, name, start, end: start + min * 60000, circuit: r.Circuit && r.Circuit.circuitName });
      };
      for (const [k, name, min] of SESSIONS) add(r[k], name, min);
      add(r, 'Race', 120);
    }
    return out.sort((a, b) => a.start - b.start);
  }

  async function fetchYear(year) {
    const data = await DASH.getJSON(`https://api.jolpi.ca/ergast/f1/${year}/races/?format=json&limit=100`);
    return toSessions(data.MRData.RaceTable.Races || []);
  }

  const load = guard(async () => {
    const cached = store.get(KEY);
    if (cached && Date.now() - cached.at < 6 * 3600000) sessions = cached.sessions;
    else {
      try {
        const year = new Date().getFullYear();
        sessions = await fetchYear(year);
        if (!sessions.some((s) => s.end > Date.now())) sessions = sessions.concat(await fetchYear(year + 1));
        store.set(KEY, { at: Date.now(), sessions });
      } catch (e) {
        if (!cached) throw e;
        sessions = cached.sessions; // oude gegevens zijn beter dan niks
      }
    }
    render();
  });

  function render() {
    const now = Date.now();
    const s = sessions.find((x) => x.end > now);
    clearInterval(countdown);
    if (!s) {
      body.replaceChildren(h('p', 'w-note', 'Geen sessies meer gepland. Tot volgend seizoen!'));
      return;
    }
    const live = s.start <= now;
    const head = h('div', 'w-row');
    head.append(h('div', 'w-mid', `GP ${s.gp}`));
    if (live) head.append(h('span', 'w-pill live', 'Nu bezig'));
    const when = h('div', 'w-sub', `${s.name} · ${fmtDay(s.start)} ${fmtTime(s.start)}`);
    const count = h('div', 'f1-count');
    body.replaceChildren(head, when, count);

    // "3d 4h 35min"; seconden pas op de dag zelf (of tijdens de sessie)
    const tick = () => {
      const target = live ? s.end : s.start;
      const ms = target - Date.now();
      if (ms <= 0) return render();
      const sameDay = DASH.startOfDay(target) === DASH.startOfDay(Date.now());
      const d = Math.floor(ms / 86400000);
      const hh = Math.floor(ms / 3600000) % 24;
      const mm = Math.floor(ms / 60000) % 60;
      const ss = Math.floor(ms / 1000) % 60;
      const units = [];
      if (d) units.push([d, 'd']);
      if (d || hh) units.push([hh, 'h']);
      units.push([mm, 'min']);
      if (sameDay || live) units.push([ss, 's']);
      const parts = live ? [h('small', null, 'nog')] : [];
      for (const [v, u] of units) parts.push(document.createTextNode(v), h('small', null, u), document.createTextNode(' '));
      count.replaceChildren(...parts);
    };
    tick();
    countdown = setInterval(guard(tick), 1000);
  }

  DASH.every(60 * 60 * 1000, load);
  load();
});
