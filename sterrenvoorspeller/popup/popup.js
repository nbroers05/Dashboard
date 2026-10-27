// De sterrenvoorspeller als popup. Staat de actieve tab op een Letterboxd-film, dan vult hij die in.
const M = globalThis.LBV, S = globalThis.LBV_SEL;
let W = globalThis.LBV_WATCHLIST; // snapshot; na Vernieuwen de opgeslagen versie
const { R, RN, predict, regieBonus, starsFor, nl, halfLabel } = M;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const friendVal = id => $(id).value === '' ? null : +$(id).value;

globalThis.LBVloadFonts();
Object.keys(R).sort().forEach(d => { const o = document.createElement('option'); o.value = d; o.label = (R[d] > 0 ? '+' : '') + nl(R[d]) + ' ster, ' + RN[d] + ' films'; $('regielijst').appendChild(o); });
document.querySelectorAll('select.friend').forEach(sel => { for (let s = 0.5; s <= 5; s += 0.5) { const o = document.createElement('option'); o.value = s; o.textContent = halfLabel(s) + ' ster'; sel.appendChild(o); } });

function readForm() {
  return { crowd: +$('crowd').value || 0, n: +$('n').value || 1, jp: $('jp').checked, com: $('com').checked, fam: $('fam').checked, streng: $('streng').checked, loeka: friendVal('loeka'), marijn: friendVal('marijn'), regie: $('regie').value.trim() };
}
function render(name) {
  const r = predict(readForm());
  $('out').textContent = halfLabel(r.value);
  $('stars').textContent = starsFor(r.value);
  $('calc').textContent = nl(r.raw) + ' → ' + halfLabel(r.value);
  $('fname').textContent = name || 'Eigen invoer';
  $('range').textContent = 'meestal tussen ' + nl(Math.max(0.5, r.value - 0.41), 1) + ' en ' + nl(Math.min(5, r.value + 0.41), 1);
  $('parts').innerHTML = M.displayParts(r)
    .map((p, i) => `<tr><td>${esc(p[0])}</td><td>${p[1] >= 0 && i > 0 ? '+' : ''}${nl(p[1])}</td></tr>`).join('');
}
function clearSel() { document.querySelectorAll('.row.sel').forEach(e => e.classList.remove('sel')); }
['crowd', 'n', 'jp', 'com', 'fam', 'streng', 'loeka', 'marijn', 'regie'].forEach(id => $(id).addEventListener('input', () => { clearSel(); render(); shownSlug = null; $('open').hidden = true; }));

function load(f) {
  $('crowd').value = f.crowd; $('n').value = f.n || 1000;
  $('jp').checked = !!f.japans; $('com').checked = !!f.komedie; $('fam').checked = !!f.familie; $('streng').checked = true;
  $('loeka').value = f.loeka == null ? '' : String(f.loeka); $('marijn').value = f.marijn == null ? '' : String(f.marijn); $('regie').value = f.regisseur || '';
  render(f.film + (f.jaar ? ' (' + f.jaar + ')' : ''));
  shownSlug = f.slug || null; $('open').hidden = !shownSlug;
}

const watchPredict = f => predict({ crowd: f.crowd, n: f.n || 1000, jp: !!f.japans, com: !!f.komedie, fam: !!f.familie, streng: true, loeka: f.loeka, marijn: f.marijn == null ? null : f.marijn, regie: f.regisseur }).value;
function list() {
  const q = $('q').value.trim().toLowerCase(); const nojp = $('nojp').checked;
  const items = W.filter(f => f.crowd != null && (!q || f.film.toLowerCase().includes(q)) && (!nojp || !f.japans))
    .map(f => ({ ...f, p: watchPredict(f) }))
    .sort((a, b) => b.p - a.p);
  $('count').textContent = items.length + ' films';
  $('list').innerHTML = items.map((f, i) => {
    const rb = regieBonus(f.regisseur);
    return `<button class="row" role="listitem" data-slug="${esc(f.slug)}"><span class="rank">${i + 1}</span><span class="t"><b>${esc(f.film)}</b><span>${f.jaar || ''}${f.japans ? '<span class="tag">Japans</span>' : ''}${f.komedie ? '<span class="tag">komedie</span>' : ''}${f.familie ? '<span class="tag">familie</span>' : ''}${f.loeka != null ? '<span class="tag">Loeka ' + halfLabel(f.loeka) + '</span>' : ''}${f.marijn != null ? '<span class="tag">Marijn ' + halfLabel(f.marijn) + '</span>' : ''}${rb ? '<span class="tag">' + esc(f.regisseur) + ' ' + (rb > 0 ? '+' : '') + nl(rb) + '</span>' : ''}</span></span><span class="score"><b>${halfLabel(f.p)}</b><span>${nl(f.p)} · crowd ${nl(f.crowd)}</span></span></button>`;
  }).join('');
}
$('list').addEventListener('click', e => {
  const b = e.target.closest('.row'); if (!b) return;
  clearSel(); b.classList.add('sel');
  load(W.find(x => x.slug === b.dataset.slug));
  if (current) $('back').hidden = false;
});
$('q').addEventListener('input', list); $('nojp').addEventListener('change', list);
list();

// Film van de actieve tab, zoals het content script hem las.
let current = null;
function loadCurrent() {
  const { film, f } = current;
  load({ slug: film.slug, film: film.title, jaar: film.year, crowd: f.crowd, n: f.n, japans: f.jp, komedie: f.com, familie: f.fam, loeka: f.loeka, marijn: f.marijn, regisseur: f.regie.join(', ') });
  clearSel(); $('back').hidden = true;
}
$('back').addEventListener('click', loadCurrent);

function loadTop() {
  const first = W.filter(f => f.crowd != null).map(f => ({ f, p: watchPredict(f) })).sort((a, b) => b.p - a.p)[0];
  if (first) { load(first.f); const b = document.querySelector('.row'); if (b) b.classList.add('sel'); } else render();
}

// Knop bij de filminfo: naar de Letterboxd-pagina van de getoonde film.
let shownSlug = null;
$('open').addEventListener('click', async () => {
  if (!shownSlug) return;
  const url = S.filmUrl(shownSlug);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && /^https:\/\/letterboxd\.com\//.test(tab.url || '')) await browser.tabs.update(tab.id, { url });
  else await browser.tabs.create({ url });
  window.close();
});

// Rechterpaneel: je watchlist, of de lijst die in de actieve tab openstaat.
const fmtDate = t => new Date(t).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
let source = globalThis.LBVwatchlistSource;
function setSource(src, title) {
  source = src;
  const isWl = src.key === 'wl';
  $('wl-h').textContent = isWl ? 'Je watchlist, op verwacht cijfer' : (title || 'Deze lijst') + ', op verwacht cijfer';
  $('to-wl').hidden = isWl;
}
function showResult(res) {
  W = res.items;
  $('wl-note').textContent = 'Bijgewerkt ' + fmtDate(res.t) + '.';
  list();
}
async function refresh() {
  const btn = $('refresh'); btn.disabled = true;
  const src = source;
  try {
    const res = await globalThis.LBVrefresh(src, (done, total) => { btn.textContent = done + '/' + total; });
    if (src === source) showResult(res);
    if (!current && !shownSlug) loadTop();
  } catch (e) {
    const noSite = !(await hasSite());
    if (noSite) $('grant').hidden = false;
    $('wl-note').textContent = noSite ? 'Vernieuwen lukt pas als je hierboven toegang geeft.' : 'Vernieuwen mislukt: ' + e.message + '.';
  }
  btn.disabled = false; btn.textContent = 'Vernieuwen';
}
$('refresh').addEventListener('click', refresh);
$('to-wl').addEventListener('click', async () => {
  setSource(globalThis.LBVwatchlistSource);
  const stored = await globalThis.LBVstored('wl');
  if (stored) showResult(stored);
  else { W = globalThis.LBV_WATCHLIST; $('wl-note').textContent = 'Snapshot van 19 oktober 2026.'; list(); }
});
// "‎Top 250, a list of films by X • Letterboxd" -> "Top 250"
const listTitle = t => (t || '').replace(/^\u200e/, '').replace(/\s*•\s*Letterboxd\s*$/, '').replace(/,\s*a list of films by .*$/i, '').trim();

// Toegang tot letterboxd.com: Firefox geeft die bij Manifest V3 niet altijd vanzelf (zeker niet bij een tijdelijke extensie).
const SITE = { origins: ['https://letterboxd.com/*'] };
const hasSite = () => browser.permissions.contains(SITE).catch(() => true);
$('grant-btn').addEventListener('click', () => {
  // request() moet direct in de klik gebeuren, zonder await ervoor.
  browser.permissions.request(SITE).then(async ok => {
    if (!ok) return;
    $('grant').hidden = true;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https:\/\/letterboxd\.com\//.test(tab.url || '')) browser.tabs.reload(tab.id); // content scripts laden
    window.close();
  });
});

(async () => {
  if (!(await hasSite())) $('grant').hidden = false;
  let tab = null;
  try { [tab] = await browser.tabs.query({ active: true, currentWindow: true }); } catch (e) {}
  const listSrc = tab && globalThis.LBVlistSource(tab.url || '');
  if (listSrc) {
    setSource(listSrc, listTitle(tab.title));
    const stored = await globalThis.LBVstored(listSrc.key);
    if (stored) showResult(stored);
    else { W = []; list(); $('wl-note').textContent = 'Lijst wordt opgehaald…'; refresh(); }
  } else {
    const stored = await globalThis.LBVstored('wl');
    if (stored) showResult(stored);
  }
  try {
    if (tab && /^https:\/\/letterboxd\.com\/film\/[^/]+\/?$/.test(tab.url || '')) {
      const data = await browser.tabs.sendMessage(tab.id, { type: 'lbv:film' });
      if (data && data.f.crowd != null) { current = data; loadCurrent(); return; }
    }
  } catch (e) { /* geen filmpagina of content script nog niet klaar */ }
  loadTop();
})();