'use strict';

// One login on every computer (since 0.47.0). All keys of this browser in one bundle (vault.json in the public repo),
// encrypted in the browser with Noah's password: PBKDF2-SHA256 (600,000 rounds) → AES-GCM 256. Unreadable without the password.
// - Loads as the first script after config.js: picks the storage for the whole dashboard here. "Remember this computer" off =
//   sessionStorage mode: window.localStorage then points to sessionStorage, so everything (tokens, caches) is gone when the
//   tab closes, also in files that use localStorage themselves.
// - Login screen when this browser has no keys yet and there is a bundle. "Without logging in" = the dashboard without personal tiles.
// - Log out (button in the top bar, only in browsers that logged in via the bundle) wipes all of the dashboard's storage.
// - Make a bundle: Settings › Log in, only where the helper runs (it supplies the lasting Google and Spotify
//   keys via /vault/keys, and writes vault.json and pushes it). Since 0.48.0 Google and Spotify refresh themselves.
window.DASH_VAULT = (() => {
  const ITER = 600000;
  const KEYS = ['data.token', 'feeds.twelvedata'];   // from this browser
  const HELPER_KEYS = ['google.refresh', 'spotify.tokens'];   // from the helper (lasting keys, see below)
  const FLAG = 'vault.session';                      // in sessionStorage: this tab isn't remembered
  const MARK = 'vault.unlocked';                     // in the chosen storage: logged in via the bundle
  const SKIP = 'vault.skip';                         // in sessionStorage: "without logging in" chosen
  const HELPER = 'http://127.0.0.1:8765/vault';
  const realLocal = (() => { try { return window.localStorage; } catch { return null; } })();
  const session = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const demo = new URLSearchParams(location.search).has('demo');

  const sget = (k) => { try { return session.getItem(k); } catch { return null; } };
  const sset = (k, v) => { try { session.setItem(k, v); } catch {} };

  function useSession() {
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => session }); return true; } catch { return false; }
  }
  if (sget(FLAG)) useSession();

  const store = () => window.localStorage;
  const has = (k) => { try { return store().getItem(k) != null; } catch { return false; } };

  // ---------- Versleuteling ----------
  const enc = new TextEncoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function seal(password, payload) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ITER);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, cipher: 'AES-GCM', salt: b64(salt), iv: b64(iv), data: b64(data) };
  }

  async function open(password, box) {
    if (!box || box.v !== 1) throw new Error('Onbekend bundelformaat');
    const key = await deriveKey(password, unb64(box.salt), box.iter);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      throw new Error('Wrong password');
    }
  }

  async function fetchBox() {
    const res = await fetch(`vault.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }

  // ---------- Logging in and out ----------
  async function unlock(password, remember) {
    const box = await fetchBox();
    if (!box) throw new Error('There is no bundle online yet');
    const payload = await open(password, box);
    // Not remembered: also remove from the real storage what the dashboard wrote before logging in (caches)
    if (!remember) { try { realLocal && realLocal.clear(); } catch {} sset(FLAG, '1'); useSession(); }
    const s = store();
    for (const [k, v] of Object.entries(payload.keys || {})) if (typeof v === 'string') s.setItem(k, v);
    s.setItem(MARK, JSON.stringify({ at: new Date().toISOString(), remember: !!remember }));
    // Supabase belongs to the same login (sync.js, since 1.1.0): derive the password from the passphrase, log in by itself after a reload
    try { if (window.DASH_SB) await DASH_SB.prepare(password); } catch (e) { console.warn('[vault] supabase', e); }
    location.reload();
  }

  function logout() {
    try { realLocal && realLocal.clear(); } catch {}
    try { session && session.clear(); } catch {}
    if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    location.reload();
  }

  const unlocked = () => has(MARK);
  const hasKeys = () => [...KEYS, ...HELPER_KEYS].some(has);

  // ---------- Inlogscherm ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function showLogin() {
    const dlg = el('dialog', 'panel-dialog vault-dialog');
    dlg.setAttribute('aria-label', 'Log in');
    const form = el('form', 'vault-form');
    form.method = 'dialog';
    const pw = el('input', 'vault-input');
    Object.assign(pw, { type: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
    const rem = el('label', 'vault-check');
    const box = el('input');
    box.type = 'checkbox';
    rem.append(box, el('span', null, 'Remember this computer (only on your own laptop/PC)'));
    const go = el('button', 'w-btn vault-go', 'Unlock');
    go.type = 'submit';
    const err = el('p', 'vault-err');
    err.setAttribute('role', 'alert');
    const skip = el('button', 'vault-skip', 'Continue without logging in');
    skip.type = 'button';
    skip.onclick = () => { sset(SKIP, '1'); dlg.close(); };
    form.append(
      el('h2', null, 'Log in to your dashboard'),
      el('p', 'w-note', 'This browser has no connections yet.'),
      pw, rem, go, err,
      el('p', 'w-note vault-small', 'Not remembered = logged out as soon as you close the tab. Without logging in: the dashboard without personal tiles.'),
      skip,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true;
      go.textContent = 'Busy…';
      err.textContent = '';
      try {
        await unlock(pw.value, box.checked);
      } catch (x) {
        err.textContent = x.message || 'Unlocking failed';
        go.disabled = false;
        go.textContent = 'Ontgrendel';
        pw.select();
      }
    });
    dlg.addEventListener('cancel', () => sset(SKIP, '1'));
    dlg.append(form);
    document.body.append(dlg);
    dlg.showModal();
    pw.focus();
  }

  // ---------- Log-out button in the top bar ----------
  function logoutButton() {
    const actions = document.querySelector('#topbar .tb-actions');
    if (!actions || !unlocked()) return;
    const b = el('button', 'tb-btn tb-logout');
    b.type = 'button';
    b.title = sget(FLAG) ? 'Log out (also happens when you close this tab)' : 'Log out and wipe everything of the dashboard from this browser';
    b.setAttribute('aria-label', 'Log out');
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 17v-3H3v-4h7V7l5 5-5 5zm2-15h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-7v-2h7V4h-7V2z"/></svg>';
    b.onclick = () => { if (confirm('Log out? Everything of the dashboard will be wiped from this browser.')) logout(); };
    actions.insertBefore(b, actions.querySelector('.tb-settings') || actions.firstChild);
  }

  // ---------- Settings › Log in ----------
  // { exists, made } from the helper; 'old' = it runs, but doesn't know /vault yet (run start.bat again)
  async function helperUp() {
    try {
      const r = await fetch(HELPER, { cache: 'no-store' });
      if (!r.ok) return 'old';
      const info = await r.json();
      const k = await fetch(`${HELPER}/keys`, { cache: 'no-store' });
      if (!k.ok) return 'old';
      return { ...info, keys: await k.json() };
    } catch { return null; }
  }

  // Lasting keys from the helper as storage values: Google (calendar.js fromBundle) and Spotify (spotify.js,
  // with `secret`: that key doesn't expire on use, unlike the one from the normal PKCE login)
  function helperValues(keys) {
    const out = {};
    if (keys.google) out['google.refresh'] = JSON.stringify(keys.google);
    if (keys.spotify) out['spotify.tokens'] = JSON.stringify({ access: '', refresh: keys.spotify.refresh, expires: 0, scope: keys.spotify.scope, secret: keys.spotify.client_secret });
    return out;
  }

  function settingsTab(root) {
    const h = DASH.h;
    if (window.DASH_SB) DASH_SB.settingsPart(root);
    root.append(h('p', 'w-note', 'Make the encrypted bundle with this browser\'s keys here. After that you can log in on any computer with just your password. Pick a long passphrase (4+ words): anyone can download the bundle and try to guess it.'));
    const list = h('ul', 'vault-list');
    for (const k of KEYS) list.append(h('li', has(k) ? 'ok' : 'no', `${k}: ${has(k) ? 'in this browser' : 'missing here'}`));
    root.append(list);
    const helperList = h('ul', 'vault-list');
    root.append(helperList);
    const status = h('p', 'w-note', 'Looking for the helper…');
    root.append(status);
    helperUp().then((info) => {
      if (!info) {
        status.textContent = 'The helper isn\'t running here. You can only make a bundle on your own PC (start.bat in dashboard/helper).';
        return;
      }
      if (info === 'old') {
        status.textContent = 'The helper is running, but it\'s an old version. Double-click start.bat in dashboard/helper and open this tab again.';
        return;
      }
      const extra = helperValues(info.keys);
      helperList.append(
        h('li', extra['google.refresh'] ? 'ok' : 'no', `Google (agenda, mail, health): ${extra['google.refresh'] ? 'linked in the helper' : 'not linked yet (127.0.0.1:8765/link)'}`),
        h('li', extra['spotify.tokens'] ? 'ok' : 'no', `Spotify: ${extra['spotify.tokens'] ? 'linked in the helper' : 'not linked yet (127.0.0.1:8765/link, README step 8)'}`),
      );
      status.textContent = info.exists ? `There is already a bundle online (made ${info.made || 'unknown'}). A new one replaces it.` : 'There is no bundle online yet.';
      const pw1 = h('input', 'vault-input');
      const pw2 = h('input', 'vault-input');
      Object.assign(pw1, { type: 'password', autocomplete: 'new-password', placeholder: 'New password' });
      Object.assign(pw2, { type: 'password', autocomplete: 'new-password', placeholder: 'Once more' });
      const go = h('button', 'w-btn', 'Create bundle and put it online');
      go.type = 'button';
      const out = h('p', 'w-note');
      go.onclick = async () => {
        if (pw1.value.length < 12) { out.textContent = 'Too short: at least 12 characters (preferably 4+ words).'; return; }
        if (pw1.value !== pw2.value) { out.textContent = 'The passwords don\'t match.'; return; }
        const keys = {};
        for (const k of KEYS) { const v = store().getItem(k); if (v != null) keys[k] = v; }
        Object.assign(keys, extra);
        if (!Object.keys(keys).length) { out.textContent = 'There are no keys in this browser.'; return; }
        go.disabled = true;
        out.textContent = 'Versleutelen…';
        try {
          const box = await seal(pw1.value, { keys, made: new Date().toISOString() });
          box.made = new Date().toISOString().slice(0, 10);
          const r = await fetch(HELPER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(box) });
          const res = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(res.error || `Error ${r.status}`);
          // New passphrase = also a new Supabase password (derived, sync.js); this browser converts it
          let sbNote = '';
          if (res.pushed && window.DASH_SB && DASH_SB.linked()) {
            sbNote = await DASH_SB.changePassphrase(pw1.value).then(() => ' Supabase password converted.', (e) => ` Converting the Supabase password failed (${e.message}): link Supabase again on every device.`);
          }
          out.textContent = `Done: ${Object.keys(keys).length} keys encrypted${res.pushed ? ' and put online (live in a minute or two)' : ', but pushing failed: ' + (res.error || '?')}.${sbNote}`;
          pw1.value = pw2.value = '';
        } catch (x) {
          out.textContent = `Failed: ${x.message}`;
        } finally {
          go.disabled = false;
        }
      };
      root.append(pw1, pw2, go, out);
    });
  }

  // ---------- Start ----------
  document.addEventListener('DOMContentLoaded', () => {
    logoutButton();
    if (window.DASH_SETTINGS) DASH_SETTINGS.add({ id: 'login', label: 'Log in', order: 30, render: settingsTab });
    if (demo || hasKeys() || sget(SKIP)) return;
    fetchBox().then((box) => { if (box) showLogin(); }).catch(() => {});
  });

  return { KEYS, HELPER_KEYS, unlock, logout, unlocked, seal, open };
})();
