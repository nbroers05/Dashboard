'use strict';

// Film van vanavond: de bovenste film van je watchlist volgens de Sterrenvoorspeller, met poster (TMDB).
// "Voorspel een film" opent de echte Sterrenvoorspeller-popup in een paneel.
// Met Sterrenvoorspeller 0.2.2+ in Firefox stuurt de extensie je vernieuwde watchlist hierheen.
DASH.widget('w-stars', async (card, body, guard) => {
  const { h, store, nl, img } = DASH;
  const KEY = 'lbv:wl';
  const POSTERS = 'tmdb.posters';
  const TMDB_KEY = (window.DASHBOARD_CONFIG || {}).tmdbApiKey || '';
  const BASE = 'sterrenvoorspeller/';

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`Kon ${src} niet laden`));
    document.head.append(s);
  });
  // Zelfde formule en watchlist als de extensie
  await loadScript(`${BASE}lib/model-data.js`);
  await loadScript(`${BASE}lib/model.js`);
  await loadScript(`${BASE}popup/watchlist.js`);
  const M = globalThis.LBV;

  const predict = (f) => M.predict({
    crowd: f.crowd, n: f.n || 1000, jp: !!f.japans, com: !!f.komedie, fam: !!f.familie, streng: true,
    loeka: f.loeka, marijn: f.marijn == null ? null : f.marijn, regie: f.regisseur,
  }).value;

  function topFilms(n) {
    const stored = store.get(KEY);
    const list = (stored && stored.items) || globalThis.LBV_WATCHLIST || [];
    return list.filter((f) => f.crowd != null).map((f) => ({ ...f, p: predict(f) })).sort((a, b) => b.p - a.p).slice(0, n);
  }
  const topFilm = () => topFilms(1)[0];

  // Voor andere vakken (Vrienden, bioscoop): je verwachte cijfer voor een film op je watchlist, of null
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  function watchlist() {
    const stored = store.get(KEY);
    return (stored && stored.items) || globalThis.LBV_WATCHLIST || [];
  }
  function share() {
    const list = watchlist().filter((f) => f.crowd != null);
    const bySlug = new Map(list.map((f) => [f.slug, f]));
    const byTitle = new Map();
    for (const f of list) byTitle.set(norm(f.film), f);
    const result = (f) => (f ? { film: f.film, year: f.jaar, slug: f.slug, value: predict(f) } : null);
    window.DASH_FILM = {
      // slug = Letterboxd-adres van de film; anders op titel (en jaar, als dat bekend is)
      predict({ slug, title, year } = {}) {
        if (slug && bySlug.has(slug)) return result(bySlug.get(slug));
        const f = title && byTitle.get(norm(title));
        if (f && (!year || !f.jaar || Math.abs(Number(f.jaar) - Number(year)) <= 1)) return result(f);
        return null;
      },
      norm,
    };
    window.dispatchEvent(new CustomEvent('dash:watchlist'));
  }
  // In het roterende vak (staand ontwerp) is er ruimte voor de top 3 naast elkaar
  const wide = () => !!card.closest('.tall-rot');

  function addPoster(f, pbox) {
    poster(f).then((src) => {
      if (!src) return;
      const i = new Image();
      i.alt = '';
      i.onload = () => i.classList.add('loaded');
      i.onerror = () => i.remove();
      i.src = src;
      pbox.append(i);
    }).catch(() => {});
  }

  function renderTop3() {
    const films = topFilms(3);
    const row = h('div', 'film3');
    films.forEach((f, k) => {
      const a = h('a', 'film3-item');
      a.href = `https://letterboxd.com/film/${f.slug}/`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${f.film}${f.jaar ? ` (${f.jaar})` : ''} · verwacht ${nl(f.p, 2)}`;
      const pbox = img(null, 'film-poster', f.film);
      pbox.append(h('span', 'film-score', nl(f.p, 1)), h('span', 'film3-rank', String(k + 1)));
      const txt = h('div', 'film3-txt');
      txt.append(h('b', null, f.film), h('span', 'w-sub', [f.jaar, `verwacht ${nl(f.p, 2)}`].filter(Boolean).join(' · ')), h('span', 'film-stars', stars(f.p)));
      a.append(pbox, txt);
      row.append(a);
      addPoster(f, pbox);
    });
    const actions = h('div', 'film-actions film3-actions');
    const more = h('button', 'w-btn ghost', 'Voorspel een film');
    more.onclick = openPanel;
    actions.append(more);
    body.replaceChildren(row, actions);
    addCinema();
  }

  // ---------- Draait nu in de bios: films van je watchlist in het programma (data/cinema.json, Action, dagelijks) ----------
  let cinema = null;
  const when = (show) => {
    if (show.next) {
      const t = new Date(show.next).getTime();
      return `${DASH.fmtDay(t)} ${DASH.fmtTime(t)}`;
    }
    if (show.until) return `t/m ${new Date(`${show.until}T12:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '')}`;
    return 'in het programma';
  };
  function cinemaMatches() {
    if (!cinema || !window.DASH_FILM) return [];
    const now = Date.now();
    return (cinema.films || []).map((f) => {
      const mine = window.DASH_FILM.predict({ title: f.title });
      if (!mine) return null;
      // Eerstvolgende voorstelling: met tijd eerst, daarna de rest
      const shows = f.shows.filter((s) => !s.next || new Date(s.next).getTime() > now)
        .sort((a, b) => (a.next || '9').localeCompare(b.next || '9'));
      return shows.length ? { ...f, mine, show: shows[0] } : null;
    }).filter(Boolean).sort((a, b) => b.mine.value - a.mine.value);
  }
  function addCinema() {
    body.querySelector('.cine')?.remove();
    const list = cinemaMatches();
    if (!list.length) return;
    const box = h('div', 'cine');
    box.append(h('p', 'cine-head', 'Draait nu in de bios'));
    for (const f of list.slice(0, card.closest('.desk-tabs') ? 1 : 3)) {
      const a = h('a', 'cine-row');
      a.href = f.show.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${f.title} · ${f.show.cinema} · ${when(f.show)} · verwacht ${nl(f.mine.value, 2)}`;
      a.append(h('b', null, f.title), h('span', 'w-sub', `${f.show.cinema} · ${when(f.show)}`), h('span', 'cine-score', nl(f.mine.value, 1)));
      box.append(a);
    }
    body.append(box);
  }
  const loadCinema = guard(async () => {
    try {
      cinema = await DASH.getJSON(`data/cinema.json?t=${Math.floor(Date.now() / 3600000)}`);
      addCinema();
    } catch (e) {
      console.warn('[bioscoop]', e);   // geen bioscoopdata: het filmvak werkt gewoon zonder
    }
  });

  async function poster(f) {
    if (!TMDB_KEY) return null;
    const cache = store.get(POSTERS) || {};
    if (cache[f.slug] !== undefined) return cache[f.slug];
    const search = async (withYear) => {
      const q = new URLSearchParams({ api_key: TMDB_KEY, query: f.film, ...(withYear && f.jaar ? { year: f.jaar } : {}) });
      const r = await DASH.getJSON(`https://api.themoviedb.org/3/search/movie?${q}`);
      return (r.results || []).find((m) => m.poster_path);
    };
    const m = (await search(true)) || (await search(false));
    cache[f.slug] = m ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null;
    store.set(POSTERS, cache);
    return cache[f.slug];
  }

  const stars = (v) => {
    const half = Math.round(v * 2) / 2;
    return '★'.repeat(Math.floor(half)) + (half % 1 ? '½' : '');
  };

  // Paneel met de echte popup (pas gemaakt bij de eerste klik)
  let pop = null;
  function openPanel() {
    if (!pop) {
      pop = DASH.panel('Sterrenvoorspeller', 'var(--c-film)');
      const frame = h('iframe', 'panel-frame');
      frame.title = 'Sterrenvoorspeller';
      frame.src = `${BASE}popup/popup.html`;
      pop.body.append(frame);
    }
    pop.open();
  }

  async function render() {
    if (wide() && topFilms(3).length) return renderTop3();
    const f = topFilm();
    if (!f) {
      body.replaceChildren(h('p', 'w-note', 'Geen films in je watchlist gevonden.'));
      return;
    }
    const url = `https://letterboxd.com/film/${f.slug}/`;
    const wrap = h('div', 'film');
    const pbox = img(null, 'film-poster', f.film);
    pbox.append(h('span', 'film-score', nl(f.p, 1)));
    const info = h('div', 'film-info');
    info.append(
      h('div', 'w-mid', f.film),
      h('div', 'w-sub', [f.jaar, f.regisseur].filter(Boolean).join(' · ')),
      h('div', 'film-stars', stars(f.p)),
      h('div', 'w-sub', `verwacht ${nl(f.p, 2)} · crowd ${nl(f.crowd, 2)}`),
    );
    const actions = h('div', 'film-actions');
    const lb = h('a', 'w-btn lb', 'Letterboxd ↗');
    lb.href = url;
    lb.target = '_blank';
    lb.rel = 'noopener';
    const more = h('button', 'w-btn ghost', 'Voorspel een film');
    more.onclick = openPanel;
    actions.append(lb, more);
    wrap.append(pbox, info);
    body.replaceChildren(wrap, actions);
    addCinema();

    // Poster erbij zodra die binnen is; lukt het niet, dan blijft het kleurvlak met de titel
    addPoster(f, pbox);
  }
  // Andere indeling (staand/liggend): opnieuw tekenen, want het roterende vak toont de top 3
  window.addEventListener('dash:layout', guard(() => render()));

  window.addEventListener('message', guard((e) => {
    if (e.source !== window || !e.data || e.data.source !== 'sterrenvoorspeller' || !e.data.wl) return;
    const old = store.get(KEY);
    if (old && old.t === e.data.wl.t) return;
    store.set(KEY, e.data.wl);
    share();
    render();
    const frame = pop && pop.body.querySelector('iframe');
    if (frame) frame.contentWindow.location.reload();
  }));
  window.postMessage({ type: 'sterrenvoorspeller:request' }, location.origin);

  share();
  await render();
  loadCinema();
  DASH.every(3 * 3600 * 1000, loadCinema);
});
