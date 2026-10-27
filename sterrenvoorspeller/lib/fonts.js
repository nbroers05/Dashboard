// Laadt de meegeleverde fonts via de FontFace-API. De bytes komen uit de extensie zelf,
// dus de CSP van Letterboxd (font-src) speelt geen rol.
(function (root) {
  const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
  const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';
  const FONTS = [
    ['LBV Archivo', 'archivo-latin', { weight: '500 800', stretch: '75% 100%', unicodeRange: LATIN }],
    ['LBV Archivo', 'archivo-latin-ext', { weight: '500 800', stretch: '75% 100%', unicodeRange: LATIN_EXT }],
    ['LBV Plex Sans', 'plexsans-latin', { weight: '400 600', unicodeRange: LATIN }],
    ['LBV Plex Sans', 'plexsans-latin-ext', { weight: '400 600', unicodeRange: LATIN_EXT }],
    ['LBV Plex Mono', 'plexmono-400-latin', { weight: '400', unicodeRange: LATIN }],
    ['LBV Plex Mono', 'plexmono-400-latin-ext', { weight: '400', unicodeRange: LATIN_EXT }],
    ['LBV Plex Mono', 'plexmono-500-latin', { weight: '500', unicodeRange: LATIN }],
    ['LBV Plex Mono', 'plexmono-500-latin-ext', { weight: '500', unicodeRange: LATIN_EXT }]
  ];
  let loading = null;
  root.LBVloadFonts = function () {
    if (loading) return loading;
    loading = Promise.all(FONTS.map(async ([family, file, desc]) => {
      try {
        const buf = await (await fetch(browser.runtime.getURL('fonts/' + file + '.woff2'))).arrayBuffer();
        const face = new FontFace(family, buf, desc);
        await face.load();
        document.fonts.add(face);
      } catch (e) { /* valt terug op systeemfont */ }
    }));
    return loading;
  };
})(globalThis);
