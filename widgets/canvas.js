'use strict';

// Canvas-deadlines op urgentie: wat het eerst moet, staat bovenaan.
// Vak: de 3 urgentste. Knop "Alle deadlines" (of #canvas in de adresbalk) opent de volledige pagina.
// De Canvas-agenda zegt niet of je iets hebt ingeleverd: dat vink je zelf af (bewaard in deze browser).
DASH.widget('w-canvas', (card, body, guard) => {
  const { h, fmtTime, startOfDay, startOfWeek, addDays, store } = DASH;
  const PALETTE = ['#2fbf71', '#4fc3f7', '#ffb74d', '#ba68c8', '#f06292', '#aed581', '#4db6ac', '#ffd54f'];
  const DONE_KEY = 'canvas.done';
  const SHOW_KEY = 'canvas.showDone';
  const HOUR = 3600000, DAY = 24 * HOUR;
  let calendar = null;

  // "Essay week 6 [ESSB-MP6020]" → titel + vak
  function split(title) {
    const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    return m ? { name: m[1], course: m[2] } : { name: title, course: '' };
  }
  // Vaste kleur per vak (zelfde vak = altijd dezelfde kleur)
  function courseColor(course) {
    let n = 0;
    for (const ch of course) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[n % PALETTE.length];
  }

  const doneSet = () => new Set(store.get(DONE_KEY) || []);
  function setDone(id, on) {
    const s = doneSet();
    if (on) s.add(id); else s.delete(id);
    store.set(DONE_KEY, [...s]);
    render();
  }

  // ---------- Model ----------
  function items() {
    const canvas = calendar.events.filter((e) => e.canvas);
    const pool = canvas.some((e) => e.assignment) ? canvas.filter((e) => e.assignment) : canvas;
    const done = doneSet();
    const due = (e) => (e.allDay ? e.end - 1 : e.end);
    return pool.map((e) => ({ id: e.id, due: due(e), allDay: e.allDay, url: e.canvasUrl || null, done: done.has(e.id), ...split(e.title) }))
      .sort((a, b) => a.due - b.due);
  }

  // Groep en urgentie
  function group(it, now) {
    if (it.done) return 'done';
    if (it.due < now) return 'late';
    const day = startOfDay(it.due), today = startOfDay(now);
    if (day === today) return 'today';
    if (day === addDays(today, 1)) return 'tomorrow';
    if (it.due < addDays(startOfWeek(now), 7)) return 'week';
    return 'later';
  }
  const GROUPS = [['late', 'Te laat'], ['today', 'Vandaag'], ['tomorrow', 'Morgen'], ['week', 'Deze week'], ['later', 'Later'], ['done', 'Ingeleverd']];
  function urgency(it, now) {
    if (it.done) return 'done';
    const left = it.due - now;
    return left < 0 ? 'late' : left < DAY ? 'red' : left < 3 * DAY ? 'orange' : 'calm';
  }

  // "nog 5 uur", "morgen 23:59", "2 dagen te laat"
  function when(it, now) {
    const left = it.due - now;
    const time = it.allDay ? '' : ` ${fmtTime(it.due)}`;
    if (left < 0) {
      const ago = -left;
      if (ago < HOUR) return `${Math.max(1, Math.round(ago / 60000))} min te laat`;
      if (ago < DAY) return `${Math.round(ago / HOUR)} uur te laat`;
      const d = Math.round(ago / DAY);
      return `${d} ${d === 1 ? 'dag' : 'dagen'} te laat`;
    }
    if (!it.allDay && left < HOUR) return `nog ${Math.max(1, Math.round(left / 60000))} min`;
    if (!it.allDay && left < 12 * HOUR) return `nog ${Math.round(left / HOUR)} uur`;
    const diff = Math.round((startOfDay(it.due) - startOfDay(now)) / DAY);
    if (diff === 0) return `vandaag${time}`;
    if (diff === 1) return `morgen${time}`;
    if (diff < 7) return `${new Date(it.due).toLocaleDateString('nl-NL', { weekday: 'short' })}${time}`;
    return `${new Date(it.due).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}${time}`;
  }
  const fullDate = (it) => new Date(it.due).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + (it.allDay ? '' : ` ${fmtTime(it.due)}`);

  // Eén deadline als rij (in het vak compact, op de pagina met vinkje en link)
  function row(it, now, full) {
    const r = h('div', `cv-item u-${urgency(it, now)}`);
    r.style.setProperty('--dot', courseColor(it.course || it.name));
    const check = h('button', 'cv-check');
    check.type = 'button';
    check.setAttribute('aria-pressed', it.done);
    check.setAttribute('aria-label', it.done ? `${it.name}: niet ingeleverd` : `${it.name}: ingeleverd`);
    check.title = it.done ? 'Toch niet ingeleverd' : 'Markeer als ingeleverd';
    check.onclick = (e) => { e.stopPropagation(); setDone(it.id, !it.done); };
    const txt = h('div', 'cv-txt');
    const name = h(it.url && full ? 'a' : 'b', 'cv-name', it.name);
    if (it.url && full) { name.href = it.url; name.target = '_blank'; name.rel = 'noopener'; }
    name.title = it.name;
    const meta = h('div', 'cv-meta');
    const whenEl = h('span', 'cv-when', it.done ? 'ingeleverd' : when(it, now));
    // In het smalle vak staat de tijd onder de naam, op de pagina rechts
    if (!full) meta.append(whenEl);
    if (it.course) meta.append(h('span', 'cv-course', it.course));
    if (full) meta.append(h('span', null, fullDate(it)));
    txt.append(name, meta);
    r.append(check, txt);
    if (full) r.append(whenEl);
    else r.classList.add('compact');
    return r;
  }

  function empty(text) {
    DASH.alert('canvas', null);
    const box = h('div', 'w-empty');
    box.append(h('p', null, text));
    body.replaceChildren(box);
  }

  // ---------- Het vak: alleen de 3 urgentste ----------
  function render() {
    if (!calendar) return;
    if (!calendar.connected) return empty('Koppel je Google Agenda om je deadlines te zien.');
    if (!calendar.events.some((e) => e.canvas)) return empty('Nog geen Canvas-agenda gevonden (zie README, stap 4).');
    const now = Date.now();
    const all = items();
    const open = all.filter((it) => !it.done);
    const late = open.filter((it) => it.due < now);
    const upcoming = open.filter((it) => it.due >= now);
    const top = [...late, ...upcoming].slice(0, 3);

    card.classList.toggle('has-late', late.length > 0);

    // Meldingen: te laat, of binnen 24 uur
    const soon = upcoming.filter((it) => it.due - now < DAY);
    DASH.alert('canvas', [
      ...(late.length ? [{ level: 'urgent', icon: '📚', text: late.length === 1 ? `Te laat: ${late[0].name}` : `${late.length} Canvas-deadlines te laat`, sub: late.length === 1 ? when(late[0], now) : late.map((x) => x.name).join(', '), onClick: openPage }] : []),
      ...soon.map((it) => ({ level: it.due - now < 6 * HOUR ? 'urgent' : 'warn', icon: '📚', text: it.name, sub: `Canvas · ${when(it, now)}${it.course ? ` · ${it.course}` : ''}`, onClick: openPage })),
    ]);
    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(open.length));
    big.append(h('small', null, open.length === 1 ? 'deadline open' : 'deadlines open'));
    head.append(big);
    if (late.length) head.append(h('span', 'w-pill cv-late-pill', `${late.length} te laat`));

    const list = h('div', 'cv-list');
    if (top.length) top.forEach((it) => list.append(row(it, now, false)));
    else list.append(h('p', 'w-note', 'Niks meer in te leveren 🎉'));

    const more = h('button', 'w-btn ghost cv-more', open.length > 3 ? `Alle deadlines (${open.length}) →` : 'Alle deadlines →');
    more.type = 'button';
    more.onclick = openPage;
    body.replaceChildren(head, list, more);
    if (page && page.dialog.open) fillPage();
  }

  // ---------- De pagina met alles ----------
  let page = null;
  function fillPage() {
    const now = Date.now();
    const all = items();
    const showDone = store.get(SHOW_KEY) === true;
    const doneCount = all.filter((it) => it.done).length;

    const toolbar = h('div', 'cvp-bar');
    const intro = h('p', 'w-note', 'Gesorteerd op wat het eerst moet. Canvas geeft niet door of je iets hebt ingeleverd: vink het zelf af met het rondje.');
    const toggle = h('button', 'w-btn ghost', showDone ? `Verberg ingeleverd (${doneCount})` : `Toon ingeleverd (${doneCount})`);
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', showDone);
    toggle.onclick = () => { store.set(SHOW_KEY, !showDone); fillPage(); };
    toolbar.append(intro, toggle);

    const wrap = h('div', 'cvp-groups');
    for (const [key, label] of GROUPS) {
      if (key === 'done' && !showDone) continue;
      const list = all.filter((it) => group(it, now) === key);
      if (key === 'done') list.reverse();
      if (!list.length) continue;
      const sec = h('section', `cvp-group g-${key}`);
      const title = h('h3', 'cvp-title', label);
      title.append(h('span', 'cvp-count', String(list.length)));
      sec.append(title);
      list.forEach((it) => sec.append(row(it, now, true)));
      wrap.append(sec);
    }
    if (!wrap.children.length) wrap.append(h('p', 'w-note', 'Niks meer in te leveren 🎉'));

    const inner = h('div', 'cvp-inner');
    inner.append(toolbar, wrap);
    const scroll = page.body.scrollTop;
    page.body.replaceChildren(inner);
    page.body.scrollTop = scroll;
  }

  function openPage() {
    if (!calendar || !calendar.connected) return;
    if (!page) {
      page = DASH.panel('Canvas-deadlines', 'var(--c-study)');
      page.dialog.classList.add('page-dialog', 'cv-page');
      // Adresbalk: #canvas zolang de pagina open is (terug-knop sluit hem)
      page.dialog.addEventListener('close', () => {
        if (location.hash !== '#canvas') return;
        if (pushed) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
        pushed = false;
      });
    }
    fillPage();
    if (!page.dialog.open) page.open();
    if (location.hash !== '#canvas') { history.pushState(null, '', '#canvas'); pushed = true; }
  }
  let pushed = false;
  window.addEventListener('popstate', () => {
    if (page && page.dialog.open && location.hash !== '#canvas') { pushed = false; page.close(); }
  });

  DASH.onCalendar(guard((detail) => {
    calendar = detail;
    render();
    if (location.hash === '#canvas' && !(page && page.dialog.open)) openPage();
  }));
  // Elke minuut de tijden ("nog 5 uur") en groepen bijwerken
  DASH.every(60 * 1000, guard(render));
});
