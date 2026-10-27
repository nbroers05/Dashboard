// Film- en vriendgegevens uit Letterboxd-HTML halen. Gedeeld door de kaart en de popup.
(function (root) {
  const S = root.LBV_SEL;
  const FRIEND_TTL = 24 * 3600 * 1000;

  const names = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => typeof x === 'string' ? x : x && x.name).filter(Boolean);
  const texts = (doc, sel) => [...doc.querySelectorAll(sel)].map(a => a.textContent.trim()).filter(Boolean);
  const html2doc = html => new DOMParser().parseFromString(html, 'text/html');

  function readJsonLd(doc) {
    const el = doc.querySelector(S.jsonLd);
    if (!el) return null;
    try { return JSON.parse(el.textContent.replace(/\/\*[\s\S]*?\*\//g, '')); } catch (e) { return null; }
  }

  async function countFromHistogram(slug) {
    try {
      const doc = html2doc(await (await fetch(S.histogramUrl(slug))).text());
      let total = 0;
      doc.querySelectorAll(S.histogramBars).forEach(a => {
        const t = a.getAttribute('data-original-title') || a.getAttribute('title') || a.textContent;
        const m = t.match(/([\d,.]+)/);
        if (m) total += +m[1].replace(/[,.]/g, '');
      });
      return total || null;
    } catch (e) { return null; }
  }

  // Filmgegevens uit een filmpagina (het live document of een opgehaalde pagina).
  async function parseFilm(doc, slug) {
    const j = readJsonLd(doc) || {};
    const agg = j.aggregateRating || {};
    let crowd = +agg.ratingValue || null;
    if (!crowd) {
      const m = (doc.querySelector(S.metaAverage)?.content || '').match(/([\d.]+) out of 5/);
      crowd = m ? +m[1] : null;
    }
    let n = +agg.ratingCount || null;
    if (!n && crowd) n = await countFromHistogram(slug);
    let genres = names(j.genre); if (!genres.length) genres = texts(doc, S.genreLinks);
    let countries = names(j.countryOfOrigin); if (!countries.length) countries = texts(doc, S.countryLinks);
    let directors = names(j.director);
    if (!directors.length) directors = texts(doc, S.directorLinks);
    if (!directors.length) directors = (doc.querySelector(S.metaDirector)?.content || '').split(/,\s*|\s+and\s+/).filter(Boolean);
    return { slug, title: j.name || doc.title, year: (j.dateCreated || '').slice(0, 4), crowd, n, genres, countries, directors };
  }

  // Rating van een vriend: null = niet gelogd of geen cijfer.
  function parseFriend(html) {
    const doc = html2doc(html);
    const label = doc.querySelector(S.friendRatingLabel)?.content;
    if (label === 'Rating') {
      const stars = doc.querySelector(S.friendRatingMeta)?.content || '';
      const v = (stars.match(/★/g) || []).length + (stars.includes('½') ? 0.5 : 0);
      return v || null;
    }
    // Pagina zonder twitter-meta: structuur is veranderd, probeer de klassenaam.
    if (!doc.querySelector('meta[name="twitter:title"]')) {
      const m = html.match(S.friendRatedClass);
      return m ? +m[1] / 2 : null;
    }
    return null; // gelogd zonder cijfer
  }

  // fetch met één nieuwe poging als Letterboxd even "te veel verzoeken" zegt.
  async function get(url) {
    let r = await fetch(url);
    if (r.status === 429) { await new Promise(res => setTimeout(res, 5000)); r = await fetch(url); }
    return r;
  }

  // Met cache (een dag); undefined = ophalen mislukt.
  async function friendRating(user, slug) {
    const key = 'friend:' + user + ':' + slug;
    try {
      const hit = (await browser.storage.local.get(key))[key];
      if (hit && Date.now() - hit.t < FRIEND_TTL) return hit.v;
    } catch (e) {}
    let v;
    try {
      const r = await get(S.friendUrl(user, slug));
      if (r.status === 404) v = null;
      else if (r.ok) v = parseFriend(await r.text());
      else return undefined;
    } catch (e) { return undefined; }
    try { await browser.storage.local.set({ [key]: { v, t: Date.now() } }); } catch (e) {}
    return v;
  }

  // Alle vrienden tegelijk: { ratings: {loeka, marijn}, known: {loeka: true, ...} }
  async function friendRatings(slug) {
    const keys = Object.keys(S.friends);
    const vals = await Promise.all(keys.map(k => friendRating(S.friends[k], slug)));
    const ratings = {}, known = {};
    keys.forEach((k, i) => { ratings[k] = vals[i] == null ? null : vals[i]; known[k] = vals[i] !== undefined; });
    return { ratings, known };
  }

  // Invoer voor LBV.predict.
  function toFeatures(film, ratings) {
    return {
      crowd: film.crowd, n: film.n || 1,
      jp: film.countries.includes('Japan'),
      com: film.genres.includes('Comedy'),
      fam: film.genres.includes('Family'),
      streng: true,
      regie: film.directors,
      ...ratings
    };
  }

  root.LBVfilm = { parseFilm, parseFriend, friendRatings, toFeatures, get, html2doc };
})(globalThis);
