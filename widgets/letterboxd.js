'use strict';

// Laatst gekeken: de nieuwste logs van Letterboxd met poster en sterren.
// De data komt uit data/letterboxd.json, die een GitHub Action elk uur bijwerkt (Letterboxd zelf is niet vanuit de browser te lezen).
DASH.widget('w-letterboxd', (card, body, guard) => {
  const { h } = DASH;
  const SHOW = 5;

  const stars = (r) => (r == null ? '' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : ''));
  const date = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '') : '');

  function render(data) {
    const logs = (data.logs || []).slice(0, SHOW);
    if (!logs.length) {
      body.replaceChildren(h('p', 'w-note', 'Nog geen films gevonden op Letterboxd.'));
      return;
    }
    const row = h('div', 'lb-row');
    for (const f of logs) {
      const a = h('a', 'lb-film');
      a.href = f.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `${f.title}${f.year ? ` (${f.year})` : ''}${f.rating != null ? ` · ${stars(f.rating)}` : ''}${f.rewatch ? ' · opnieuw gekeken' : ''}`;
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
    t.append(h('div', 'w-mid lb-title', latest.title), h('div', 'w-sub', `${latest.year || ''} · gekeken ${date(latest.watched)}${latest.rewatch ? ' · opnieuw' : ''}`));
    const profile = h('a', 'w-btn lb', 'Letterboxd ↗');
    profile.href = `https://letterboxd.com/${data.user || 'nbroers05'}/films/diary/`;
    profile.target = '_blank';
    profile.rel = 'noopener';
    head.append(t, profile);
    body.replaceChildren(head, row);
  }

  const load = guard(async () => {
    try {
      // Eén keer per kwartier een verse versie (de Action werkt het hooguit elk uur bij)
      render(await DASH.getJSON(`data/letterboxd.json?t=${Math.floor(Date.now() / 900000)}`));
    } catch (e) {
      body.replaceChildren(h('p', 'w-note', 'Nog geen Letterboxd-data. De GitHub Action maakt die elk uur aan (zie README).'));
      console.warn('[letterboxd]', e);
    }
  });
  DASH.every(15 * 60 * 1000, load);
  load();
});
