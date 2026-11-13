'use strict';

// Friends on Letterboxd: their latest logs with poster and stars, from data/friends.json (GitHub Action, every hour).
// If the film is on your watchlist, your predicted rating from the Sterrenvoorspeller is shown too (window.DASH_FILM from stars.js).
DASH.widget('w-friends', (card, body, guard) => {
  const { h, dec } = DASH;
  const stars = (r) => (r == null ? '' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : ''));
  const date = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('.', '') : '');
  let data = null;

  function render() {
    if (!data) return;
    const logs = data.logs || [];
    if (!logs.length) {
      body.replaceChildren(h('p', 'w-note', 'Your friends haven\'t logged anything yet (or the Action hasn\'t run yet).'));
      return;
    }
    const row = h('div', 'lb-row fr-row');
    for (const f of logs) {
      const mine = window.DASH_FILM ? window.DASH_FILM.predict({ slug: f.slug, title: f.title, year: f.year }) : null;
      const a = h('a', 'lb-film');
      a.href = f.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${f.name}: ${f.title}${f.year ? ` (${f.year})` : ''}${f.rating != null ? ` · ${stars(f.rating)}` : ''}${mine ? ` · you predict ${dec(mine.value, 2)}` : ''}`;
      const poster = DASH.img(f.poster, 'lb-poster', f.title);
      poster.append(h('span', 'fr-name', f.name));
      if (mine) poster.append(h('span', 'film-score fr-mine', dec(mine.value, 1)));
      a.append(poster, h('span', 'lb-stars', stars(f.rating) || '–'), h('span', 'lb-date', date(f.watched)));
      row.append(a);
    }
    const latest = logs[0];
    const head = h('div', 'w-row');
    const t = h('div');
    t.style.minWidth = '0';
    t.append(h('div', 'w-mid lb-title', `${latest.name} · ${latest.title}`), h('div', 'w-sub', `${latest.year || ''} · ${stars(latest.rating) || 'no rating'} · ${date(latest.watched)}`));
    head.append(t);
    // How many of their films are on your watchlist
    const onList = logs.filter((f) => window.DASH_FILM && window.DASH_FILM.predict({ slug: f.slug, title: f.title, year: f.year })).length;
    if (onList) head.append(h('span', 'fr-count', `${onList} on your watchlist`));
    body.replaceChildren(head, row);
  }

  const load = guard(async () => {
    try {
      data = await DASH.getJSON(`data/friends.json?t=${Math.floor(Date.now() / 900000)}`);
      render();
    } catch (e) {
      console.warn('[friends]', e);
      body.replaceChildren(DASH.problem('Friends data couldn\'t load. The GitHub Action makes it every hour.', 'Try again', load));
    }
  });
  window.addEventListener('dash:watchlist', guard(render));
  DASH.every(15 * 60 * 1000, load);
  load();
});
