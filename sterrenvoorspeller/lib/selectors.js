// Alles wat afhangt van Letterboxd's HTML staat hier. Breekt er iets, dan begin je hier.
// Gecontroleerd op 19 oktober 2026.
globalThis.LBV_SEL = (LB => ({
  // Vrienden in de formule: sleutel in het model -> Letterboxd-gebruikersnaam.
  friends: { loeka: 'loekatheactor', marijn: 'marijn2005' },

  // Jouw account; lijsten en watchlists: 100 films per pagina, elk item heeft data-item-slug.
  watchlistUser: 'nbroers05',
  watchlistItems: '[data-item-slug]',

  filmUrl: slug => `${LB}/film/${slug}/`,

  // Lijstpagina's (popup rangschikt de huidige lijst): /<gebruiker>/list/<naam>/... en /<gebruiker>/watchlist/...
  listPath: /^\/([^/]+)\/(list\/[^/]+|watchlist)\//,
  listPageUrl: (base, page) => `${base}page/${page}/`,

  // Posters overal op de site. data-postered-identifier = {"lid":"1GRM","uid":"film:40311","type":"film"}.
  posterItems: '[data-postered-identifier]',
  posterImage: '.poster',
  loggedIn: 'body.logged-in',
  // Jouw cijfers voor een reeks posters: POST productions=film:123 (herhaald). Antwoord: ratings [{uid, rating 1-10}], csrf.
  metadataUrl: `${LB}/ajax/letterboxd-metadata/`,
  // Cijfer zetten: PATCH {"rating": 3.5} of {"rating": null}, header X-CSRF-TOKEN.
  rateUrl: lid => `${LB}/api/v0/me/rate/${lid}`,

  // Hoofdbron: het schema.org-blok (aggregateRating, genre, countryOfOrigin, director).
  jsonLd: 'script[type="application/ld+json"]',

  // Reserves als JSON-LD ontbreekt of onvolledig is.
  metaAverage: 'meta[name="twitter:data2"]',      // "4.14 out of 5"
  metaDirector: 'meta[name="twitter:data1"]',     // "Denis Villeneuve"
  genreLinks: '#tab-panel-genres a[href^="/films/genre/"]',
  countryLinks: '#tab-panel-details a[href^="/films/country/"]',
  directorLinks: '#tab-panel-crew a[href^="/director/"]',
  histogramUrl: slug => `${LB}/csi/film/${slug}/rating-histogram/`,
  histogramBars: 'a.barcolumn',                    // title/data-original-title: "4,513 half-★ ratings (0%)"

  // Je eigen cijfer (alleen ingelogd): aangevinkte radio, waarde 1-10 in halve sterren, 0 = geen cijfer.
  ownRatingComponent: '[data-component-class="InstantRatingInput"]',
  ownRatingInputs: '[data-component-class="InstantRatingInput"] input[type="radio"]',

  // Waar de kaart komt: direct onder het ratinghistogram in de zijbalk.
  histogramSection: 'section.ratings-histogram-chart',
  sidebar: 'aside.sidebar',

  // Filmpagina van een vriend: 404 = niet gelogd. twitter:data2 bevat de sterren ("★★★★½").
  friendUrl: (user, slug) => `${LB}/${user}/film/${slug}/`,
  friendRatingMeta: 'meta[name="twitter:data2"]',
  friendRatingLabel: 'meta[name="twitter:label2"]', // "Rating"
  friendRatedClass: /\brated-(\d{1,2})\b/            // reserve: rated-8 = 4 sterren
}))('https://letterboxd.com');
