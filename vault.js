'use strict';

// Eén inlog op elke computer (sinds 0.47.0). Alle sleutels van deze browser in één bundel (vault.json in de publieke repo),
// in de browser versleuteld met Noahs wachtwoord: PBKDF2-SHA256 (600.000 rondes) → AES-GCM 256. Zonder wachtwoord onleesbaar.
// - Laadt als eerste script na config.js: kiest hier de opslag voor het hele dashboard. "Deze computer onthouden" uit =
//   sessionStorage-modus: window.localStorage wijst dan naar sessionStorage, zodat álles (tokens, caches) weg is als het
//   tabblad dichtgaat, ook in bestanden die zelf localStorage gebruiken.
// - Inlogscherm als deze browser nog geen sleutels heeft en er een bundel is. "Zonder inloggen" = dashboard zonder persoonlijke vakken.
// - Uitloggen (knop in de topbalk, alleen in browsers die via de bundel zijn ingelogd) wist alle opslag van het dashboard.
// - Bundel maken: Instellingen › Inloggen, alleen waar het hulpprogramma draait (dat levert de blijvende Google- en Spotify-
//   sleutels via /vault/keys, en schrijft vault.json en pusht hem). Sinds 0.48.0 vernieuwen Google en Spotify zichzelf.
window.DASH_VAULT = (() => {
  const ITER = 600000;
  const KEYS = ['data.token', 'feeds.twelvedata'];   // uit deze browser
  const HELPER_KEYS = ['google.refresh', 'spotify.tokens'];   // uit het hulpprogramma (blijvende sleutels, zie hieronder)
  const FLAG = 'vault.session';                      // in sessionStorage: dit tabblad is niet onthouden
  const MARK = 'vault.unlocked';                     // in de gekozen opslag: ingelogd via de bundel
  const SKIP = 'vault.skip';                         // in sessionStorage: "zonder inloggen" gekozen
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

  // ?thomas, ?margriet: eigen versie voor iemand anders (groot idee "Mensen", mensen.html). Alleen een kaal woord als
  // enige parameter; bestaat mensen/<woord>.json, dan daarheen (tot dan is de pagina onzichtbaar), anders gewoon verder
  // (thema's als ?herfst, ?demo).
  (() => {
    const q = location.search.slice(1);
    if (!/^[a-z][a-z0-9-]{1,23}$/.test(q) || ['demo', 'maat'].includes(q)) return;
    const root = document.documentElement;
    root.classList.add('mn-check');
    const done = () => root.classList.remove('mn-check');
    setTimeout(done, 3000);
    fetch(`mensen/${q}.json`, { method: 'HEAD', cache: 'no-store' })
      .then((r) => { if (r.ok) location.replace(`mensen.html?${q}`); else done(); }, done);
  })();
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
      throw new Error('Verkeerd wachtwoord');
    }
  }

  async function fetchBox() {
    const res = await fetch(`vault.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }

  // ---------- Inloggen en uitloggen ----------
  async function unlock(password, remember) {
    const box = await fetchBox();
    if (!box) throw new Error('Er staat nog geen bundel online');
    const payload = await open(password, box);
    // Niet onthouden: ook wat het dashboard vóór het inloggen al wegschreef (caches) uit de echte opslag halen
    if (!remember) { try { realLocal && realLocal.clear(); } catch {} sset(FLAG, '1'); useSession(); }
    const s = store();
    for (const [k, v] of Object.entries(payload.keys || {})) if (typeof v === 'string') s.setItem(k, v);
    s.setItem(MARK, JSON.stringify({ at: new Date().toISOString(), remember: !!remember }));
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
    dlg.setAttribute('aria-label', 'Inloggen');
    const form = el('form', 'vault-form');
    form.method = 'dialog';
    const pw = el('input', 'vault-input');
    Object.assign(pw, { type: 'password', autocomplete: 'current-password', placeholder: 'Wachtwoord', required: true });
    const rem = el('label', 'vault-check');
    const box = el('input');
    box.type = 'checkbox';
    rem.append(box, el('span', null, 'Deze computer onthouden (alleen op je eigen laptop/pc)'));
    const go = el('button', 'w-btn vault-go', 'Ontgrendel');
    go.type = 'submit';
    const err = el('p', 'vault-err');
    err.setAttribute('role', 'alert');
    const skip = el('button', 'vault-skip', 'Zonder inloggen verder');
    skip.type = 'button';
    skip.onclick = () => { sset(SKIP, '1'); dlg.close(); };
    form.append(
      el('h2', null, 'Inloggen op je dashboard'),
      el('p', 'w-note', 'Deze browser heeft nog geen koppelingen.'),
      pw, rem, go, err,
      el('p', 'w-note vault-small', 'Niet onthouden = uitgelogd zodra je het tabblad sluit. Zonder inloggen: het dashboard zonder persoonlijke vakken.'),
      skip,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true;
      go.textContent = 'Bezig…';
      err.textContent = '';
      try {
        await unlock(pw.value, box.checked);
      } catch (x) {
        err.textContent = x.message || 'Ontgrendelen lukt niet';
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

  // ---------- Uitlogknop in de topbalk ----------
  function logoutButton() {
    const actions = document.querySelector('#topbar .tb-actions');
    if (!actions || !unlocked()) return;
    const b = el('button', 'tb-btn tb-logout');
    b.type = 'button';
    b.title = sget(FLAG) ? 'Uitloggen (gebeurt ook als je dit tabblad sluit)' : 'Uitloggen en alles van het dashboard uit deze browser wissen';
    b.setAttribute('aria-label', 'Uitloggen');
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 17v-3H3v-4h7V7l5 5-5 5zm2-15h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-7v-2h7V4h-7V2z"/></svg>';
    b.onclick = () => { if (confirm('Uitloggen? Alles van het dashboard wordt uit deze browser gewist.')) logout(); };
    actions.insertBefore(b, actions.querySelector('.tb-settings') || actions.firstChild);
  }

  // ---------- Instellingen › Inloggen ----------
  // { exists, made } van het hulpprogramma; 'oud' = het draait wel, maar kent /vault nog niet (start.bat opnieuw starten)
  async function helperUp() {
    try {
      const r = await fetch(HELPER, { cache: 'no-store' });
      if (!r.ok) return 'oud';
      const info = await r.json();
      const k = await fetch(`${HELPER}/keys`, { cache: 'no-store' });
      if (!k.ok) return 'oud';
      return { ...info, keys: await k.json() };
    } catch { return null; }
  }

  // Blijvende sleutels van het hulpprogramma als opslagwaarden: Google (calendar.js fromBundle) en Spotify (spotify.js,
  // met `secret`: die sleutel vervalt niet bij gebruik, anders dan die van de gewone PKCE-inlog)
  function helperValues(keys) {
    const out = {};
    if (keys.google) out['google.refresh'] = JSON.stringify(keys.google);
    if (keys.spotify) out['spotify.tokens'] = JSON.stringify({ access: '', refresh: keys.spotify.refresh, expires: 0, scope: keys.spotify.scope, secret: keys.spotify.client_secret });
    return out;
  }

  function settingsTab(root) {
    const h = DASH.h;
    root.append(h('p', 'w-note', 'Maak hier de versleutelde bundel met de sleutels van deze browser. Daarna kun je op elke computer inloggen met alleen je wachtwoord. Kies een lange wachtzin (4+ woorden): iedereen kan de bundel downloaden en proberen te raden.'));
    const list = h('ul', 'vault-list');
    for (const k of KEYS) list.append(h('li', has(k) ? 'ok' : 'nee', `${k}: ${has(k) ? 'staat in deze browser' : 'ontbreekt hier'}`));
    root.append(list);
    const helperList = h('ul', 'vault-list');
    root.append(helperList);
    const status = h('p', 'w-note', 'Hulpprogramma zoeken…');
    root.append(status);
    helperUp().then((info) => {
      if (!info) {
        status.textContent = 'Het hulpprogramma draait hier niet. Een bundel maken kan alleen op je eigen pc (start.bat in dashboard/helper).';
        return;
      }
      if (info === 'oud') {
        status.textContent = 'Het hulpprogramma draait, maar is een oude versie. Dubbelklik op start.bat in dashboard/helper en open dit tabje opnieuw.';
        return;
      }
      const extra = helperValues(info.keys);
      helperList.append(
        h('li', extra['google.refresh'] ? 'ok' : 'nee', `Google (agenda, mail, gezondheid): ${extra['google.refresh'] ? 'gekoppeld in het hulpprogramma' : 'nog niet gekoppeld (127.0.0.1:8765/koppel)'}`),
        h('li', extra['spotify.tokens'] ? 'ok' : 'nee', `Spotify: ${extra['spotify.tokens'] ? 'gekoppeld in het hulpprogramma' : 'nog niet gekoppeld (127.0.0.1:8765/koppel, README stap 13)'}`),
      );
      status.textContent = info.exists ? `Er staat al een bundel online (gemaakt ${info.made || 'onbekend'}). Een nieuwe vervangt hem.` : 'Er staat nog geen bundel online.';
      const pw1 = h('input', 'vault-input');
      const pw2 = h('input', 'vault-input');
      Object.assign(pw1, { type: 'password', autocomplete: 'new-password', placeholder: 'Nieuw wachtwoord' });
      Object.assign(pw2, { type: 'password', autocomplete: 'new-password', placeholder: 'Nog een keer' });
      const go = h('button', 'w-btn', 'Bundel maken en online zetten');
      go.type = 'button';
      const out = h('p', 'w-note');
      go.onclick = async () => {
        if (pw1.value.length < 12) { out.textContent = 'Te kort: minstens 12 tekens (liever 4+ woorden).'; return; }
        if (pw1.value !== pw2.value) { out.textContent = 'De wachtwoorden zijn niet gelijk.'; return; }
        const keys = {};
        for (const k of KEYS) { const v = store().getItem(k); if (v != null) keys[k] = v; }
        Object.assign(keys, extra);
        if (!Object.keys(keys).length) { out.textContent = 'Er staan geen sleutels in deze browser.'; return; }
        go.disabled = true;
        out.textContent = 'Versleutelen…';
        try {
          const box = await seal(pw1.value, { keys, made: new Date().toISOString() });
          box.made = new Date().toISOString().slice(0, 10);
          const r = await fetch(HELPER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(box) });
          const res = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(res.error || `Fout ${r.status}`);
          out.textContent = `Klaar: ${Object.keys(keys).length} sleutels versleuteld${res.pushed ? ' en online gezet (over een minuut of twee live)' : ', maar pushen lukte niet: ' + (res.error || '?')}.`;
          pw1.value = pw2.value = '';
        } catch (x) {
          out.textContent = `Mislukt: ${x.message}`;
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
    if (window.DASH_SETTINGS) DASH_SETTINGS.add({ id: 'inloggen', label: 'Inloggen', order: 30, render: settingsTab });
    if (demo || hasKeys() || sget(SKIP)) return;
    fetchBox().then((box) => { if (box) showLogin(); }).catch(() => {});
  });

  return { KEYS, HELPER_KEYS, unlock, logout, unlocked, seal, open };
})();
