'use strict';

// Film tonight: the top film of your watchlist according to the Sterrenvoorspeller, with a poster (TMDB).
// "Predict a film" opens the real Sterrenvoorspeller popup in a panel.
// With Sterrenvoorspeller 0.2.2+ in Firefox the extension sends your updated watchlist here.
DASH.widget('w-stars', async (card, body, guard) => {
  const { h, store, dec, img } = DASH;
  const KEY = 'lbv:wl';
  const POSTERS = 'tmdb.posters';
  const TMDB_KEY = (window.DASHBOARD_CONFIG || {}).tmdbApiKey || '';
  const BASE = 'sterrenvoorspeller/';

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`Couldn't load ${src}`));
    document.head.append(s);
  });
  // The same formula and watchlist as the extension
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

  // For other tiles (Friends, cinema): your predicted rating for a film on your watchlist, or null
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
      // slug = the film's Letterboxd address; otherwise by title (and year, if known)
      predict({ slug, title, year } = {}) {
        if (slug && bySlug.has(slug)) return result(bySlug.get(slug));
        const f = title && byTitle.get(norm(title));
        if (f && (!year || !f.jaar || Math.abs(Number(f.jaar) - Number(year)) <= 1)) return result(f);
        return null;
      },
      norm,
      // For the phone app (phone-app.js, since 1.6.0): film tonight with a predicted rating and poster
      async top() {
        const f = topFilm();
        if (!f) return null;
        return { title: f.film, year: f.jaar || null, slug: f.slug, predicted: Math.round(predict(f) * 10) / 10, poster: await poster(f).catch(() => null) };
      },
    };
    window.dispatchEvent(new CustomEvent('dash:watchlist'));
  }
  // In the rotating tile (portrait design) there's room for the top 3 side by side
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
      a.title = `${f.film}${f.jaar ? ` (${f.jaar})` : ''} · predicted ${dec(f.p, 2)}`;
      const pbox = img(null, 'film-poster', f.film);
      pbox.append(h('span', 'film-score', dec(f.p, 1)), h('span', 'film3-rank', String(k + 1)));
      const txt = h('div', 'film3-txt');
      txt.append(h('b', null, f.film), h('span', 'w-sub', [f.jaar, `predicted ${dec(f.p, 2)}`].filter(Boolean).join(' · ')), h('span', 'film-stars', stars(f.p)));
      a.append(pbox, txt);
      row.append(a);
      addPoster(f, pbox);
    });
    const actions = h('div', 'film-actions film3-actions');
    const more = h('button', 'w-btn ghost', 'Predict a film');
    more.onclick = openPanel;
    actions.append(more);
    body.replaceChildren(row, actions);
    addCinema();
  }

  // ---------- Showing now in the cinema: films from your watchlist in the programme (data/cinema.json, Action, daily) ----------
  let cinema = null;
  const when = (show) => {
    if (show.next) {
      const t = new Date(show.next).getTime();
      return `${DASH.fmtDay(t)} ${DASH.fmtTime(t)}`;
    }
    if (show.until) return `until ${new Date(`${show.until}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('.', '')}`;
    return 'in the programme';
  };
  function cinemaMatches() {
    if (!cinema || !window.DASH_FILM) return [];
    const now = Date.now();
    return (cinema.films || []).map((f) => {
      const mine = window.DASH_FILM.predict({ title: f.title });
      if (!mine) return null;
      // Next showing: with a time first, then the rest
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
    box.append(h('p', 'cine-head', 'Showing now in the cinema'));
    for (const f of list.slice(0, card.closest('.desk-tabs') ? 1 : 3)) {
      const a = h('a', 'cine-row');
      a.href = f.show.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${f.title} · ${f.show.cinema} · ${when(f.show)} · verwacht ${dec(f.mine.value, 2)}`;
      a.append(h('b', null, f.title), h('span', 'w-sub', `${f.show.cinema} · ${when(f.show)}`), h('span', 'cine-score', dec(f.mine.value, 1)));
      box.append(a);
    }
    body.append(box);
  }
  const loadCinema = guard(async () => {
    try {
      cinema = await DASH.getJSON(`data/cinema.json?t=${Math.floor(Date.now() / 3600000)}`);
      addCinema();
    } catch (e) {
      console.warn('[cinema]', e);   // no cinema data: the film tile just works without it
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

  // Panel with the real popup (only made on the first click)
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
      body.replaceChildren(h('p', 'w-note', 'No films found in your watchlist.'));
      return;
    }
    const url = `https://letterboxd.com/film/${f.slug}/`;
    const wrap = h('div', 'film');
    const pbox = img(null, 'film-poster', f.film);
    pbox.append(h('span', 'film-score', dec(f.p, 1)));
    const info = h('div', 'film-info');
    info.append(
      h('div', 'w-mid', f.film),
      h('div', 'w-sub', [f.jaar, f.regisseur].filter(Boolean).join(' · ')),
      h('div', 'film-stars', stars(f.p)),
      h('div', 'w-sub', `verwacht ${dec(f.p, 2)} · crowd ${dec(f.crowd, 2)}`),
    );
    const actions = h('div', 'film-actions');
    const lb = h('a', 'w-btn lb', 'Letterboxd ↗');
    lb.href = url;
    lb.target = '_blank';
    lb.rel = 'noopener';
    const more = h('button', 'w-btn ghost', 'Predict a film');
    more.onclick = openPanel;
    actions.append(lb, more);
    wrap.append(pbox, info);
    body.replaceChildren(wrap, actions);
    addCinema();

    // Add the poster as soon as it's in; if that fails, the color block with the title stays
    addPoster(f, pbox);
  }
  // Another layout (portrait/landscape): draw again, because the rotating tile shows the top 3
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
