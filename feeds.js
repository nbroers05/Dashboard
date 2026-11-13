'use strict';

// Feeds: a page of its own (same style, own grid) with news, film news, YouTube and markets.
// Open and close with the newspaper icon in the top bar, also close with Esc or the back button (address #feeds).
// News, film news and YouTube come from data/feeds.json (GitHub Action, every half hour: those sources can't be fetched
// straight from the browser). The browser fetches markets itself: Twelve Data (key in localStorage) and CoinGecko.
// Display only: no advice or signals.
(() => {
  const { h, store } = DASH;
  const bar = document.getElementById('topbar');
  const btn = bar && bar.querySelector('.tb-feeds');
  if (!btn) return;
  const CFG = window.DASHBOARD_CONFIG || {};
  const TD_KEY = 'feeds.twelvedata';   // Twelve Data API key: only in this browser
  const MKT_CACHE = 'feeds.markets';

  const page = h('section', 'feeds-page');
  page.id = 'feeds';
  page.setAttribute('aria-label', 'Feeds');
  page.hidden = true;
  const grid = h('div', 'feeds-grid');
  page.append(grid);
  document.body.append(page);
  // The page is a fixed layer just below the top bar (which stays visible, with the same button to go back)
  const place = () => { page.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 12)}px`; };
  for (const ev of ['resize', 'dash:layout', 'load']) window.addEventListener(ev, () => { if (!page.hidden) place(); });
  new ResizeObserver(() => { if (!page.hidden) place(); }).observe(bar);

  // ---------- Hulpjes ----------
  function ago(t) {
    const ms = Date.now() - (typeof t === 'number' ? t * 1000 : Date.parse(t));
    if (!Number.isFinite(ms)) return '';
    const m = Math.round(ms / 60000);
    if (m < 60) return `${Math.max(1, m)} min`;
    const hr = Math.round(m / 60);
    if (hr < 24) return `${hr} h`;
    const d = Math.round(hr / 24);
    return d < 14 ? `${d} d` : new Date(ms > 0 ? Date.now() - ms : Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const k = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(n));
  const link = (cls, href) => { const a = h('a', cls); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
  function section(id, title, color) {
    const card = h('section', 'card tile fd-card');
    card.id = id;
    card.style.setProperty('--c', color);
    const head = h('div', 'fd-head');
    head.append(h('p', 'eyebrow', title));
    const body = h('div', 'w-body fd-body');
    card.append(head, body);
    grid.append(card);
    return { card, head, body };
  }
  const note = (text) => h('p', 'w-note', text);

  const news = section('fd-news', 'News', '#ff6b2c');
  const film = section('fd-film', 'Film news', '#40bcf4');
  const yt = section('fd-yt', 'YouTube', '#ff3b3b');
  const mkt = section('fd-mkt', 'Markets', '#4fa8ff');

  // ---------- News: tabs per source ----------
  let newsTab = store.get('feeds.newsTab') || 0;
  function renderNews(list) {
    const ok = list.filter((s) => s.items.length || s.error);
    if (!ok.length) return news.body.replaceChildren(note('No news yet: the GitHub Action fills this every half hour.'));
    newsTab = Math.min(newsTab, ok.length - 1);
    const tabs = h('div', 'fd-tabs');
    ok.forEach((s, i) => {
      const b = h('button', null, s.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', i === newsTab);
      b.onclick = () => { newsTab = i; store.set('feeds.newsTab', i); renderNews(list); };
      tabs.append(b);
    });
    news.head.querySelector('.fd-tabs')?.remove();
    news.head.append(tabs);
    const src = ok[newsTab];
    const ul = h('div', 'fd-list');
    if (src.error) ul.append(note(src.error));
    for (const it of src.items) {
      const a = link('fd-item fd-news-item', it.link);
      if (it.img) a.append(DASH.img(it.img, 'fd-thumb', ''));
      const txt = h('span', 'fd-txt');
      txt.append(h('b', null, it.title), h('span', 'w-sub', `${src.name} · ${it.time ? `${DASH.fmtTime(Date.parse(it.time))} · ${ago(it.time)} geleden` : ''}`));
      a.append(txt);
      ul.append(a);
    }
    news.body.replaceChildren(ul);
  }

  // ---------- Filmnieuws (Letterboxd Journal): kopplaatje, titel, korte intro ----------
  function renderFilm(list) {
    const items = list.flatMap((src) => src.items.map((it) => ({ ...it, src: src.name })));
    const errors = list.filter((src) => src.error);
    if (!items.length) return film.body.replaceChildren(note(errors.length ? `${errors.map((e) => e.name).join(', ')}: feed not reachable.` : 'No film news yet: the GitHub Action fills this every half hour.'));
    items.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    const ul = h('div', 'fd-list fd-film-list');
    for (const it of items) {
      const a = link('fd-film-item', it.link);
      if (it.img) a.append(DASH.img(it.img, 'fd-film-img', ''));
      const txt = h('span', 'fd-txt');
      txt.append(h('b', null, it.title));
      if (it.intro) txt.append(h('span', 'fd-intro', it.intro));
      txt.append(h('span', 'w-sub', [it.category, list.length > 1 ? it.src : null, it.time ? `${ago(it.time)} geleden` : null].filter(Boolean).join(' · ')));
      a.append(txt);
      ul.append(a);
    }
    film.body.replaceChildren(ul);
  }

  // ---------- YouTube ----------
  function renderYT(y) {
    if (!y || !y.videos.length) return yt.body.replaceChildren(note('No videos yet: fill in youtubeChannels in config.js.'));
    const ul = h('div', 'fd-list fd-yt-grid');
    for (const v of y.videos.filter((x) => !x.short).slice(0, 12)) {
      const a = link('fd-yt-item', v.link);
      a.append(DASH.img(v.thumb, 'fd-yt-thumb', ''));
      const txt = h('span', 'fd-txt');
      txt.append(h('b', null, v.title), h('span', 'w-sub', `${v.channel} · ${ago(v.time)} geleden`));
      a.append(txt);
      ul.append(a);
    }
    yt.body.replaceChildren(ul);
  }

  const loadFeeds = async () => {
    try {
      const data = await DASH.getJSON(`data/feeds.json?t=${Math.floor(Date.now() / 600000)}`);
      for (const [fn, part, box] of [[renderNews, data.news || [], news], [renderFilm, data.film || [], film], [renderYT, data.youtube, yt]]) {
        try { fn(part); } catch (e) { console.error('[feeds]', e); box.body.replaceChildren(note('This part couldn\'t load.')); }
      }
    } catch (e) {
      console.warn('[feeds]', e);
      for (const box of [news, film, yt]) box.body.replaceChildren(DASH.problem('Feeds couldn\'t load. The GitHub Action makes them every half hour.', 'Try again', loadFeeds));
    }
  };

  // ---------- Markets ----------
  const list = (CFG.markets || []).filter((m) => m.symbol && !/^TICKER_/.test(m.symbol));
  const fmtNum = (v, d = 2) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  function spark(values, up) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 30');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('fd-spark', up ? 'up' : 'down');
    if (values.length > 1) {
      const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
      const pts = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(1)},${(28 - (v - lo) / span * 26).toFixed(1)}`).join(' ');
      const line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', pts);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(line);
    }
    return svg;
  }

  async function twelveData(symbols, key) {
    const q = new URLSearchParams({ symbol: symbols.join(','), interval: '1day', outputsize: '31', apikey: key });
    const r = await DASH.getJSON(`https://api.twelvedata.com/time_series?${q}`);
    const bySym = symbols.length === 1 ? { [symbols[0]]: r } : r;
    const out = {};
    for (const s of symbols) {
      const d = bySym[s];
      if (!d || d.status === 'error' || !d.values) { out[s] = { error: (d && d.message) ? 'not available' : 'no data' }; continue; }
      const closes = d.values.map((v) => Number(v.close)).reverse();
      out[s] = { price: closes.at(-1), change: (closes.at(-1) / closes.at(-2) - 1) * 100, series: closes, cur: (d.meta && d.meta.currency) || '' };
    }
    return out;
  }
  async function coinGecko(id) {
    const [p, c] = await Promise.all([
      DASH.getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur&include_24hr_change=true`),
      DASH.getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=30&interval=daily`),
    ]);
    return { price: p[id].eur, change: p[id].eur_24h_change, series: c.prices.map((x) => x[1]), cur: 'EUR', note: '24 h' };
  }

  async function loadMarkets(force) {
    const cached = store.get(MKT_CACHE);
    // Only use the cache if it's still about the same list (fetch again after a change in config.js)
    const same = cached && list.every((m) => cached.data && cached.data[m.symbol]);
    if (!force && same && Date.now() - cached.at < 30 * 60000) return renderMarkets(cached.data);
    const key = store.get(TD_KEY);
    const data = {};
    const stocks = list.filter((m) => !m.coingecko);
    if (stocks.length) {
      if (!key) stocks.forEach((m) => { data[m.symbol] = { error: 'Twelve Data key needed' }; });
      else {
        try { Object.assign(data, await twelveData(stocks.map((m) => m.symbol), key)); }
        catch (e) { stocks.forEach((m) => { data[m.symbol] = { error: 'Twelve Data not reachable' }; }); }
      }
    }
    await Promise.all(list.filter((m) => m.coingecko).map(async (m) => {
      try { data[m.symbol] = await coinGecko(m.coingecko); } catch { data[m.symbol] = { error: 'CoinGecko not reachable' }; }
    }));
    store.set(MKT_CACHE, { at: Date.now(), data });
    renderMarkets(data);
  }
  function renderMarkets(data) {
    const wrap = h('div', 'fd-mkt-list');
    if (!list.length) wrap.append(note('No tickers yet: fill in markets in config.js.'));
    for (const m of list) {
      const d = data[m.symbol] || {};
      const row = h('div', 'fd-mkt-row');
      const name = h('span', 'fd-mkt-name');
      name.append(h('b', null, m.name || m.symbol), h('span', 'w-sub', m.symbol));
      row.append(name);
      if (d.error || !Number.isFinite(d.price)) {
        row.append(h('span', 'w-sub fd-mkt-err', d.error || 'no data'));
      } else {
        const up = d.change >= 0;
        row.append(spark(d.series || [], up), h('span', 'fd-mkt-price', `${d.cur === 'EUR' ? '€ ' : d.cur === 'USD' ? '$ ' : ''}${fmtNum(d.price, d.price > 1000 ? 0 : 2)}`),
          h('span', `fd-mkt-chg ${up ? 'up' : 'down'}`, `${up ? '+' : ''}${fmtNum(d.change)}%`));
      }
      wrap.append(row);
    }
    // Fill in the key (only needed for stocks/indexes)
    const form = h('form', 'fd-key');
    const input = h('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.placeholder = store.get(TD_KEY) ? 'Twelve Data key saved (empty = remove)' : 'Twelve Data API key (free, twelvedata.com)';
    const save = h('button', 'w-btn ghost', 'Save');
    form.append(input, save);
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      try { if (v) localStorage.setItem(TD_KEY, JSON.stringify(v)); else localStorage.removeItem(TD_KEY); } catch {}
      loadMarkets(true);
    };
    mkt.body.replaceChildren(wrap, h('p', 'w-sub fd-mkt-note', 'Price, change today (crypto: 24 hours) and the last month. For information only.'), form);
  }

  // ---------- Opening and closing ----------
  let loadedAt = 0, pushed = false;
  function setOpen(open, fromHash) {
    page.hidden = !open;
    document.body.classList.toggle('feeds-open', open);
    btn.setAttribute('aria-pressed', open);
    btn.title = open ? 'Back to the dashboard (Esc)' : 'Feeds';
    if (open) {
      window.dispatchEvent(new CustomEvent('dash:page', { detail: 'feeds' }));
      if (Date.now() - loadedAt > 10 * 60000) {
        loadedAt = Date.now();
        [news, film, yt, mkt].forEach((s) => { if (!s.body.children.length) s.body.append(note('Loading…')); });
        loadFeeds();
        loadMarkets(false);
      }
      if (!fromHash && location.hash !== '#feeds') {
        if (location.hash === '#mydata' || location.hash === '#games') history.replaceState(null, '', '#feeds');
        else { history.pushState(null, '', '#feeds'); pushed = true; }
      }
      window.scrollTo(0, 0);
      place();
    } else if (!fromHash && location.hash === '#feeds') {
      // Added #feeds ourselves: go back in history. Opened directly with #feeds: only clean up the address.
      if (pushed) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
      pushed = false;
    }
  }
  btn.onclick = () => setOpen(page.hidden);
  // My data is in the same place: when that opens, Feeds closes
  window.addEventListener('dash:page', (e) => { if (e.detail !== 'feeds' && !page.hidden) setOpen(false, true); });
  window.addEventListener('popstate', () => setOpen(location.hash === '#feeds', true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !page.hidden && !document.querySelector('dialog[open]') && document.activeElement.tagName !== 'INPUT') setOpen(false);
  });
  if (location.hash === '#feeds') setOpen(true, true);
})();
