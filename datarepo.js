'use strict';

// Verbinding met de PRIVÉ repo met Noahs data-archief (config.dataRepo, standaard nbroers05/dashboard-data).
// Gebruikt een fine-grained GitHub-token dat alleen in localStorage van deze browser staat (nooit in de code):
// alleen toegang tot die ene repo, "Contents: Read and write". Wordt gebruikt door de check-in en het Episodes Left-logboek (schrijven) en het
// Data-overzicht (data/status.json lezen). Er gaat nooit iets naar de publieke dashboard-repo.
window.DASH_DATA = (() => {
  const { store } = DASH;
  const REPO = (window.DASHBOARD_CONFIG || {}).dataRepo || 'nbroers05/dashboard-data';
  const TOKEN = 'data.token';
  const API = `https://api.github.com/repos/${REPO}/contents/`;

  const token = () => store.get(TOKEN);
  function setToken(t) {
    try { if (t) localStorage.setItem(TOKEN, JSON.stringify(t)); else localStorage.removeItem(TOKEN); } catch {}
    window.dispatchEvent(new CustomEvent('dash:data-token'));
  }

  // UTF-8 <-> base64 (GitHub geeft en wil bestanden als base64)
  const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const b64encode = (s) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };

  class DataError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function call(path, opts = {}) {
    const t = token();
    if (!t) throw new DataError(0, 'Nog geen token ingesteld');
    const res = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    });
    if (res.status === 404 && !opts.method) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 401 ? 'Token ongeldig of verlopen' : res.status === 403 ? 'Token mag niet in deze repo schrijven (rechten?)' : res.status === 404 ? `Repo ${REPO} niet gevonden (bestaat hij, en mag het token erbij?)` : (data.message || `GitHub-fout ${res.status}`);
      throw new DataError(res.status, msg);
    }
    return data;
  }

  // Bestand lezen als tekst (null als het niet bestaat)
  async function read(path) {
    const f = await call(path);
    return f ? { text: b64decode(f.content || ''), sha: f.sha } : null;
  }

  // ---------- CSV ----------
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Alleen de kopregel parsen is genoeg: we voegen rijen toe in dezelfde kolomvolgorde
  const header = (text) => text.split(/\r?\n/, 1)[0].split(',').map((c) => c.replace(/^"|"$/g, ''));

  // Rij toevoegen aan een maandbestand; bij een botsing (iemand anders schreef net) opnieuw proberen
  async function appendCsv(path, columns, row) {
    return appendRows(path, columns, [row], `Check-in ${row.timestamp_utc || ''}`.trim());
  }

  // Meerdere rijen in één keer (één commit); rijen met een id die er al staat worden overgeslagen
  async function appendRows(path, columns, rows, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await read(path);
      let cols = columns, text;
      if (cur && cur.text.trim()) {
        cols = header(cur.text);
        for (const c of columns) if (!cols.includes(c)) cols.push(c);   // nieuwe kolom: komt achteraan (lib.py vult op)
        const todo = rows.filter((r) => !(r.id && cur.text.includes(`,${r.id},`)));   // al opgeslagen
        if (!todo.length) return;
        const head = cols.join(',');
        const body = cur.text.split(/\r?\n/).slice(1).filter(Boolean).join('\n');
        text = `${head}\n${body ? `${body}\n` : ''}${todo.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n')}\n`;
      } else {
        text = `${cols.join(',')}\n${rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n')}\n`;
      }
      try {
        await call(path, { method: 'PUT', body: JSON.stringify({ message, content: b64encode(text), ...(cur ? { sha: cur.sha } : {}) }) });
        return;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;   // 409/422 = bestand intussen veranderd: opnieuw
      }
    }
    throw new DataError(409, 'Kon niet opslaan (bestand werd steeds tegelijk gewijzigd)');
  }

  // JSON-bestand aanpassen (sinds 0.50.0, Instellingen › Mensen → config.json): change(data) krijgt de huidige inhoud
  // en past die aan; bij een botsing opnieuw met de nieuwste versie, zodat wijzigingen van de pc/Action niet verloren gaan
  async function updateJson(path, change, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await read(path);
      const data = cur ? JSON.parse(cur.text) : {};
      change(data);
      try {
        await call(path, { method: 'PUT', body: JSON.stringify({ message, content: b64encode(`${JSON.stringify(data, null, 1)}
`), ...(cur ? { sha: cur.sha } : {}) }) });
        return data;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
      }
    }
    throw new DataError(409, 'Kon niet opslaan (bestand werd steeds tegelijk gewijzigd)');
  }

  // ---------- Tijd in Amsterdam (zelfde formaat als scripts/lib.py) ----------
  function localIso(date) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const off = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    const sign = off >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0'), mm = String(Math.abs(off) % 60).padStart(2, '0');
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
  }
  const utcIso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

  return { REPO, token, setToken, read, appendCsv, appendRows, updateJson, localIso, utcIso, DataError };
})();
