'use strict';

// Snelle sync via Supabase (sinds 1.1.0, fase 1 van het idee "Snelle sync via Supabase" in WENSEN.md).
// Eigen Supabase-project "dashboard" (los van de planner). Tabellen en Row Level Security: supabase.sql.
// Zonder Supabase (config nog SUPABASE_URL_HIER, geen internet, deze browser niet gekoppeld) werkt alles zoals vóór 1.1.0:
// localStorage, en Canvas-afvinken via het archief.
//
// Inloggen hoort bij de bestaande inlog (vault.js), zonder tweede inlogscherm:
// - Het Supabase-wachtwoord wordt afgeleid uit de wachtzin: PBKDF2-SHA256(wachtzin, eigen zout, 600.000 rondes) → 32 bytes.
//   Bij het ontgrendelen (vault.js) of eenmalig via Instellingen › Inloggen › "Supabase koppelen" (browsers die al ingelogd
//   waren, zoals tall) komt { email, pw } in de opslag als sb.login. De wachtzin zelf wordt nergens bewaard.
// - Daarmee logt deze browser zelf in, en opnieuw zodra de sessie verlopen is of de vernieuwsleutel niet meer werkt.
//   Er komt dus nooit een inlogscherm: lukt het niet, dan valt het dashboard stil terug op localStorage en probeert het later.
// - Bestaat het account nog niet, dan maakt de eerste gekoppelde browser het aan (signup; zie README "Supabase").
// - vault.json verandert niet. Een nieuwe bundel met een nieuwe wachtzin zet het Supabase-wachtwoord mee om (vault.js).
//
// Gedeelde instellingen (tabel dashboard_settings, één rij per sleutel, nieuwste wint): SHARED hieronder. Elke schrijfactie
// naar die sleutels in localStorage wordt opgemerkt (ook uit bestanden die zelf localStorage gebruiken) en gaat mee.
// Al het andere blijft per apparaat (zie CLAUDE.md, "Supabase").
window.DASH_SB = (() => {
  const cfg = (window.DASHBOARD_CONFIG && DASHBOARD_CONFIG.supabase) || {};
  const DEMO = new URLSearchParams(location.search).has('demo');
  const placeholder = (s) => !s || /_HIER$/.test(s);
  const configured = !DEMO && !placeholder(cfg.url) && !placeholder(cfg.anonKey) && !placeholder(cfg.email);
  const URL_ = configured ? cfg.url.replace(/\/+$/, '') : '';

  const LOGIN = 'sb.login';       // { email, pw } afgeleid uit de wachtzin
  const SESSION = 'sb.session';   // { access, refresh, expires (ms), user }
  const STAMPS = 'sb.stamps';     // { sleutel: ms } wanneer deze browser een gedeelde instelling het laatst aanpaste
  const STATE = 'sb.state';       // laatste stand voor Instellingen: { ok, at, msg }
  const SALT = 'dashboard-supabase-v1';
  const ITER = 600000;

  // Gelijk op elk apparaat. Alleen dingen die de gebruiker zelf instelt; caches en apparaatkeuzes staan er bewust niet in.
  const SHARED = ['dash.links', 'health.goal', 'todo.items'];

  // ---------- Opslag (rauw, zonder de haak hieronder) ----------
  const proto = window.Storage && Storage.prototype;
  const rawSet = proto && proto.setItem, rawRemove = proto && proto.removeItem;
  const ls = () => window.localStorage;
  const get = (k) => { try { return JSON.parse(ls().getItem(k)); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) rawRemove.call(ls(), k); else rawSet.call(ls(), k, JSON.stringify(v)); } catch {} };

  function setState(ok, msg) {
    put(STATE, { ok, msg, at: Date.now() });
    window.dispatchEvent(new CustomEvent('dash:sb-state'));
  }

  // ---------- Wachtwoord uit de wachtzin ----------
  async function derive(passphrase) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`${SALT}:${URL_}`), iterations: ITER }, base, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/=+$/, '');
  }
  // Na het ontgrendelen (vault.js) of "Supabase koppelen": inloggegevens voor deze browser klaarzetten
  async function prepare(passphrase) {
    if (!configured) return false;
    put(LOGIN, { email: cfg.email, pw: await derive(passphrase) });
    put(SESSION, null);
    return true;
  }
  const linked = () => configured && !!(get(LOGIN) || {}).pw;

  // ---------- Auth (gewone fetch naar GoTrue, geen bibliotheek) ----------
  async function auth(path, body, token) {
    const res = await fetch(`${URL_}/auth/v1/${path}`, {
      method: body ? (path === 'user' ? 'PUT' : 'POST') : 'GET',
      headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.msg || data.error_description || data.message || `Supabase-fout ${res.status}`);
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
      // Nog geen account: de eerste gekoppelde browser maakt het aan (werkt alleen zolang "Allow new users to sign up" aan staat)
      const made = await auth('signup', { email: login.email, password: login.pw }).catch((x) => { x.message = `Inloggen lukt niet en een account maken ook niet (${x.message})`; throw x; });
      if (made.access_token) return keep(made);
      throw new Error('Account gemaakt, maar Supabase wil eerst een bevestigingsmail (zet "Confirm email" uit, README "Supabase")');
    }
  }
  // Geldig toegangstoken; vernieuwt of logt opnieuw in als het moet. Eén tegelijk.
  let pending = null;
  function token(force) {
    if (!linked()) return Promise.reject(new Error('niet gekoppeld'));
    const s = get(SESSION);
    if (!force && s && s.access && s.expires - Date.now() > 60000) return Promise.resolve(s);
    if (pending) return pending;
    pending = (async () => {
      try {
        if (s && s.refresh) {
          try { return keep(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh })); } catch (e) {
            if (!e.status) throw e;   // geen internet: niet opnieuw inloggen, gewoon later
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
      throw new Error(data.message || `Supabase-fout ${res.status}`);
    }
    setState(true, 'Gesynchroniseerd');
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  const userId = () => (get(SESSION) || {}).user;
  // Upsert met vaste user_id (een bulk-insert vult ontbrekende kolommen anders met null in plaats van de standaardwaarde)
  async function upsert(table, rows, conflict) {
    if (!rows.length) return;
    await token();
    const uid = userId();
    await rest(`${table}?on_conflict=${conflict}`, { method: 'POST', body: rows.map((r) => ({ user_id: uid, ...r })), prefer: 'resolution=merge-duplicates,return=minimal' });
  }

  // ---------- Gedeelde instellingen ----------
  const stamps = () => get(STAMPS) || {};
  function stamp(key) { const s = stamps(); s[key] = Date.now(); put(STAMPS, s); }
  let applying = false, pushTimer = null;

  // Elke schrijfactie naar een gedeelde sleutel opmerken, ongeacht welk bestand hem doet
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
        // Nieuwer hier, of nog niet online (eerste keer: met tijd 1, zodat elke echte wijziging elders wint)
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

  // Interne vlaggen (begint met _), bijv. of de Canvas-vinkjes uit het archief al zijn overgezet
  async function flag(key, value) {
    if (value === undefined) {
      const r = await rest(`dashboard_settings?select=value&key=eq.${encodeURIComponent(key)}`);
      return r && r[0] ? r[0].value : null;
    }
    await upsert('dashboard_settings', [{ key, value, updated_at: new Date().toISOString() }], 'user_id,key');
  }

  // ---------- Supabase-wachtwoord omzetten (nieuwe bundel met een nieuwe wachtzin, vault.js) ----------
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
    setState(false, offline ? 'Geen verbinding, werkt lokaal verder' : (e && e.message) || 'Onbekende fout');
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

  // ---------- Instellingen › Inloggen ----------
  function settingsPart(root) {
    const h = DASH.h;
    const box = h('div', 'sb-part');
    root.append(box);
    function draw() {
      box.replaceChildren(h('h3', 'sb-head', 'Supabase (gedeelde instellingen en Canvas-vinkjes)'));
      if (!configured) {
        box.append(h('p', 'w-note', 'Nog niet ingesteld: vul in config.js bij supabase de URL, anon key en het e-mailadres in (README "Supabase"). Tot die tijd blijft alles in deze browser.'));
        return;
      }
      const st = get(STATE);
      if (linked()) {
        const when = st && st.at ? new Date(st.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
        box.append(h('p', `w-note ${st && st.ok === false ? 'sb-bad' : ''}`, st ? `${st.msg}${when ? ` (${when})` : ''}` : 'Gekoppeld, nog niet gesynchroniseerd.'));
      } else {
        box.append(h('p', 'w-note', 'Deze browser is nog niet gekoppeld. Eén keer je wachtzin hier invullen; daarna logt hij zelf in en blijft hij ingelogd.'));
      }
      const pw = h('input', 'vault-input');
      Object.assign(pw, { type: 'password', autocomplete: 'current-password', placeholder: 'Wachtzin' });
      const go = h('button', 'w-btn', linked() ? 'Opnieuw koppelen' : 'Supabase koppelen');
      go.type = 'button';
      const out = h('p', 'w-note');
      go.onclick = async () => {
        go.disabled = true;
        out.textContent = 'Controleren…';
        try {
          // Eerst controleren dat het de echte wachtzin is (de bundel moet opengaan)
          const res = await fetch(`vault.json?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('Er staat geen bundel online');
          await DASH_VAULT.open(pw.value, await res.json());
          await prepare(pw.value);
          await token(true);
          await syncSettings();
          window.dispatchEvent(new CustomEvent('dash:sb-linked'));
          pw.value = '';
          draw();
        } catch (e) {
          out.textContent = `Mislukt: ${e.message}`;
          go.disabled = false;
        }
      };
      box.append(pw, go, out);
    }
    draw();
  }

  return { configured, linked, prepare, token, rest, upsert, flag, userId, changePassphrase, syncSettings, settingsPart, SHARED, fail };
})();
