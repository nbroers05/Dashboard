'use strict';

// Fast sync via Supabase (since 1.1.0, phase 1 of the idea "Fast sync via Supabase").
// Own Supabase project "dashboard" (separate from the planner). Tables and Row Level Security: supabase.sql.
// Without Supabase (config still a placeholder, no internet, this browser not linked) everything works like before 1.1.0:
// localStorage, and Canvas check marks via the archive.
//
// Logging in is part of the existing login (vault.js), without a second login screen:
// - The Supabase password is derived from the passphrase: PBKDF2-SHA256(passphrase, own salt, 600,000 rounds) → 32 bytes.
//   On unlocking (vault.js) or once via Settings › Log in › "Link Supabase" (browsers that were already logged in,
//   like tall) { email, pw } goes into storage as sb.login. The passphrase itself is never saved.
// - With that this browser logs itself in, and again as soon as the session expired or the refresh key stops working.
//   So there's never a login screen: if it fails, the dashboard quietly falls back to localStorage and tries later.
// - If the account doesn't exist yet, the first linked browser creates it (signup; see README "Supabase").
// - vault.json doesn't change. A new bundle with a new passphrase converts the Supabase password too (vault.js).
//
// Shared settings (table dashboard_settings, one row per key, newest wins): SHARED below. Every write
// to those keys in localStorage is noticed (also from files that use localStorage themselves) and goes along.
// Everything else stays per device (see CLAUDE.md, "Supabase").
window.DASH_SB = (() => {
  const cfg = (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.supabase) || {};
  const DEMO = new URLSearchParams(location.search).has('demo');
  const placeholder = (s) => !s || /_(HERE|HIER)$/.test(s);
  const configured = !DEMO && !placeholder(cfg.url) && !placeholder(cfg.anonKey) && !placeholder(cfg.email);
  const URL_ = configured ? cfg.url.replace(/\/+$/, '') : '';

  const LOGIN = 'sb.login';       // { email, pw } derived from the passphrase
  const SESSION = 'sb.session';   // { access, refresh, expires (ms), user }
  const STAMPS = 'sb.stamps';     // { key: ms } when this browser last changed a shared setting
  const STATE = 'sb.state';       // last status for Settings: { ok, at, msg }
  const SALT = 'dashboard-supabase-v1';
  const ITER = 600000;

  // The same on every device. Only things the user sets; caches and device choices are deliberately not in it.
  const SHARED = ['dash.links', 'health.goal', 'todo.items'];

  // ---------- Storage (raw, without the hook below) ----------
  const proto = window.Storage && Storage.prototype;
  const rawSet = proto && proto.setItem, rawRemove = proto && proto.removeItem;
  const ls = () => window.localStorage;
  const get = (k) => { try { return JSON.parse(ls().getItem(k)); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) rawRemove.call(ls(), k); else rawSet.call(ls(), k, JSON.stringify(v)); } catch {} };

  function setState(ok, msg) {
    put(STATE, { ok, msg, at: Date.now() });
    window.dispatchEvent(new CustomEvent('dash:sb-state'));
  }

  // ---------- Password from the passphrase ----------
  async function derive(passphrase) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`${SALT}:${URL_}`), iterations: ITER }, base, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/=+$/, '');
  }
  // After unlocking (vault.js) or "Link Supabase": get the login details ready for this browser
  async function prepare(passphrase) {
    if (!configured) return false;
    put(LOGIN, { email: cfg.email, pw: await derive(passphrase) });
    put(SESSION, null);
    return true;
  }
  const linked = () => configured && !!(get(LOGIN) || {}).pw;

  // ---------- Auth (plain fetch to GoTrue, no library) ----------
  async function auth(path, body, token) {
    const res = await fetch(`${URL_}/auth/v1/${path}`, {
      method: body ? (path === 'user' ? 'PUT' : 'POST') : 'GET',
      headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.msg || data.error_description || data.message || `Supabase error ${res.status}`);
      e.status = res.status;
      e.code = data.error_code || data.code || data.error;
      throw e;
    }
    return data;
  }
  function keep(data) {
    const s = { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + (data.expires_in || 3600) * 1000, user: data.user && data.user.id };
    put(SESSION, s);
    return s;
  }
  async function passwordLogin() {
    const login = get(LOGIN);
    try {
      return keep(await auth('token?grant_type=password', { email: login.email, password: login.pw }));
    } catch (e) {
      if (e.status !== 400 || !/invalid_credentials|invalid_grant/.test(e.code || '') && !/invalid login/i.test(e.message)) throw e;
      // No account yet: the first linked browser creates it (only works while "Allow new users to sign up" is on)
      const made = await auth('signup', { email: login.email, password: login.pw }).catch((x) => { x.message = `Logging in failed and creating an account failed too (${x.message})`; throw x; });
      if (made.access_token) return keep(made);
      throw new Error('Account created, but Supabase wants a confirmation email first (turn "Confirm email" off, README "Supabase")');
    }
  }
  // Valid access token; refreshes or logs in again when needed. One at a time.
  let pending = null;
  function token(force) {
    if (!linked()) return Promise.reject(new Error('not linked'));
    const s = get(SESSION);
    if (!force && s && s.access && s.expires - Date.now() > 60000) return Promise.resolve(s);
    if (pending) return pending;
    pending = (async () => {
      try {
        if (s && s.refresh) {
          try { return keep(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh })); } catch (e) {
            if (!e.status) throw e;   // no internet: don't log in again, just later
          }
        }
        return await passwordLogin();
      } finally { pending = null; }
    })();
    return pending;
  }

  // ---------- REST ----------
  async function rest(path, { method = 'GET', body, prefer } = {}, retried) {
    const s = await token();
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      method,
      cache: 'no-store',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${s.access}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) { await token(true); return rest(path, { method, body, prefer }, true); }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Supabase error ${res.status}`);
    }
    setState(true, 'Synced');
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  const userId = () => (get(SESSION) || {}).user;
  // Upsert with a fixed user_id (a bulk insert otherwise fills missing columns with null instead of the default)
  async function upsert(table, rows, conflict) {
    if (!rows.length) return;
    await token();
    const uid = userId();
    await rest(`${table}?on_conflict=${conflict}`, { method: 'POST', body: rows.map((r) => ({ user_id: uid, ...r })), prefer: 'resolution=merge-duplicates,return=minimal' });
  }

  // ---------- Shared settings ----------
  const stamps = () => get(STAMPS) || {};
  function stamp(key) { const s = stamps(); s[key] = Date.now(); put(STAMPS, s); }
  let applying = false, pushTimer = null;

  // Notice every write to a shared key, whichever file does it
  if (configured && proto) {
    proto.setItem = function (k, v) {
      rawSet.call(this, k, v);
      if (!applying && SHARED.includes(k) && this === window.localStorage) { stamp(k); schedulePush(); }
    };
    proto.removeItem = function (k) {
      rawRemove.call(this, k);
      if (!applying && SHARED.includes(k) && this === window.localStorage) { stamp(k); schedulePush(); }
    };
  }
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncSettings().catch(fail), 1500); }

  async function syncSettings() {
    const remote = await rest(`dashboard_settings?select=key,value,updated_at&key=in.(${SHARED.map((k) => `"${k}"`).join(',')})`);
    const byKey = Object.fromEntries((remote || []).map((r) => [r.key, r]));
    const st = stamps();
    const up = [], changed = [];
    for (const key of SHARED) {
      const r = byKey[key];
      const mine = st[key] || 0;
      const theirs = r ? Date.parse(r.updated_at) : 0;
      const local = (() => { try { return ls().getItem(key); } catch { return null; } })();
      if (r && theirs > mine) {
        const val = r.value == null ? null : JSON.stringify(r.value);
        if (val !== local) {
          applying = true;
          try { if (val == null) ls().removeItem(key); else ls().setItem(key, val); } catch {} finally { applying = false; }
          changed.push(key);
        }
        st[key] = theirs;
      } else if (mine > theirs || (!r && local != null)) {
        // Newer here, or not online yet (first time: with time 1, so any real change elsewhere wins)
        let value = null;
        try { value = local == null ? null : JSON.parse(local); } catch {}
        const t = mine || 1;
        up.push({ key, value, updated_at: new Date(t).toISOString() });
        st[key] = t;
      }
    }
    put(STAMPS, st);
    if (up.length) await upsert('dashboard_settings', up, 'user_id,key');
    for (const key of changed) window.dispatchEvent(new CustomEvent('dash:synced', { detail: { key } }));
  }

  // Internal flags (starting with _), e.g. whether the Canvas check marks from the archive were already copied
  async function flag(key, value) {
    if (value === undefined) {
      const r = await rest(`dashboard_settings?select=value&key=eq.${encodeURIComponent(key)}`);
      return r && r[0] ? r[0].value : null;
    }
    await upsert('dashboard_settings', [{ key, value, updated_at: new Date().toISOString() }], 'user_id,key');
  }

  // ---------- Convert the Supabase password (new bundle with a new passphrase, vault.js) ----------
  async function changePassphrase(passphrase) {
    if (!linked()) return false;
    const s = await token();
    const pw = await derive(passphrase);
    await auth('user', { password: pw }, s.access);
    put(LOGIN, { email: cfg.email, pw });
    return true;
  }

  // ---------- Ritme ----------
  function fail(e) {
    const offline = !navigator.onLine || e instanceof TypeError;
    setState(false, offline ? 'No connection, carrying on locally' : (e && e.message) || 'Unknown error');
    if (!offline) console.warn('[sync]', e);
  }
  const tick = () => { if (linked()) syncSettings().catch(fail); };
  if (configured) {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tick, 800);
      DASH.every(5 * 60 * 1000, tick);
      addEventListener('online', tick);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    });
  }

  // ---------- Settings › Log in ----------
  function settingsPart(root) {
    const h = DASH.h;
    const box = h('div', 'sb-part');
    root.append(box);
    function draw() {
      box.replaceChildren(h('h3', 'sb-head', 'Supabase (shared settings and Canvas check marks)'));
      if (!configured) {
        box.append(h('p', 'w-note', 'Not set up yet: fill in the URL, anon key and email address under supabase in config.js (README "Supabase"). Until then everything stays in this browser.'));
        return;
      }
      const st = get(STATE);
      if (linked()) {
        const when = st && st.at ? new Date(st.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
        box.append(h('p', `w-note ${st && st.ok === false ? 'sb-bad' : ''}`, st ? `${st.msg}${when ? ` (${when})` : ''}` : 'Linked, not synced yet.'));
      } else {
        box.append(h('p', 'w-note', 'This browser isn\'t linked yet. Type your passphrase here once; after that it logs itself in and stays logged in.'));
      }
      const pw = h('input', 'vault-input');
      Object.assign(pw, { type: 'password', autocomplete: 'current-password', placeholder: 'Passphrase' });
      const go = h('button', 'w-btn', linked() ? 'Link again' : 'Link Supabase');
      go.type = 'button';
      const out = h('p', 'w-note');
      go.onclick = async () => {
        go.disabled = true;
        out.textContent = 'Checking…';
        try {
          // First check it's the real passphrase (the bundle has to open)
          const res = await fetch(`vault.json?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('There is no bundle online');
          await DASH_VAULT.open(pw.value, await res.json());
          await prepare(pw.value);
          await token(true);
          await syncSettings();
          window.dispatchEvent(new CustomEvent('dash:sb-linked'));
          pw.value = '';
          draw();
        } catch (e) {
          out.textContent = `Failed: ${e.message}`;
          go.disabled = false;
        }
      };
      box.append(pw, go, out);
    }
    draw();
  }

  return { configured, linked, prepare, token, rest, upsert, flag, userId, changePassphrase, syncSettings, settingsPart, SHARED, fail };
})();
