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

  function render() {
    const alerts = DASH.allAlerts().sort((a, b) => ORDER[a.level] - ORDER[b.level]);
    const phoneItems = (phone || []).slice(0, PHONE_SHOW);
    const total = alerts.length + (phone ? phone.length : 0);
    card.classList.toggle('al-urgent', alerts.some((a) => a.level === 'urgent'));

    if (!total) {
      const box = h('div', 'al-calm');
      box.append(h('div', 'al-check', '✓'), h('div', 'w-mid', 'Niks aan de hand'));
      if (helperError) box.append(h('p', 'w-sub al-helper', helperError));
      body.replaceChildren(box);
      return;
    }

    const list = h('div', 'al-list');
    for (const a of alerts) {
      const row = h(a.onClick ? 'button' : 'div', `al-item lv-${a.level}`);
      if (a.onClick) { row.type = 'button'; row.onclick = a.onClick; }
      const txt = h('div', 'al-txt');
      txt.append(h('b', null, a.text));
      if (a.sub) txt.append(h('span', 'w-sub', a.sub));
      row.append(h('span', 'al-icon', a.icon || '•'), txt);
      if (a.onDismiss) row.append(closeBtn('Gezien', a.onDismiss));
      list.append(row);
    }

    if (phoneItems.length) {
      const title = h('div', 'al-section');
      title.append(h('span', null, '📱 Telefoon'));
      if (phone.length > PHONE_SHOW) title.append(h('span', 'w-sub', `+${phone.length - PHONE_SHOW} meer`));
      list.append(title);
      for (const n of phoneItems) {
        const row = h('div', 'al-item al-phone');
        const txt = h('div', 'al-txt');
        const top = h('div', 'al-top');
        top.append(h('b', null, n.title), h('span', 'al-time', when(n.time)));
        txt.append(top);
        if (n.body) txt.append(h('span', 'al-body', n.body));
        row.append(txt, closeBtn('Weghalen (ook van je pc)', () => dismissPhone(n.id)));
        list.append(row);
      }
    }

    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(total));
    big.append(h('small', null, total === 1 ? 'melding' : 'meldingen'));
    head.append(big);
    body.replaceChildren(head, list);
    if (helperError) body.append(h('p', 'w-sub al-helper', helperError));
  }

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
  DASH.every(20 * 1000, guard(loadPhone));
  render();
  loadPhone();
});
