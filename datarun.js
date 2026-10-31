'use strict';

// Archief elk uur laten draaien (sinds 0.52.0). GitHub stelt geplande runs van de Action "Verzamelen" in dashboard-data
// flink uit (31 okt 2026: elke 5-7 uur in plaats van elk uur). Daarom start elk dashboard met het archief-token de run zelf
// (workflow_dispatch) als de laatste run, gepland of niet, meer dan 55 minuten geleden begon. Elke 10 minuten kijken, met
// een willekeurige wachttijd zodat twee dashboards (staand scherm, laptop) niet tegelijk starten; ook op een tabblad op de
// achtergrond. Nodig: het archief-token met "Actions: Read and write" erbij (README stap 14). Zonder dat recht: één keer
// een melding in de console en daarna niet meer proberen (tot herladen). Stand in localStorage data.run.
(() => {
  const D = window.DASH_DATA;
  if (!D || DASH.DEMO) return;
  const API = `https://api.github.com/repos/${D.REPO}/actions/workflows/collect.yml`;
  const GAP = 55 * 60 * 1000;
  let off = false;

  async function gh(path, opts = {}) {
    return fetch(API + path, { ...opts, cache: 'no-store', headers: { Authorization: `Bearer ${D.token()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) } });
  }

  async function check() {
    if (off || !D.token()) return;
    try {
      const r = await gh('/runs?per_page=1');
      if (r.status === 401 || r.status === 403 || r.status === 404) { off = true; DASH.store.set('data.run', { error: 'token mist "Actions: Read and write"', at: Date.now() }); console.info('[datarun] archief-token mag de Action niet zien/starten; zie README stap 14'); return; }
      const last = ((await r.json()).workflow_runs || [])[0];
      if (last && Date.now() - Date.parse(last.created_at) < GAP) return;
      const d = await gh('/dispatches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
      if (d.status === 403 || d.status === 404) { off = true; DASH.store.set('data.run', { error: 'token mag de Action niet starten', at: Date.now() }); return; }
      DASH.store.set('data.run', { started: Date.now(), ok: d.status === 204 });
    } catch (e) {
      console.warn('[datarun]', e);
    }
  }

  const later = () => setTimeout(check, Math.random() * 60000);
  later();
  setInterval(later, 10 * 60 * 1000);
  window.addEventListener('dash:data-token', () => { off = false; later(); });
})();
