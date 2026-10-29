'use strict';

// Instellingen (sinds 0.44.0): tandwiel in de topbalk (naast minimaliseren) → paneel met tabjes, in de stijl van de pop-ups.
// Elk onderdeel meldt zelf een tabje aan: DASH_SETTINGS.add({ id, label, order, render(el) }), zodat er later makkelijk
// tabjes bij kunnen (nu alleen Thema, uit themes.js). Esc, Sluiten of klikken naast het paneel sluit. Gekozen tabje in
// localStorage settings.tab (via DASH.store, dus in try/catch). Op de telefoon schermvullend.
window.DASH_SETTINGS = (() => {
  const { h, store } = DASH;
  const sections = [];
  let dlg = null, tabs = null, body = null, active = store.get('settings.tab');

  function add(section) {
    sections.push(section);
    sections.sort((a, b) => (a.order || 50) - (b.order || 50));
    if (dlg && dlg.open) render();
  }

  function build() {
    dlg = h('dialog', 'panel-dialog settings-dialog');
    dlg.setAttribute('aria-label', 'Instellingen');
    const head = h('div', 'panel-head');
    const close = h('button', 'w-btn ghost', 'Sluiten');
    close.type = 'button';
    close.onclick = () => dlg.close();
    head.append(h('b', null, 'Instellingen'), h('span', 'st-hint', 'Esc'), close);
    tabs = h('div', 'st-tabs');
    tabs.setAttribute('role', 'tablist');
    body = h('div', 'st-body');
    dlg.append(head, tabs, body);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => btn.setAttribute('aria-pressed', 'false'));
    document.body.append(dlg);
  }

  function render() {
    if (!sections.some((s) => s.id === active)) active = sections[0] && sections[0].id;
    tabs.replaceChildren();
    for (const s of sections) {
      const b = h('button', 'st-tab', s.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.id === active));
      b.onclick = () => { active = s.id; store.set('settings.tab', active); render(); };
      tabs.append(b);
    }
    tabs.append(h('span', 'st-tab st-later', 'later meer…'));
    body.replaceChildren();
    const section = sections.find((s) => s.id === active);
    if (section) section.render(body);
  }

  function open(id) {
    if (!dlg) build();
    if (id) active = id;
    render();
    dlg.showModal();
    btn.setAttribute('aria-pressed', 'true');
  }

  // ---------- Tandwiel ----------
  const actions = document.querySelector('#topbar .tb-actions');
  const btn = h('button', 'tb-btn tb-settings');
  btn.type = 'button';
  btn.title = 'Instellingen';
  btn.setAttribute('aria-label', 'Instellingen');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54a7.4 7.4 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>';
  btn.onclick = () => (dlg && dlg.open ? dlg.close() : open());
  if (actions) actions.insertBefore(btn, actions.querySelector('.tb-min'));

  return { add, open };
})();
