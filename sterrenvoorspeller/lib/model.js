// Formule v2 met Marijn: één bron voor de kaart op de filmpagina, de popup en de test.
(function (root) {
  const { C, R, RN } = root.LBV_DATA;

  // Gemiddelde bonus van de regisseurs die in de tabel staan; onbekende tellen niet mee.
  function regieBonus(names) {
    const list = Array.isArray(names) ? names : String(names || '').split(/,\s*/);
    const known = list.map(d => d.trim()).filter(d => R[d] != null);
    return known.length ? known.reduce((a, d) => a + R[d], 0) / known.length : 0;
  }

  // f: { crowd, n, jp, com, fam, streng, loeka, marijn (null = geen rating), regie (string of array) }
  function predict(f) {
    const names = Array.isArray(f.regie) ? f.regie : String(f.regie || '').split(/,\s*/).filter(Boolean);
    const known = names.filter(d => R[d] != null);
    const parts = [
      ['Basis (gemiddelde film, 3,6 op Letterboxd)', C.Intercept],
      ['Letterboxd-gemiddelde', C.crowd_c * (f.crowd - 3.6)],
      ['Japanse film', f.jp ? C.l_Japan : 0],
      ['Komedie', f.com ? C.g_Comedy : 0],
      ['Familiefilm', f.fam ? C.g_Family : 0],
      ['Populariteit', C.pop_c * (Math.log10(Math.max(f.n, 1)) - 5)],
      ['Strengere periode (vanaf 2025)', f.streng ? C.streng_periode : 0],
      ['Loeka', f.loeka != null ? C.loeka_afw * (f.loeka - f.crowd) : 0],
      ['Marijn', f.marijn != null ? C.marijn_afw * (f.marijn - f.crowd) : 0],
      ['Regisseur' + (known.length ? ' (' + known.join(', ') + ')' : ''), regieBonus(names)]
    ];
    const raw = parts.reduce((s, p) => s + p[1], 0);
    return { raw, value: Math.min(5, Math.max(0.5, raw)), parts };
  }

  // Rijen voor het opbouw-tabelletje: de strenge periode zit in "Basis", nulposten vallen weg.
  function displayParts(r) {
    const streng = r.parts.find(p => p[0].startsWith('Strengere'));
    return r.parts
      .filter(p => p !== streng)
      .map(p => p[0].startsWith('Basis') ? ['Basis', p[1] + streng[1]] : p)
      .filter((p, i) => i < 2 || Math.abs(p[1]) > 0.0005);
  }

  const halfStar = v => Math.min(5, Math.max(0.5, Math.round(v * 2) / 2));
  const nl = (v, d = 2) => v.toFixed(d).replace('.', ',');
  function starsFor(v) {
    const h = halfStar(v); let s = '';
    for (let i = 1; i <= 5; i++) s += h >= i ? '★' : (h >= i - 0.5 ? '½' : '');
    return s;
  }
  // "4" of "3.5": afgerond op een halve ster
  const halfLabel = v => { const h = halfStar(v); return h % 1 ? h.toFixed(1) : String(h); };

  root.LBV = { C, R, RN, predict, displayParts, regieBonus, halfStar, halfLabel, starsFor, nl };
  if (typeof module !== 'undefined') module.exports = root.LBV;
})(globalThis);
