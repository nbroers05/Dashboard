'use strict';

// Eigen versie voor iemand anders (mensen.html?<id>, sinds 0.50.0). Haalt alleen mensen/<id>.json op (versleuteld door
// scripts/mensen.py in dashboard-data), vraagt het wachtwoord, leidt de sleutel af (PBKDF2, zelfde salt/rondes als in het
// pakketje) en toont alleen wat erin zit. "Onthouden" bewaart de afgeleide sleutel (niet het wachtwoord) in localStorage,
// anders in sessionStorage. Elke 10 minuten opnieuw ophalen.
(() => {
  const app = document.getElementById('app');
  const id = location.search.slice(1).split('&')[0].split('=')[0].toLowerCase();
  const KEY = `mensen.${id}.key`;
  const enc = new TextEncoder();
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const ls = (s, k, v) => { try { if (v === undefined) return s.getItem(k); if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { return null; } return null; };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  async function fetchBox() {
    if (!/^[a-z][a-z0-9-]{1,23}$/.test(id)) return null;
    const res = await fetch(`mensen/${id}.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? res.json() : null;
  }

  async function deriveRaw(password, box) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(box.salt), iterations: box.iter }, base, 256);
  }

  async function decrypt(raw, box) {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  const savedKey = () => ls(localStorage, KEY) || ls(sessionStorage, KEY);
  function forget() { ls(localStorage, KEY, null); ls(sessionStorage, KEY, null); }

  function gone() {
    forget();
    app.replaceChildren(el('div', 'card', 'Deze pagina bestaat niet (meer).'));
  }

  function login(box, error) {
    const card = el('div', 'card');
    const form = el('form');
    const pw = el('input');
    Object.assign(pw, { type: 'password', placeholder: 'Wachtwoord', autocomplete: 'current-password', required: true });
    const rem = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    rem.append(cb, el('span', null, 'Onthouden op dit apparaat'));
    const go = el('button', null, 'Openen');
    const err = el('p', 'err', error || '');
    form.append(el('h1', null, 'Noah'), el('p', 'sub', 'Deze pagina is beveiligd met een wachtwoord.'), pw, rem, go, err);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true;
      go.textContent = 'Bezig…';
      try {
        const raw = await deriveRaw(pw.value, box);
        const data = await decrypt(raw, box);
        ls(cb.checked ? localStorage : sessionStorage, KEY, b64(raw));
        show(data);
      } catch {
        err.textContent = 'Verkeerd wachtwoord';
        go.disabled = false;
        go.textContent = 'Openen';
        pw.select();
      }
    });
    card.append(form);
    app.replaceChildren(card);
    pw.focus();
  }

  // ---------- Tonen ----------
  const dayFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  const hm = (iso) => iso.slice(11, 16);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const NAMES = { 'ah': 'AH', 'college': 'College', 'tentamen': 'Tentamen' };

  function agenda(o) {
    const items = [...(o.ah || []).map((b) => ({ ...b, soort: 'ah' })), ...(o.studie || [])].sort((a, b) => a.start.localeCompare(b.start));
    const card = el('div', 'card');
    card.append(el('h2', null, o.ah && o.studie ? 'Werk en studie' : o.ah ? 'Werk' : 'Colleges en tentamens'));
    if (!items.length) card.append(el('p', 'muted', 'Niets gepland de komende drie weken.'));
    let last = '';
    const now = new Date();
    for (const b of items) {
      const d = cap(dayFmt.format(new Date(b.start)).replace('.', ''));
      const r = el('div', `row${new Date(b.eind) < now ? ' past' : ''}`);
      const what = el('span');
      what.append(el('i', `tag ${b.soort}`), document.createTextNode(`${NAMES[b.soort] || b.soort} · ${hm(b.start)} – ${hm(b.eind)}`));
      r.append(el('span', 'day', d === last ? '' : d), what);
      last = d;
      card.append(r);
    }
    return card;
  }

  function film(f) {
    const card = el('div', 'card');
    card.append(el('h2', null, 'Laatst gekeken'));
    const row = el('div', 'film');
    if (f.poster) { const img = el('img'); img.src = f.poster; img.alt = ''; row.append(img); }
    const t = el('div');
    t.append(el('div', 'big', f.title || '?'));
    const r = Number(f.rating) || 0;
    t.append(el('div', 'stars', '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '')), el('div', 'muted', [f.year, f.watched && new Date(f.watched).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), f.rewatch ? 'opnieuw gekeken' : ''].filter(Boolean).join(' · ')));
    row.append(t);
    card.append(row);
    return card;
  }

  function weather() {
    const card = el('div', 'card');
    card.append(el('h2', null, 'Weer bij Noah (Rotterdam)'));
    const p = el('div', 'big', '…');
    card.append(p);
    const CODES = { 0: 'helder', 1: 'vrijwel helder', 2: 'half bewolkt', 3: 'bewolkt', 45: 'mist', 48: 'mist', 51: 'motregen', 53: 'motregen', 55: 'motregen', 61: 'lichte regen', 63: 'regen', 65: 'zware regen', 71: 'sneeuw', 73: 'sneeuw', 75: 'sneeuw', 80: 'buien', 81: 'buien', 82: 'zware buien', 95: 'onweer' };
    fetch('https://api.open-meteo.com/v1/forecast?latitude=51.92&longitude=4.48&current=temperature_2m,weather_code&timezone=Europe%2FAmsterdam')
      .then((r) => r.json()).then((d) => { p.textContent = `${Math.round(d.current.temperature_2m)}° · ${CODES[d.current.weather_code] || ''}`; })
      .catch(() => { p.textContent = 'weer niet beschikbaar'; });
    return card;
  }

  // ---------- Live (sinds 0.51.0): Spotify nu en berichten, via hun eigen privé repo (GHFILE, ghfile.js) ----------
  let timers = [];
  function stopLive() { timers.forEach(clearInterval); timers = []; }

  function spotifyCard(l) {
    const card = el('div', 'card');
    card.append(el('h2', null, 'Noah luistert'));
    let box = el('div', 'muted', '…');
    card.append(box);
    let etag = null;
    async function load() {
      try {
        const r = await GHFILE.get(l.repo, l.token, 'nu.json', etag);
        if (r.status === 304) return;
        etag = r.etag;
        const n = r.data;
        const left = n && n.playing && n.duration ? Date.parse(n.at) + (n.duration - (n.progress || 0)) + 30000 - Date.now() : -1;
        if (!n || !n.title) { box.replaceWith(box = el('div', 'muted', 'Nu niets.')); return; }
        const row = el('div', 'now');
        if (n.cover) { const img = el('img'); img.src = n.cover; img.alt = ''; row.append(img); }
        const t = el('div');
        t.append(el('div', 'muted', left > 0 ? 'nu' : `om ${new Date(n.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`), el('div', 'big', n.title), el('div', null, n.artist || ''));
        row.append(t);
        box.replaceWith(box = row);
      } catch (e) { box.replaceWith(box = el('div', 'muted', `Niet beschikbaar (${e.message})`)); }
    }
    load();
    timers.push(setInterval(() => { if (!document.hidden) { etag = null; load(); } }, 20000));
    return card;
  }

  function chatCard(l, data) {
    const card = el('div', 'card');
    card.append(el('h2', null, 'Berichten'));
    const list = el('div', 'chat');
    const form = el('form', 'send');
    const input = el('input');
    Object.assign(input, { placeholder: 'Typ een bericht…', maxLength: 500, autocomplete: 'off' });
    const btn = el('button', null, '➤');
    form.append(input, btn);
    card.append(list, form);
    const mine = `berichten/${id}.json`;
    const st = { me: [], noah: [], etag: {} };
    function draw() {
      const items = [...st.me.map((x) => ({ ...x, me: true })), ...st.noah].sort((a, b) => a.t.localeCompare(b.t));
      const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
      list.replaceChildren(...(items.length ? items.slice(-100).map((x) => {
        const b = el('div', `b${x.me ? ' me' : ''}`, x.text);
        b.append(el('small', null, new Date(x.t).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })));
        return b;
      }) : [el('p', 'muted', `Nog geen berichten. Typ hieronder iets voor Noah.`)]));
      if (atEnd) list.scrollTop = list.scrollHeight;
    }
    async function poll() {
      try {
        const [a, b] = await Promise.all([GHFILE.get(l.repo, l.token, mine, st.etag.me), GHFILE.get(l.repo, l.token, 'berichten/noah.json', st.etag.noah)]);
        let ch = false;
        if (a.status !== 304) { st.me = a.data || []; st.etag.me = a.etag; ch = true; }
        if (b.status !== 304) { st.noah = b.data || []; st.etag.noah = b.etag; ch = true; }
        if (ch) draw();
      } catch (e) { input.placeholder = `Niet verbonden (${e.message})`; }
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim().slice(0, 500);
      if (!text) return;
      btn.disabled = true;
      try {
        st.me = await GHFILE.update(l.repo, l.token, mine, (cur) => [...(cur || []), { t: new Date().toISOString(), text }].slice(-200), `Bericht van ${data.naam}`);
        st.etag.me = null;
        input.value = '';
        draw();
        list.scrollTop = list.scrollHeight;
      } catch (x) { input.placeholder = `Niet verstuurd: ${x.message}`; }
      btn.disabled = false;
    });
    draw();
    poll();
    timers.push(setInterval(() => { if (!document.hidden) poll(); }, 5000));
    return card;
  }

  function show(data) {
    stopLive();
    const o = data.onderdelen || {};
    const l = data.live;
    const head = el('div', 'card');
    head.append(el('h1', null, 'Noah'), el('p', 'sub', `voor ${data.naam}${l && l.berichten ? '' : ' · alleen kijken'}`));
    const cards = [head];
    if (l && l.spotify) cards.push(spotifyCard(l));
    if (l && l.berichten) cards.push(chatCard(l, data));
    if (o.ah || o.studie) cards.push(agenda(o));
    if (o.uren) {
      const c = el('div', 'card');
      c.append(el('h2', null, 'Deze week'), el('div', 'big', `${String(o.uren.uren).replace('.', ',')} uur AH`));
      cards.push(c);
    }
    if (o.film) cards.push(film(o.film));
    if (o.weer) cards.push(weather());
    if (cards.length === 1) cards.push(el('div', 'card muted', 'Er staat hier nu niets voor je aan.'));
    const foot = el('footer');
    const out = el('button', 'link', 'Uitloggen');
    out.onclick = () => { stopLive(); forget(); start(); };
    foot.append(el('span', null, data.bijgewerkt ? `bijgewerkt ${new Date(data.bijgewerkt).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''), out);
    cards.push(foot);
    app.replaceChildren(...cards);
  }

  async function start() {
    let box;
    try { box = await fetchBox(); } catch { app.replaceChildren(el('div', 'card', 'Geen verbinding. Probeer het zo opnieuw.')); return; }
    if (!box) return gone();
    lastData = box.data;
    const k = savedKey();
    if (!k) return login(box);
    try {
      show(await decrypt(unb64(k), box));
    } catch {
      forget();   // wachtwoord gewijzigd of toegang ingetrokken
      login(box, 'Het wachtwoord is veranderd. Log opnieuw in.');
    }
  }

  // Elke 10 minuten een nieuw pakketje? Alleen dan opnieuw tekenen (anders zou een half getypt bericht verdwijnen)
  let lastData = null;
  start();
  setInterval(async () => {
    if (!savedKey() || document.hidden) return;
    const box = await fetchBox().catch(() => null);
    if (!box) return gone();
    if (box.data !== lastData) { lastData = box.data; start(); }
  }, 10 * 60 * 1000);
})();
