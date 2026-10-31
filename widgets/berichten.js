'use strict';

// Berichten + "Spotify nu" voor Mensen (sinds 0.51.0, fase 2 van het groot idee "Mensen"). Alleen GitHub, geen server:
// per persoon met Spotify nu of Berichtenvak een eigen privé repo (config.json → mensen[].live = { repo, token }, ingesteld
// in Instellingen › Mensen; token = fine-grained, alleen die repo). Dit vak leest die koppelingen met het archief-token
// (alleen in het geheugen) en:
// - Berichten: berichten/noah.json (van Noah) en berichten/<id>.json (van die persoon), elk [{ t, text }]. Elke 5 s
//   kijken met ETag (304 telt niet mee voor de limiet), op de achtergrond elke minuut. Nieuw bericht = melding.
// - Spotify nu: bij elk nieuw nummer, pauze of verder spelen nu.json schrijven. Werkt dus alleen zolang dit dashboard
//   ergens open staat (het staande scherm). Hun pagina (mensen-view.js) rekent zelf uit of het nummer nog loopt.
// Berichten komen nooit in het archief.
DASH.widget('w-msg', (card, body, guard) => {
  const { h, store } = DASH;
  const G = window.GHFILE;
  const MAX = 200;
  let people = [];          // [{ id, naam, live, berichten, spotify }]
  const chats = new Map();  // id -> { mine, theirs, etag: {m, t} }
  let pop = null;

  const fmt = (iso) => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const seenKey = (id) => `berichten.seen.${id}`;

  async function loadPeople() {
    const D = window.DASH_DATA;
    if (DASH.DEMO || !D || !D.token() || !G) { people = []; return; }
    const f = await D.read('config.json');
    people = ((f && JSON.parse(f.text).mensen) || [])
      .filter((p) => p.live && p.live.repo && p.live.token)
      .map((p) => ({ id: p.id, naam: p.naam, live: p.live, berichten: (p.onderdelen || []).includes('berichten'), spotify: (p.onderdelen || []).includes('spotify') }));
  }

  // ---------- Berichten ----------
  async function poll(p) {
    const c = chats.get(p.id) || { mine: [], theirs: [], etag: {} };
    chats.set(p.id, c);
    const [m, t] = await Promise.all([
      G.get(p.live.repo, p.live.token, 'berichten/noah.json', c.etag.m),
      G.get(p.live.repo, p.live.token, `berichten/${p.id}.json`, c.etag.t),
    ]);
    let changed = false;
    if (m.status !== 304) { c.mine = m.data || []; c.etag.m = m.etag; changed = true; }
    if (t.status !== 304) { c.theirs = t.data || []; c.etag.t = t.etag; changed = true; }
    return changed;
  }

  const merged = (c) => [...c.mine.map((x) => ({ ...x, me: true })), ...c.theirs].sort((a, b) => a.t.localeCompare(b.t));
  const unread = (p) => { const c = chats.get(p.id); const seen = store.get(seenKey(p.id)) || ''; return c ? c.theirs.filter((x) => x.t > seen) : []; };
  function markSeen(p) {
    const c = chats.get(p.id);
    if (c && c.theirs.length) store.set(seenKey(p.id), c.theirs[c.theirs.length - 1].t);
    alerts();
    render();
  }

  function alerts() {
    const list = people.filter((p) => p.berichten).map((p) => [p, unread(p)]).filter(([, u]) => u.length)
      .map(([p, u]) => ({ level: 'info', icon: '💬', text: u.length === 1 ? `Bericht van ${p.naam}` : `${u.length} berichten van ${p.naam}`, sub: u[u.length - 1].text.slice(0, 80), onClick: () => open(p) }));
    DASH.alert('berichten', list.length ? list : null);
  }

  async function send(p, text, input, btn) {
    text = text.trim().slice(0, 500);
    if (!text) return;
    btn.disabled = true;
    try {
      const c = chats.get(p.id);
      c.mine = await G.update(p.live.repo, p.live.token, 'berichten/noah.json', (cur) => [...(cur || []), { t: new Date().toISOString(), text }].slice(-MAX), 'Bericht van Noah');
      c.etag.m = null;
      input.value = '';
      markSeen(p);
      fillPop(p);
    } catch (e) {
      input.placeholder = `Niet verstuurd: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  function bubbles(p, n) {
    const list = h('div', 'msg-list');
    const items = merged(chats.get(p.id) || { mine: [], theirs: [] });
    if (!items.length) list.append(h('p', 'w-note', `Nog geen berichten met ${p.naam}.`));
    for (const x of items.slice(-n)) {
      const b = h('div', `msg-b${x.me ? ' me' : ''}`);
      b.append(h('span', null, x.text), h('small', null, fmt(x.t)));
      list.append(b);
    }
    return list;
  }

  function fillPop(p) {
    if (!pop || !pop.dialog.open || pop.person !== p.id) return;
    const list = bubbles(p, 100);
    pop.body.querySelector('.msg-list').replaceWith(list);
    list.scrollTop = list.scrollHeight;
  }

  function open(p) {
    if (!pop) {
      pop = DASH.panel('Berichten', '#e98bd3');
      pop.dialog.classList.add('msg-dialog');
    }
    pop.person = p.id;
    pop.head.querySelector('b').textContent = `Berichten met ${p.naam}`;
    const form = h('form', 'msg-form');
    const input = h('input', 'msg-input');
    Object.assign(input, { placeholder: 'Typ een bericht…', maxLength: 500, autocomplete: 'off' });
    const btn = h('button', 'w-btn', 'Stuur');
    btn.type = 'submit';
    form.append(input, btn);
    form.onsubmit = (e) => { e.preventDefault(); send(p, input.value, input, btn); };
    pop.body.replaceChildren(h('div', 'msg-list'), form);
    pop.open();
    fillPop(p);
    markSeen(p);
    input.focus();
  }

  function render() {
    const talk = people.filter((p) => p.berichten);
    card.hidden = !talk.length;
    if (!talk.length) return;
    const parts = [];
    for (const p of talk) {
      const u = unread(p).length;
      const head = h('div', 'msg-head');
      head.append(h('b', null, p.naam), u ? h('span', 'msg-new', `${u} nieuw`) : '');
      const btn = h('button', 'w-btn', 'Openen');
      btn.type = 'button';
      btn.onclick = () => open(p);
      parts.push(head, bubbles(p, 3), btn);
    }
    body.replaceChildren(...parts);
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      let changed = false;
      for (const p of people.filter((x) => x.berichten)) changed = (await poll(p)) || changed;
      if (changed) {
        alerts();
        render();
        if (pop && pop.dialog.open) { const p = people.find((x) => x.id === pop.person); if (p) { fillPop(p); markSeen(p); } }
      }
    } catch (e) {
      console.warn('[berichten]', e);
    } finally {
      busy = false;
    }
  }

  // ---------- Spotify nu ----------
  let lastNow = '';
  async function writeNow() {
    const targets = people.filter((p) => p.spotify);
    const t = window.DASH_TRACK;
    if (!targets.length || !window.spotifyPosition) return;
    const playing = !!document.getElementById('spotify')?.classList.contains('playing');
    const cover = document.getElementById('cover');
    const now = t ? { playing, title: t.name, artist: t.artist, album: t.album, cover: cover && cover.src && /^https:/.test(cover.src) ? cover.src : null, progress: Math.round(window.spotifyPosition() || 0), duration: t.duration, at: new Date().toISOString() }
      : { playing: false, at: new Date().toISOString() };
    const key = JSON.stringify([now.title, now.playing]);
    if (key === lastNow) return;
    lastNow = key;
    for (const p of targets) {
      // Niets meer aan het spelen: het laatste nummer laten staan (hun pagina toont dan "om 18:05")
      G.update(p.live.repo, p.live.token, 'nu.json', (cur) => (t || !cur || !cur.title ? now : { ...cur, playing: false }), 'Spotify nu').catch((e) => console.warn('[berichten] spotify nu', p.id, e));
    }
  }

  async function start() {
    try { await loadPeople(); } catch (e) { console.warn('[berichten] config', e); }
    render();
    alerts();
    tick();
    writeNow();
  }

  window.addEventListener('dash:track', guard(() => setTimeout(writeNow, 1500)));
  // Pauze/verder spelen geeft geen nieuw nummer: elke 30 s kijken of dat veranderde (schrijft alleen bij een verandering)
  setInterval(() => { if (people.some((p) => p.spotify)) writeNow(); }, 30000);
  setInterval(() => { if (!document.hidden) tick(); }, 5000);
  setInterval(() => { if (document.hidden) tick(); }, 60000);
  setInterval(start, 30 * 60 * 1000);
  window.addEventListener('dash:data-token', guard(start));
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !document.hidden) people.filter((p) => p.berichten && unread(p).length).forEach(markSeen); }).observe(card);
  guard(start)();
});
