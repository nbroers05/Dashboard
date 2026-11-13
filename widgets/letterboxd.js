'use strict';

// Last watched: the latest Letterboxd logs with poster and stars.
// The data comes from data/letterboxd.json, which a GitHub Action updates every hour (Letterboxd itself can't be read from the browser).
DASH.widget('w-letterboxd', (card, body, guard) => {
  const { h } = DASH;
  const SHOW = 20;   // as many as there are; the styles only show what fits on one row

  const stars = (r) => (r == null ? '' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : ''));
  const date = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('.', '') : '');

  function render(data) {
    const logs = (data.logs || []).slice(0, SHOW);
    if (!logs.length) {
      body.replaceChildren(h('p', 'w-note', 'No films found on Letterboxd yet.'));
      return;
    }
    const row = h('div', 'lb-row');
    for (const f of logs) {
      const a = h('a', 'lb-film');
      a.href = f.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${f.title}${f.year ? ` (${f.year})` : ''}${f.rating != null ? ` · ${stars(f.rating)}` : ''}${f.rewatch ? ' · rewatched' : ''}`;
      const poster = DASH.img(f.poster, 'lb-poster', f.title);
      const badges = h('div', 'lb-badges');
      if (f.liked) badges.append(h('span', 'lb-like', '♥'));
      if (f.rewatch) badges.append(h('span', 'lb-re', '↻'));
      if (badges.children.length) poster.append(badges);
      a.append(poster, h('span', 'lb-stars', stars(f.rating) || '–'), h('span', 'lb-date', date(f.watched)));
      row.append(a);
    }
    const head = h('div', 'w-row');
    const latest = logs[0];
    const t = h('div');
    t.style.minWidth = '0';
    t.append(h('div', 'w-mid lb-title', latest.title), h('div', 'w-sub', `${latest.year || ''} · watched ${date(latest.watched)}${latest.rewatch ? ' · again' : ''}`));
    const profile = h('a', 'w-btn lb', 'Letterboxd ↗');
    profile.href = `https://letterboxd.com/${data.user || 'nbroers05'}/films/diary/`;
    profile.target = '_blank';
    profile.rel = 'noopener';
    head.append(t, profile);
    body.replaceChildren(head, row);
  }

  const load = guard(async () => {
    try {
      // A fresh version once per quarter hour (the Action updates it at most every hour)
      render(await DASH.getJSON(`data/letterboxd.json?t=${Math.floor(Date.now() / 900000)}`));
    } catch (e) {
      body.replaceChildren(DASH.problem('Letterboxd data couldn\'t load. The GitHub Action makes it every hour (see README).', 'Try again', load));
      console.warn('[letterboxd]', e);
    }
  });
  DASH.every(15 * 60 * 1000, load);
  load();
});
