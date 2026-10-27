// Watchlist vernieuwen vanaf Letterboxd. Elke film wordt meteen bewaard, dus de popup
// sluiten halverwege is geen probleem: de volgende keer gaat het snel verder.
(function (root) {
  const S = root.LBV_SEL, F = root.LBVfilm;
  const DAY = 864e5;
  const SNAPSHOT_T = Date.parse('2026-10-19T12:00:00');
  const snapshot = new Map((root.LBV_WATCHLIST || []).map(w => [w.slug, w]));

  const fromSnapshot = w => ({
    slug: w.slug, title: w.film, year: w.jaar || '', crowd: w.crowd, n: w.n,
    genres: [w.komedie && 'Comedy', w.familie && 'Family'].filter(Boolean),
    countries: w.japans ? ['Japan'] : [],
    directors: (w.regisseur || '').split(/,\s*/).filter(Boolean)
  });

  // Alle films van een lijst of watchlist; base = "https://letterboxd.com/<gebruiker>/list/<naam>/".
  async function listSlugs(base) {
    const slugs = [];
    for (let page = 1; page <= 50; page++) {
      const r = await F.get(S.listPageUrl(base, page));
      if (!r.ok) {
        if (page === 1) throw new Error('lijst niet bereikbaar (' + r.status + ')');
        break;
      }
      const found = [...F.html2doc(await r.text()).querySelectorAll(S.watchlistItems)].map(e => e.getAttribute('data-item-slug'));
      if (!found.length) break;
      slugs.push(...found);
    }
    return [...new Set(slugs)];
  }

  // Filmgegevens: 30 dagen bewaard (3 dagen zolang er nog geen gemiddelde is).
  async function filmData(slug) {
    const key = 'film:' + slug;
    const hit = (await browser.storage.local.get(key))[key];
    const ttl = hit && hit.film.crowd != null ? 30 * DAY : 3 * DAY;
    if (hit && Date.now() - hit.t < ttl) return hit.film;
    const snap = snapshot.get(slug);
    if (!hit && snap && snap.crowd != null && Date.now() - SNAPSHOT_T < 30 * DAY) return fromSnapshot(snap);
    const r = await F.get(S.filmUrl(slug));
    if (!r.ok) return hit ? hit.film : snap ? fromSnapshot(snap) : null;
    const film = await F.parseFilm(F.html2doc(await r.text()), slug);
    await browser.storage.local.set({ [key]: { film, t: Date.now() } });
    return film;
  }

  // Zelfde vorm als de snapshot in watchlist.js, plus marijn.
  const toEntry = (film, ratings) => ({
    slug: film.slug, film: film.title, jaar: film.year, crowd: film.crowd, n: film.n,
    japans: film.countries.includes('Japan') ? 1 : 0,
    komedie: film.genres.includes('Comedy') ? 1 : 0,
    familie: film.genres.includes('Family') ? 1 : 0,
    loeka: ratings.loeka, marijn: ratings.marijn,
    regisseur: film.directors.join(', ')
  });

  async function pool(items, size, fn) {
    let next = 0;
    await Promise.all(Array.from({ length: size }, async () => {
      while (next < items.length) { const k = next++; await fn(items[k], k); }
    }));
  }

  // source: { base, key } – key is de opslagsleutel ("wl" voor je watchlist).
  root.LBVrefresh = async function (source, onProgress) {
    const slugs = await listSlugs(source.base);
    const out = new Array(slugs.length);
    let done = 0;
    onProgress(0, slugs.length);
    await pool(slugs, 6, async (slug, k) => {
      try {
        const film = await filmData(slug);
        if (film) out[k] = toEntry(film, (await F.friendRatings(slug)).ratings);
      } catch (e) { /* film overslaan, volgende keer opnieuw */ }
      onProgress(++done, slugs.length);
    });
    const result = { t: Date.now(), items: out.filter(Boolean) };
    await browser.storage.local.set({ [source.key]: result });
    return result;
  };

  root.LBVstored = async key => {
    try { return (await browser.storage.local.get(key))[key] || null; } catch (e) { return null; }
  };

  // Welke lijst hoort bij een tab-URL? null = geen lijstpagina.
  root.LBVlistSource = url => {
    let u; try { u = new URL(url); } catch (e) { return null; }
    if (u.hostname !== 'letterboxd.com') return null;
    const m = u.pathname.match(S.listPath);
    if (!m) return null;
    const base = `https://letterboxd.com/${m[1]}/${m[2]}/`;
    if (m[1] === S.watchlistUser && m[2] === 'watchlist') return null; // je eigen watchlist = standaard
    return { base, key: 'list:' + base };
  };
  root.LBVwatchlistSource = { base: `https://letterboxd.com/${S.watchlistUser}/watchlist/`, key: 'wl' };
})(globalThis);
