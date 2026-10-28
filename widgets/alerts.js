'use strict';

// Meldingen: alles wat nu aandacht vraagt, verzameld uit de andere vakken (DASH.alert),
// plus de meldingen van je telefoon via het hulpprogramma op je pc (helper/meldingen.py, alleen op die pc).
DASH.widget('w-alerts', (card, body, guard) => {
  const { h, fmtTime, startOfDay } = DASH;
  const HELPER = 'http://127.0.0.1:8765';
  const ORDER = { urgent: 0, warn: 1, info: 2 };
  const PHONE_SHOW = 5;

  let phone = null;       // null = (nog) geen hulpprogramma, [] = verbonden maar leeg
  let helperError = null;

  const when = (ms) => (startOfDay(ms) === startOfDay(Date.now()) ? fmtTime(ms) : new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', ''));

  function closeBtn(label, fn) {
    const b = h('button', 'al-x', '✕');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
  }

  // Eén melding als rij
  function alertRow(a) {
    const row = h(a.onClick ? 'button' : 'div', `al-item lv-${a.level}`);
    if (a.onClick) { row.type = 'button'; row.onclick = a.onClick; }
    const txt = h('div', 'al-txt');
    txt.append(h('b', null, a.text));
    if (a.sub) txt.append(h('span', 'w-sub', a.sub));
    row.append(h('span', 'al-icon', a.icon || '•'), txt);
    if (a.onDismiss) row.append(closeBtn('Gezien', a.onDismiss));
    return row;
  }
  function phoneRow(n, icon) {
    const row = h('div', 'al-item al-phone');
    const txt = h('div', 'al-txt');
    const top = h('div', 'al-top');
    top.append(h('b', null, icon ? `📱 ${n.title}` : n.title), h('span', 'al-time', when(n.time)));
    txt.append(top);
    if (n.body) txt.append(h('span', 'al-body', n.body));
    row.append(txt, closeBtn('Weghalen (ook van je pc)', () => dismissPhone(n.id)));
    return row;
  }

  // Volledige lijst (vak in de gewone indeling, of de pop-up "Alle meldingen")
  function fullList(alerts, phoneItems, more) {
    const list = h('div', 'al-list');
    alerts.forEach((a) => list.append(alertRow(a)));
    if (phoneItems.length) {
      const title = h('div', 'al-section');
      title.append(h('span', null, '📱 Telefoon'));
      if (more) title.append(h('span', 'w-sub', `+${more} meer`));
      list.append(title);
      phoneItems.forEach((n) => list.append(phoneRow(n, false)));
    }
    return list;
  }

  // Staand nieuw ontwerp: de belangrijkste 3. Breed liggend: zoveel als er helemaal in het vak passen.
  // De rest via de knop "Alle meldingen".
  const COMPACT = 3;
  const compact = () => (document.querySelector('.dashboard.desk') ? 'desk' : document.querySelector('.dashboard.tall') ? 'tall' : null);
  let allPanel = null;
  function openAll() {
    if (!allPanel) {
      allPanel = DASH.panel('Alle meldingen', 'var(--c)');
      allPanel.dialog.classList.add('al-dialog');
      allPanel.dialog.style.setProperty('--c', '#a78bfa');
    }
    fillAll();
    allPanel.open();
  }
  function fillAll() {
    if (!allPanel) return;
    const alerts = DASH.allAlerts().sort((a, b) => ORDER[a.level] - ORDER[b.level]);
    const list = fullList(alerts, phone || [], 0);
    if (!list.children.length) list.append(h('p', 'w-note', 'Niks aan de hand.'));
    allPanel.body.replaceChildren(list);
  }

  function render() {
    const alerts = DASH.allAlerts().sort((a, b) => ORDER[a.level] - ORDER[b.level]);
    const total = alerts.length + (phone ? phone.length : 0);
    if (allPanel && allPanel.dialog.open) fillAll();

    // Focusmodus (focus.js): meldingen gedempt tot de timer klaar is, alleen het aantal dat wacht
    if (DASH.focus) {
      card.classList.remove('al-urgent');
      const box = h('div', 'al-calm al-muted');
      box.append(h('div', 'al-check', '🔕'), h('div', 'w-mid', `Gedempt tot ${fmtTime(DASH.focus.until)}`));
      box.append(h('p', 'w-sub', total ? `${total} ${total === 1 ? 'melding wacht' : 'meldingen wachten'} tot na je focus` : 'Focusmodus staat aan'));
      body.replaceChildren(box);
      return;
    }
    card.classList.toggle('al-urgent', alerts.some((a) => a.level === 'urgent'));

    if (!total) {
      const box = h('div', 'al-calm');
      box.append(h('div', 'al-check', '✓'), h('div', 'w-mid', 'Niks aan de hand'));
      if (helperError) box.append(h('p', 'w-sub al-helper', helperError));
      body.replaceChildren(box);
      return;
    }

    let list, more = null, rows = null;
    const mode = compact();
    if (mode) {
      // Belangrijkste eerst (urgent, dan je telefoon, dan de rest)
      rows = [...alerts.filter((a) => a.level === 'urgent').map(alertRow), ...(phone || []).map((n) => phoneRow(n, true)), ...alerts.filter((a) => a.level !== 'urgent').map(alertRow)];
      list = h('div', 'al-list al-fit');
      list.append(...(mode === 'tall' ? rows.slice(0, COMPACT) : rows));
      more = h('button', 'w-btn ghost al-more', `Alle meldingen (${rows.length}) →`);
      more.type = 'button';
      more.onclick = openAll;
      more.hidden = mode === 'tall' ? rows.length <= COMPACT : true;
    } else {
      const phoneItems = (phone || []).slice(0, PHONE_SHOW);
      list = fullList(alerts, phoneItems, phone && phone.length > PHONE_SHOW ? phone.length - PHONE_SHOW : 0);
    }

    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(total));
    big.append(h('small', null, total === 1 ? 'melding' : 'meldingen'));
    head.append(big);
    body.replaceChildren(head, list);
    if (more) body.append(more);
    if (helperError) body.append(h('p', 'w-sub al-helper', helperError));
    if (mode === 'desk') fitRows();
  }

  // Breed liggend: kaartjes die niet helemaal passen weglaten (geen half afgesneden kaartjes)
  function fitRows() {
    const list = body.querySelector('.al-fit');
    const more = body.querySelector('.al-more');
    if (!list || !more) return;
    const rows = [...list.children];
    rows.forEach((r) => { r.hidden = false; });
    more.hidden = true;
    let shown = rows.length;
    const overflowing = () => list.scrollHeight > list.clientHeight + 1;
    if (overflowing()) {
      more.hidden = false;   // de knop neemt zelf ook ruimte in
      while (shown > 1 && overflowing()) rows[--shown].hidden = true;
    }
  }
  new ResizeObserver(() => { if (compact() === 'desk') fitRows(); }).observe(card);
  window.addEventListener('dash:layout', () => render());


  // ---------- Telefoon via het hulpprogramma ----------
  async function loadPhone() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${HELPER}/meldingen`, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      phone = data.items || [];
      helperError = null;
    } catch (e) {
      phone = null;
      // Op de telefoon of een andere pc is er geen hulpprogramma: daar niets over zeggen
      helperError = window.matchMedia('(max-width: 700px)').matches || DASH.DEMO ? null
        : e.name === 'AbortError' || e instanceof TypeError ? 'Telefoonmeldingen: start het hulpprogramma op deze pc (README, stap 9).' : e.message;
    }
    render();
  }

  async function dismissPhone(id) {
    phone = (phone || []).filter((n) => n.id !== id);
    render();
    try { await fetch(`${HELPER}/weg/${id}`, { method: 'POST' }); } catch {}
  }

  window.addEventListener('dash:alerts', guard(render));
  window.addEventListener('dash:focus', guard(render));
  DASH.every(20 * 1000, guard(loadPhone));
  render();
  loadPhone();
});
