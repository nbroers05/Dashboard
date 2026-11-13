'use strict';

// Make the archive run every hour (since 0.52.0). GitHub delays scheduled runs of the Action "Verzamelen" in dashboard-data
// a lot (31 Oct 2026: every 5-7 hours instead of every hour). So every dashboard with the archive token starts the run itself
// (workflow_dispatch) when the last run, scheduled or not, began more than 55 minutes ago. Checks every 10 minutes, with
// a random wait (0-5 min) so two dashboards (portrait screen, laptop) don't start at the same time; also in a tab in the
// background. Needs: the archive token with "Actions: Read and write". Without that permission: one
// message in the console and then no more tries (until a reload). Status in localStorage data.run.
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
      if (r.status === 401 || r.status === 403 || r.status === 404) { off = true; DASH.store.set('data.run', { error: 'token lacks "Actions: Read and write"', at: Date.now() }); console.info('[datarun] the archive token may not see/start the Action'); return; }
      const last = ((await r.json()).workflow_runs || [])[0];
      const prev = DASH.store.get('data.run') || {};
      if (last && Date.now() - Date.parse(last.created_at) < GAP) {
        DASH.store.set('data.run', { lastRun: Date.parse(last.created_at), started: prev.started || null });
        return;
      }
      const d = await gh('/dispatches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
      if (d.status === 403 || d.status === 404) { off = true; DASH.store.set('data.run', { error: 'the token may not start the Action', at: Date.now() }); return; }
      DASH.store.set('data.run', { lastRun: Date.now(), started: Date.now(), ok: d.status === 204 });
    } catch (e) {
      console.warn('[datarun]', e);
    }
  }

  // Wait 0-5 minutes: on 31 Oct two dashboards started within 31 s (a new run doesn't show in the list right away)
  const later = () => setTimeout(check, Math.random() * 5 * 60000);
  later();
  setInterval(later, 10 * 60 * 1000);
  window.addEventListener('dash:data-token', () => { off = false; later(); });
})();
