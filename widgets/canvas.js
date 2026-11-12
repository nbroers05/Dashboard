'use strict';

// Canvas-deadlines op urgentie: wat het eerst moet, staat bovenaan.
// Vak: de 3 urgentste. Knop "Alle deadlines" (of #canvas in de adresbalk) opent de volledige pagina.
// De Canvas-agenda zegt niet of je iets hebt ingeleverd: dat vink je zelf af (sinds 0.59.0 gedeeld via het privé archief).
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

  // ---------- Ingeleverd, gedeeld tussen apparaten (sinds 0.59.0) ----------
  // Per opdracht { id: [1 = ingeleverd / 0 = niet, tijd van afvinken] } in deze browser (canvas.doneMap) én in het privé
  // archief (state/canvas-done.json, via het archief-token). Bij verschil wint het laatst aangepaste. Zonder token of
  // offline blijft het gewoon in deze browser en gaat het mee bij de volgende keer dat het lukt.
  const MAP_KEY = 'canvas.doneMap';
  const SYNC_PATH = 'state/canvas-done.json';
  function doneMap() {
    let m = store.get(MAP_KEY);
    if (!m) {   // oude lijst (vóór 0.59.0) overnemen
      m = {};
      for (const id of store.get(DONE_KEY) || []) m[id] = [1, 0];
      store.set(MAP_KEY, m);
    }
    return m;
  }
  function saveMap(m) {
    store.set(MAP_KEY, m);
    store.set(DONE_KEY, Object.keys(m).filter((id) => m[id][0] === 1));
  }
  const doneSet = () => { const m = doneMap(); return new Set(Object.keys(m).filter((id) => m[id][0] === 1)); };
  function setDone(id, on) {
    const m = doneMap();
    m[id] = [on ? 1 : 0, Date.now()];
    saveMap(m);
    render();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 1500);
  }
  // Nieuwste per id wint; geeft true als `into` veranderde
  function merge(into, from) {
    let changed = false;
    for (const [id, v] of Object.entries(from || {})) {
      if (!Array.isArray(v)) continue;
      if (!into[id] || v[1] > into[id][1]) { into[id] = v; changed = true; }
    }
    return changed;
  }
  let syncTimer = null, syncing = false;
  // Sinds 1.1.0: is deze browser gekoppeld aan Supabase (sync.js), dan leest en schrijft hij alleen de tabel
  // dashboard_canvas_done (één rij per opdracht). De dagelijkse kopie naar state/canvas-done.json maakt het archief zelf
  // (dashboard-data, scripts/canvas_copy.py). Eenmalig worden de vinkjes uit het archief overgezet (vlag _canvas.imported).
  // Niet gekoppeld of Supabase nog niet ingesteld: zoals vóór 1.1.0 via het archief.
  const SB = () => window.DASH_SB && DASH_SB.linked() ? DASH_SB : null;
  let imported = false;
  async function syncSupabase(sb) {
    const local = doneMap();
    if (!imported && !(imported = !!(await sb.flag('_canvas.imported')))) {
      const D = window.DASH_DATA;
      if (D && D.token()) {
        const f = await D.read(SYNC_PATH).catch(() => null);
        if (f) merge(local, JSON.parse(f.text).items || {});
      }
      const all = Object.entries(local).map(([id, v]) => ({ item_id: id, done: v[0] === 1, changed_at: v[1] }));
      for (let i = 0; i < all.length; i += 200) await sb.upsert('dashboard_canvas_done', all.slice(i, i + 200), 'user_id,item_id');
      await sb.flag('_canvas.imported', new Date().toISOString());
      imported = true;
      saveMap(local);
    }
    const rows = await sb.rest('dashboard_canvas_done?select=item_id,done,changed_at');
    const remote = Object.fromEntries((rows || []).map((r) => [r.item_id, [r.done ? 1 : 0, Number(r.changed_at)]]));
    if (merge(local, remote)) { saveMap(local); render(); }
    const newer = Object.entries(local).filter(([id, v]) => !remote[id] || v[1] > remote[id][1])
      .map(([id, v]) => ({ item_id: id, done: v[0] === 1, changed_at: v[1] }));
    if (newer.length) await sb.upsert('dashboard_canvas_done', newer, 'user_id,item_id');
  }
  async function sync() {
    const D = window.DASH_DATA;
    if (DASH.DEMO || syncing) return;
    const sb = SB();
    if (sb) {
      syncing = true;
      try { await syncSupabase(sb); } catch (e) { sb.fail(e); } finally { syncing = false; }
      return;
    }
    if (!D || !D.token()) return;
    syncing = true;
    try {
      const f = await D.read(SYNC_PATH);
      const remote = (f && JSON.parse(f.text).items) || {};
      const local = doneMap();
      if (merge(local, remote)) { saveMap(local); render(); }
      // Heeft deze browser iets wat het archief nog niet heeft? Dan wegschrijven
      const probe = { ...remote };
      if (merge(probe, local)) {
        await D.updateJson(SYNC_PATH, (data) => { data.items = data.items || {}; merge(data.items, local); }, 'Canvas: ingeleverd bijgewerkt');
      }
    } catch (e) {
      console.warn('[canvas] synchroniseren', e);
    } finally {
      syncing = false;
    }
  }
  window.addEventListener('dash:data-token', () => sync());
  window.addEventListener('dash:sb-linked', () => sync());
  setTimeout(sync, 3000);   // datarepo.js laadt na dit bestand
  DASH.every(5 * 60 * 1000, () => sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

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
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('dash:canvas')));
    if (!calendar.connected) { DASH.alert('canvas', null); body.replaceChildren(DASH.problem('Koppel je Google Agenda om je deadlines te zien.', 'Agenda koppelen', DASH.connectGoogle)); return; }
    if (!calendar.events.some((e) => e.canvas)) return empty('Nog geen Canvas-agenda gevonden (zie README, stap 4).');
    const now = Date.now();
    const all = items();
    const open = all.filter((it) => !it.done);
    const late = open.filter((it) => it.due < now);
    const upcoming = open.filter((it) => it.due >= now);
    const top = [...late, ...upcoming].slice(0, 3);

    card.classList.toggle('has-late', late.length > 0);
    card.classList.toggle('cv-none', open.length === 0);   // tall: vak valt dan weg (sinds 0.59.0)

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

  // Voor de telefoon (phone.js): open deadlines (null = geen agenda), tekst als "4 dagen te laat", en de pagina
  window.DASH_CANVAS = { items: () => (calendar && calendar.connected ? items() : null), when, openPage: () => openPage() };

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
