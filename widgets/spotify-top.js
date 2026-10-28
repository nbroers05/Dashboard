'use strict';

// Spotify-maandoverzicht: top 5 nummers en top 5 artiesten van de afgelopen ~4 weken (time_range=short_term).
// Gebruikt de inlog van spotify.js (window.DASH_SPOTIFY). Daarvoor is de scope user-top-read nodig:
// wie al eerder had ingelogd, moet één keer opnieuw inloggen.
DASH.widget('w-sptop', (card, body, guard) => {
  const { h, store } = DASH;
  const KEY = 'spotify.top';
  const TTL = 6 * 3600000;   // Spotify werkt dit zelf ook maar ongeveer dagelijks bij

  const pic = (images) => (images && images.length ? images[images.length > 1 ? 1 : 0].url : null);

  function render(data) {
    const col = (title, items, artist) => {
      const box = h('div', 'sp-col');
      box.append(h('p', 'sp-head', title));
      const list = h('ol', 'sp-list');
      items.forEach((x, i) => {
        const li = h('li');
        const a = h('a', 'sp-item');
        a.href = x.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = x.sub ? `${x.name} · ${x.sub}` : x.name;
        const img = DASH.img(x.img, `sp-img${artist ? ' round' : ''}`, x.name.slice(0, 1));
        const txt = h('span', 'sp-txt');
        txt.append(h('b', null, x.name));
        if (x.sub) txt.append(h('span', 'w-sub', x.sub));
        a.append(h('span', 'sp-rank', String(i + 1)), img, txt);
        li.append(a);
        list.append(li);
      });
      box.append(list);
      return box;
    };
    const grid = h('div', 'sp-grid');
    grid.append(col('Nummers', data.tracks, false), col('Artiesten', data.artists, true));
    body.replaceChildren(grid);
  }

  async function fetchTop() {
    const S = window.DASH_SPOTIFY;
    const [t, a] = await Promise.all([
      S.api('GET', '/me/top/tracks?time_range=short_term&limit=5'),
      S.api('GET', '/me/top/artists?time_range=short_term&limit=5'),
    ]);
    return {
      at: Date.now(),
      tracks: (t.items || []).map((x) => ({ name: x.name, sub: (x.artists || []).map((ar) => ar.name).join(', '), img: pic(x.album && x.album.images), url: x.external_urls && x.external_urls.spotify })),
      artists: (a.items || []).map((x) => ({ name: x.name, sub: (x.genres || [])[0] || '', img: pic(x.images), url: x.external_urls && x.external_urls.spotify })),
    };
  }

  const relogin = () => body.replaceChildren(DASH.problem(
    'Voor je maandoverzicht heeft het dashboard één extra toestemming van Spotify nodig. Log daarvoor één keer opnieuw in.',
    'Opnieuw inloggen bij Spotify', () => window.DASH_SPOTIFY.login(),
  ));

  const load = guard(async () => {
    const S = window.DASH_SPOTIFY;
    if (!S || !S.connected()) {
      body.replaceChildren(h('p', 'w-note', 'Log bovenaan in bij Spotify om je top van de afgelopen maand te zien.'));
      return;
    }
    if (S.hasScope('user-top-read') === false) return relogin();
    const cached = store.get(KEY);
    if (cached && !DASH.DEMO && Date.now() - cached.at < TTL) return render(cached);
    try {
      const data = await fetchTop();
      if (!data.tracks.length && !data.artists.length) {
        body.replaceChildren(h('p', 'w-note', 'Nog niet genoeg geluisterd de afgelopen weken voor een top 5.'));
        return;
      }
      if (!DASH.DEMO) store.set(KEY, data);
      render(data);
    } catch (e) {
      // 403 = deze inlog heeft de scope nog niet (ingelogd vóór het maandoverzicht bestond)
      if (e.status === 403 || e.status === 401) return relogin();
      console.warn('[spotify-top]', e);
      if (cached) return render(cached);
      body.replaceChildren(DASH.problem('Spotify gaf geen maandoverzicht. Het probeert het later opnieuw.', 'Opnieuw proberen', load));
    }
  });
  DASH.every(TTL, load);
  load();
});
