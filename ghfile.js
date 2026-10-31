'use strict';

// Klein hulpje voor JSON-bestanden in een GitHub-repo (contents-API), gedeeld door widgets/berichten.js (dashboard) en
// mensen-view.js (hun pagina). Gebruikt voor de live-koppeling van "Mensen" (sinds 0.51.0): per persoon een eigen privé
// repo met een eigen fine-grained token (alleen die repo). Met ETag: een 304 telt niet mee voor de GitHub-limiet, dus
// elke paar seconden kijken kost bijna niets.
window.GHFILE = (() => {
  const API = 'https://api.github.com/repos/';
  const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const enc = (s) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
  const headers = (token, extra) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra });

  // { status: 200, data, sha, etag } | { status: 304 } | { status: 404, data: null }
  async function get(repo, token, path, etag) {
    const res = await fetch(`${API}${repo}/contents/${path}`, { cache: 'no-store', headers: headers(token, etag ? { 'If-None-Match': etag } : {}) });
    if (res.status === 304) return { status: 304 };
    if (res.status === 404) return { status: 404, data: null };
    if (!res.ok) throw new Error(res.status === 401 ? 'Token ongeldig of verlopen' : `GitHub-fout ${res.status}`);
    const f = await res.json();
    return { status: 200, data: JSON.parse(dec(f.content || '') || 'null'), sha: f.sha, etag: res.headers.get('ETag') };
  }

  // Lezen, aanpassen, schrijven; bij een botsing (iemand schreef net) opnieuw. Geeft de nieuwe inhoud terug.
  async function update(repo, token, path, change, message) {
    for (let i = 0; i < 3; i++) {
      const cur = await get(repo, token, path);
      const data = change(cur.data);
      const res = await fetch(`${API}${repo}/contents/${path}`, {
        method: 'PUT',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message, content: enc(`${JSON.stringify(data, null, 1)}\n`), ...(cur.sha ? { sha: cur.sha } : {}) }),
      });
      if (res.ok) return data;
      if (res.status !== 409 && res.status !== 422) throw new Error(res.status === 401 ? 'Token ongeldig of verlopen' : res.status === 403 || res.status === 404 ? 'Token mag niet in deze repo schrijven' : `GitHub-fout ${res.status}`);
    }
    throw new Error('Opslaan lukte niet (steeds tegelijk gewijzigd)');
  }

  return { get, update };
})();
