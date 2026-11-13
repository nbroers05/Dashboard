'use strict';

// Notifications: everything that needs attention right now, collected from the other tiles (DASH.alert),
// plus your phone's notifications via the helper on your PC (helper/server.py, only on that PC).
DASH.widget('w-alerts', (card, body, guard) => {
  const { h, fmtTime, startOfDay } = DASH;
  const HELPER = 'http://127.0.0.1:8765';
  const ORDER = { urgent: 0, warn: 1, info: 2 };
  const PHONE_SHOW = 5;

  let phone = null;       // null = no helper (yet), [] = connected but empty
  let helperError = null;

  const when = (ms) => (startOfDay(ms) === startOfDay(Date.now()) ? fmtTime(ms) : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('.', ''));

  function closeBtn(label, fn) {
    const b = h('button', 'al-x', '✕');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
  }

  // One notification as a row
  function alertRow(a) {
    const row = h(a.onClick ? 'button' : 'div', `al-item lv-${a.level}`);
    if (a.onClick) { row.type = 'button'; row.onclick = a.onClick; }
    const txt = h('div', 'al-txt');
    txt.append(h('b', null, a.text));
    if (a.sub) txt.append(h('span', 'w-sub', a.sub));
    row.append(h('span', 'al-icon', a.icon || '•'), txt);
    if (a.onDismiss) row.append(closeBtn('Seen', a.onDismiss));
    return row;
  }
  function phoneRow(n, icon) {
    const row = h('div', 'al-item al-phone');
    const txt = h('div', 'al-txt');
    const top = h('div', 'al-top');
    top.append(h('b', null, icon ? `📱 ${n.title}` : n.title), h('span', 'al-time', when(n.time)));
    txt.append(top);
    if (n.body) txt.append(h('span', 'al-body', n.body));
    row.append(txt, closeBtn('Remove (also from your PC)', () => dismissPhone(n.id)));
    return row;
  }

  // Full list (tile in the normal layout, or the "All notifications" pop-up)
  function fullList(alerts, phoneItems, more) {
    const list = h('div', 'al-list');
    alerts.forEach((a) => list.append(alertRow(a)));
    if (phoneItems.length) {
      const title = h('div', 'al-section');
      title.append(h('span', null, '📱 Phone'));
      if (more) title.append(h('span', 'w-sub', `+${more} more`));
      list.append(title);
      phoneItems.forEach((n) => list.append(phoneRow(n, false)));
    }
    return list;
  }

  // Portrait new design: the 3 most important. Wide landscape: as many as fit completely in the tile.
  // The rest via the "All notifications" button.
  const COMPACT = 3;
  const compact = () => (document.querySelector('.dashboard.desk') ? 'desk' : document.querySelector('.dashboard.tall') ? 'tall' : null);
  let allPanel = null;
  function openAll() {
    if (!allPanel) {
      allPanel = DASH.panel('All notifications', 'var(--c)');
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
    if (!list.children.length) list.append(h('p', 'w-note', 'All quiet.'));
    allPanel.body.replaceChildren(list);
  }

  function render() {
    const alerts = DASH.allAlerts().sort((a, b) => ORDER[a.level] - ORDER[b.level]);
    const total = alerts.length + (phone ? phone.length : 0);
    if (allPanel && allPanel.dialog.open) fillAll();

    // Focus mode (focus.js): notifications muted until the timer is done, only the number waiting
    if (DASH.focus) {
      card.classList.remove('al-urgent');
      const box = h('div', 'al-calm al-muted');
      box.append(h('div', 'al-check', '🔕'), h('div', 'w-mid', `Muted until ${fmtTime(DASH.focus.until)}`));
      box.append(h('p', 'w-sub', total ? `${total} ${total === 1 ? 'notification waits' : 'notifications wait'} until after your focus` : 'Focus mode is on'));
      body.replaceChildren(box);
      return;
    }
    card.classList.toggle('al-urgent', alerts.some((a) => a.level === 'urgent'));

    if (!total) {
      const box = h('div', 'al-calm');
      box.append(h('div', 'al-check', '✓'), h('div', 'w-mid', 'All quiet'));
      if (helperError) box.append(h('p', 'w-sub al-helper', helperError));
      body.replaceChildren(box);
      return;
    }

    let list, more = null, rows = null;
    const mode = compact();
    if (mode) {
      // Most important first (urgent, then your phone, then the rest)
      rows = [...alerts.filter((a) => a.level === 'urgent').map(alertRow), ...(phone || []).map((n) => phoneRow(n, true)), ...alerts.filter((a) => a.level !== 'urgent').map(alertRow)];
      list = h('div', 'al-list al-fit');
      list.append(...(mode === 'tall' ? rows.slice(0, COMPACT) : rows));
      more = h('button', 'w-btn ghost al-more', `All notifications (${rows.length}) →`);
      more.type = 'button';
      more.onclick = openAll;
      more.hidden = mode === 'tall' ? rows.length <= COMPACT : true;
    } else {
      const phoneItems = (phone || []).slice(0, PHONE_SHOW);
      list = fullList(alerts, phoneItems, phone && phone.length > PHONE_SHOW ? phone.length - PHONE_SHOW : 0);
    }

    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(total));
    big.append(h('small', null, total === 1 ? 'notification' : 'notifications'));
    head.append(big);
    body.replaceChildren(head, list);
    // Wide landscape: the button to the right of the number, so it never sticks out below the tile when space is tight
    if (more && mode === 'desk') head.append(more);
    else if (more) body.append(more);
    if (helperError) body.append(h('p', 'w-sub al-helper', helperError));
    if (mode === 'desk') fitRows();
  }

  // Wide landscape: leave out cards that don't fit completely (no cards cut in half)
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
      more.hidden = false;   // the button takes up space itself too
      while (shown > 1 && overflowing()) rows[--shown].hidden = true;
    }
  }
  new ResizeObserver(() => { if (compact() === 'desk') fitRows(); }).observe(card);
  window.addEventListener('dash:layout', () => render());


  // ---------- Phone via the helper ----------
  async function loadPhone() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      let res = await fetch(`${HELPER}/notifications`, { signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 404) res = await fetch(`${HELPER}/meldingen`, { signal: ctrl.signal, cache: 'no-store' });   // helper from before 1.7.0
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      phone = data.items || [];
      helperError = null;
      DASH.store.set('helper.seen', true);
    } catch (e) {
      phone = null;
      // On the phone or another PC (laptop after logging in with the bundle) there's no helper: say nothing about it
      // there. Only where it did run before (helper.seen) is "start the helper" useful.
      helperError = window.matchMedia('(max-width: 700px)').matches || DASH.DEMO || !DASH.store.get('helper.seen') ? null
        : e.name === 'AbortError' || e instanceof TypeError ? 'Phone notifications: start the helper on this PC (README, step 8).' : e.message;
    }
    render();
  }

  async function dismissPhone(id) {
    phone = (phone || []).filter((n) => n.id !== id);
    render();
    try { const r = await fetch(`${HELPER}/dismiss/${id}`, { method: 'POST' }); if (r.status === 404 || r.status === 403) await fetch(`${HELPER}/weg/${id}`, { method: 'POST' }); } catch {}
  }

  window.addEventListener('dash:alerts', guard(render));
  window.addEventListener('dash:focus', guard(render));
  DASH.every(20 * 1000, guard(loadPhone));
  render();
  loadPhone();
});
