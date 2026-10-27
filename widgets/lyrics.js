'use strict';

// Songtekst naast de speler. Spotify geeft zelf geen teksten via hun API; deze komen van LRCLIB (gratis, geen sleutel).
// Gesynchroniseerde teksten lopen mee met het nummer; klik op een regel om daarheen te spoelen.
DASH.widget('lyrics', (card, body, guard) => {
  const { h, store } = DASH;
  const dash = document.querySelector('.dashboard');
  const btn = document.getElementById('lyrics-btn');
  const box = document.getElementById('ly-scroll');
  const KEY = 'lyrics.open';
  const API = 'https://lrclib.net/api';

  const cache = new Map();        // track-id → { lines: [{t, text}] | null, plain: string | null, instrumental }
  let shown = null;               // track-id die nu in het vak staat
  let lines = null;
  let active = -1;
  let userScrollUntil = 0;
  let tickTimer = null;

  // ---------- Openen / sluiten ----------
  function setOpen(open) {
    card.hidden = !open;
    dash.classList.toggle('lyrics-open', open);
    btn.setAttribute('aria-pressed', String(open));
    store.set(KEY, open);
    clearInterval(tickTimer);
    if (open) {
      show(window.DASH_TRACK);
      tickTimer = setInterval(guard(tick), 250);
    }
  }
  btn.addEventListener('click', () => setOpen(card.hidden));
  document.getElementById('lyrics-close').addEventListener('click', () => setOpen(false));

  // ---------- Ophalen ----------
  // "winter 4ever - Sped Up" → "winter 4ever"; ook (Remastered 2009), feat. enz.
  const clean = (s) => s
    .replace(/\s*[-–]\s*(sped up|slowed.*|nightcore|remaster(ed)?.*|live.*|radio edit|single version|mono|stereo).*$/i, '')
    .replace(/\s*[([](sped up|slowed[^)\]]*|feat\.[^)\]]*|with [^)\]]*|remaster[^)\]]*|\d{4} remaster[^)\]]*)[)\]]/gi, '')
    .trim();

  const parseLrc = (lrc) => lrc.split('\n').map((row) => {
    const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    return m ? { t: (Number(m[1]) * 60 + Number(m[2])) * 1000, text: m[3].trim() } : null;
  }).filter(Boolean);

  async function find(track) {
    const durS = Math.round(track.duration / 1000);
    // 1. Exact op titel, artiest, album en duur
    const exact = await fetch(`${API}/get?${new URLSearchParams({ track_name: track.name, artist_name: track.artist, album_name: track.album, duration: durS })}`);
    if (exact.ok) return { hit: await exact.json(), scale: 1 };
    // 2. Zoeken met een opgeschoonde titel; dichtstbijzijnde duur met tekst wint
    const name = clean(track.name);
    const res = await fetch(`${API}/search?${new URLSearchParams({ track_name: name, artist_name: track.artist })}`);
    let list = res.ok ? await res.json() : [];
    if (!list.length && name !== track.name) {
      const r2 = await fetch(`${API}/search?${new URLSearchParams({ q: `${name} ${track.artist}` })}`);
      list = r2.ok ? await r2.json() : [];
    }
    const withText = list.filter((x) => x.syncedLyrics || x.plainLyrics || x.instrumental);
    if (!withText.length) return null;
    withText.sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || Math.abs(a.duration - durS) - Math.abs(b.duration - durS));
    const hit = withText[0];
    // Sped up / slowed versie: de tijden van het origineel naar deze versie omrekenen
    const ratio = hit.duration ? durS / hit.duration : 1;
    return { hit, scale: Math.abs(ratio - 1) > 0.03 && ratio > 0.5 && ratio < 1.6 ? ratio : 1 };
  }

  async function load(track) {
    if (cache.has(track.id)) return cache.get(track.id);
    let entry = { lines: null, plain: null, instrumental: false };
    const found = await find(track);
    if (found) {
      const { hit, scale } = found;
      entry = {
        lines: hit.syncedLyrics ? parseLrc(hit.syncedLyrics).map((l) => ({ ...l, t: l.t * scale })) : null,
        plain: hit.plainLyrics || null,
        instrumental: !!hit.instrumental,
      };
    }
    cache.set(track.id, entry);
    return entry;
  }

  // ---------- Tonen ----------
  function note(text) {
    lines = null;
    box.classList.remove('plain');
    box.replaceChildren(h('p', 'ly-note', text));
  }

  async function show(track) {
    if (card.hidden) return;
    if (!track) { shown = null; return note('Speel een nummer af om de songtekst te zien.'); }
    if (shown === track.id) return;
    shown = track.id;
    note('Songtekst zoeken…');
    let entry;
    try {
      entry = await load(track);
    } catch {
      if (shown === track.id) note('Kon de songtekst niet ophalen. Probeer het zo nog eens.');
      cache.delete(track.id);
      shown = null;
      return;
    }
    if (shown !== track.id) return; // intussen een ander nummer
    active = -1;
    box.scrollTop = 0;
    if (entry.instrumental) return note('Instrumentaal ♪');
    if (entry.lines && entry.lines.length) {
      lines = entry.lines;
      box.classList.remove('plain');
      box.replaceChildren(...lines.map((l, i) => {
        const p = h('p', 'ly-line', l.text || '♪');
        p.dataset.i = i;
        return p;
      }));
      tick();
      return;
    }
    if (entry.plain) {
      lines = null;
      box.classList.add('plain');
      box.replaceChildren(h('p', 'ly-note', 'Niet gesynchroniseerd'), ...entry.plain.split('\n').map((t) => h('p', 'ly-line', t || ' ')));
      return;
    }
    note('Geen songtekst gevonden voor dit nummer.');
  }

  // Huidige regel oplichten en in het midden houden (behalve vlak nadat je zelf scrolt)
  function tick() {
    if (!lines || card.hidden || typeof window.spotifyPosition !== 'function') return;
    const pos = window.spotifyPosition() + 250;
    let idx = -1;
    for (let i = 0; i < lines.length && lines[i].t <= pos; i++) idx = i;
    if (idx === active) return;
    active = idx;
    box.querySelectorAll('.ly-line').forEach((p, i) => {
      p.classList.toggle('now', i === idx);
      p.classList.toggle('past', i < idx);
    });
    const cur = box.children[idx];
    if (cur && Date.now() > userScrollUntil) {
      box.scrollTo({ top: cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2, behavior: 'smooth' });
    }
  }

  ['wheel', 'touchmove', 'pointerdown'].forEach((type) => box.addEventListener(type, () => { userScrollUntil = Date.now() + 4000; }, { passive: true }));
  box.addEventListener('click', (e) => {
    const p = e.target.closest('.ly-line');
    if (!p || !lines || !window.spotifySeek) return;
    const l = lines[Number(p.dataset.i)];
    if (l) { userScrollUntil = 0; window.spotifySeek(Math.round(l.t)); }
  });

  window.addEventListener('dash:track', guard((e) => show(e.detail)));
  if (store.get(KEY)) setOpen(true);
});
