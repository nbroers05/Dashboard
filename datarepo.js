'use strict';

// Connection to the PRIVATE repo with Noah's data archive (config.dataRepo, default nbroers05/dashboard-data).
// Uses a fine-grained GitHub token that's only in this browser's localStorage (never in the code):
// access to that one repo only, "Contents: Read and write". Used by the check-in and the Episodes Left log (writing) and the
// Data overview (reading data/status.json). Nothing ever goes to the public dashboard repo.
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

  // UTF-8 <-> base64 (GitHub gives and wants files as base64)
  const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const b64encode = (s) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };

  class DataError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function call(path, opts = {}) {
    const t = token();
    if (!t) throw new DataError(0, 'No token set yet');
    const res = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    });
    if (res.status === 404 && !opts.method) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 401 ? 'Token invalid or expired' : res.status === 403 ? 'The token may not write in this repo (permissions?)' : res.status === 404 ? `Repo ${REPO} not found (does it exist, and may the token access it?)` : (data.message || `GitHub error ${res.status}`);
      throw new DataError(res.status, msg);
    }
    return data;
  }

  // Read a file as text (null if it doesn't exist)
  async function read(path) {
    const f = await call(path);
    return f ? { text: b64decode(f.content || ''), sha: f.sha } : null;
  }

  // ---------- CSV ----------
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Parsing just the header line is enough: we add rows in the same column order
  const header = (text) => text.split(/\r?\n/, 1)[0].split(',').map((c) => c.replace(/^"|"$/g, ''));

  // Add a row to a month file; on a clash (someone else just wrote) try again
  async function appendCsv(path, columns, row) {
    return appendRows(path, columns, [row], `Check-in ${row.timestamp_utc || ''}`.trim());
  }

  // Several rows at once (one commit); rows with an id that's already there are skipped
  async function appendRows(path, columns, rows, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await read(path);
      let cols = columns, text;
      if (cur && cur.text.trim()) {
        cols = header(cur.text);
        for (const c of columns) if (!cols.includes(c)) cols.push(c);   // new column: goes at the end (lib.py fills it in)
        const todo = rows.filter((r) => !(r.id && cur.text.includes(`,${r.id},`)));   // already saved
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
        if (e.status !== 409 && e.status !== 422) throw e;   // 409/422 = file changed in the meantime: again
      }
    }
    throw new DataError(409, 'Couldn\'t save (the file kept being changed at the same time)');
  }

  // Change a JSON file (since 0.50.0): change(data) gets the current content
  // and changes it; on a clash again with the newest version, so changes from the PC/Action aren't lost
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
    throw new DataError(409, 'Couldn\'t save (the file kept being changed at the same time)');
  }

  // ---------- Time in Amsterdam (same format as scripts/lib.py) ----------
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
