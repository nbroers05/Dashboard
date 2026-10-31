'use strict';

// Instellingen › Mensen (sinds 0.50.0, groot idee "Mensen"): per persoon een eigen adres (?thomas) met een eigen wachtwoord
// en aangevinkte onderdelen. Bewaard in het privé archief: config.json → mensen [{ id, naam, onderdelen, salt, key, iter }].
// `key` = AES-sleutel die hier met PBKDF2 uit hun wachtwoord wordt afgeleid (het wachtwoord zelf wordt nergens bewaard).
// De Action in dashboard-data (scripts/mensen.py) maakt daar elk uur versleutelde pakketjes van in mensen/<id>.json;
// hun pagina is mensen.html (vault.js stuurt ?<id> daarheen). Alleen bruikbaar met het archief-token.
(() => {
  const { h } = DASH;
  const ITER = 600000;
  const PARTS = [
    { id: 'ah', label: 'AH-diensten (agenda)' },
    { id: 'uren', label: 'Uren deze week' },
    { id: 'studie', label: 'Colleges en tentamens' },
    { id: 'film', label: 'Laatst gekeken film' },
    { id: 'weer', label: 'Weer bij mij' },
  ];
  const LATER = ['Spotify nu', 'Berichtenvak', 'AH-loon in €', 'Mijn data'];   // fase 2 en later
  // Adressen die het dashboard zelf al gebruikt (thema's, testvlaggen): geen persoon met die naam
  const RESERVED = new Set(['demo', 'maat', 'mini', 'standaard', 'herfst', 'winter', 'lente', 'zomer', 'halloween', 'sinterklaas', 'kerst',
    'oudennieuw', 'valentijn', 'pasen', 'koningsdag', 'bevrijdingsdag', 'verjaardag', 'f1', 'tentamen', 'kerstavond', 'oudjaar', 'nieuwjaar']);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const link = (id) => `${location.origin}${location.pathname.replace(/index\.html$/, '')}?${id}`;

  async function newKey(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, 256);
    return { salt: b64(salt), key: b64(bits), iter: ITER };
  }

  // Laatst bijgewerkt: het pakketje ontsleutelen met de bewaarde sleutel (die heeft Noah toch al)
  async function packed(p) {
    try {
      const res = await fetch(`mensen/${p.id}.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const box = await res.json();
      if (box.salt !== p.salt) return { old: true };
      const key = await crypto.subtle.importKey('raw', unb64(p.key), 'AES-GCM', false, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { return null; }
  }

  const time = (iso) => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function pwFields(label) {
    const a = h('input', 'vault-input'), b = h('input', 'vault-input');
    Object.assign(a, { type: 'password', autocomplete: 'new-password', placeholder: label });
    Object.assign(b, { type: 'password', autocomplete: 'new-password', placeholder: 'Nog een keer' });
    const check = () => (a.value.length < 8 ? 'Minstens 8 tekens (liever een paar woorden).' : a.value !== b.value ? 'De wachtwoorden zijn niet gelijk.' : null);
    return { a, b, check };
  }

  function render(root) {
    const D = window.DASH_DATA;
    root.replaceChildren();
    root.append(h('p', 'w-note', 'Geef iemand een eigen adres met een eigen wachtwoord, en vink aan wat die persoon daar ziet. Uitvinken = binnen een uur weg op hun versie. Het archief-token en je andere sleutels gaan nooit mee in hun pakket.'));
    if (!D) { root.append(h('p', 'w-note', 'Dit tabje laadt met het volledige dashboard.')); return; }
    if (!D.token()) { root.append(h('p', 'w-note', 'Koppel eerst het data-archief (tabje Data).')); return; }
    const list = h('div', 'mn-list');
    const msg = h('p', 'w-note', 'Laden…');
    root.append(list, msg);
    let mensen = [];

    async function save(change, done) {
      msg.textContent = 'Opslaan…';
      try {
        const cfg = await D.updateJson('config.json', (c) => { c.mensen = c.mensen || []; change(c.mensen); }, 'Mensen bijgewerkt (dashboard)');
        mensen = cfg.mensen;
        msg.textContent = done || 'Opgeslagen. Binnen een uur staat het op hun versie.';
        draw();
      } catch (e) {
        msg.textContent = `Opslaan mislukt: ${e.message}`;
      }
    }

    function card(p) {
      const c = h('div', 'mn-card');
      const head = h('div', 'mn-head');
      head.append(h('b', null, p.naam), h('code', 'mn-link', link(p.id).replace(/^https?:\/\//, '')));
      const state = h('p', 'mn-state', 'pakketje: kijken…');
      packed(p).then((pk) => {
        state.textContent = !pk ? 'pakketje: nog niet online (de Action maakt het binnen een uur)'
          : pk.old ? 'pakketje: nieuw wachtwoord, wordt binnen een uur bijgewerkt'
            : `pakketje bijgewerkt ${time(pk.bijgewerkt)} · wachtwoord ingesteld`;
      });
      const boxes = h('div', 'mn-parts');
      for (const part of PARTS) {
        const l = h('label', 'vault-check');
        const cb = h('input');
        cb.type = 'checkbox';
        cb.checked = (p.onderdelen || []).includes(part.id);
        cb.onchange = () => save((ms) => {
          const m = ms.find((x) => x.id === p.id);
          if (!m) return;
          const on = new Set(m.onderdelen || []);
          if (cb.checked) on.add(part.id); else on.delete(part.id);
          m.onderdelen = PARTS.map((x) => x.id).filter((x) => on.has(x));
        });
        l.append(cb, h('span', null, part.label));
        boxes.append(l);
      }
      for (const name of LATER) boxes.append(h('span', 'mn-later', `${name} (later)`));
      const btns = h('div', 'mn-btns');
      const copy = h('button', 'w-btn ghost', 'Link kopiëren');
      copy.type = 'button';
      copy.onclick = () => navigator.clipboard.writeText(link(p.id)).then(() => { copy.textContent = 'Gekopieerd ✓'; });
      const pw = h('button', 'w-btn ghost', 'Wachtwoord wijzigen');
      pw.type = 'button';
      const revoke = h('button', 'w-btn ghost mn-revoke', 'Toegang intrekken');
      revoke.type = 'button';
      revoke.onclick = () => {
        if (confirm(`Toegang van ${p.naam} intrekken? Die pagina is binnen een uur leeg.`)) save((ms) => ms.splice(ms.findIndex((x) => x.id === p.id), 1), `${p.naam} verwijderd. Binnen een uur is die pagina weg.`);
      };
      btns.append(copy, pw, revoke);
      const pwBox = h('div', 'mn-pw');
      pwBox.hidden = true;
      const f = pwFields('Nieuw wachtwoord');
      const ok = h('button', 'w-btn', 'Wachtwoord opslaan');
      ok.type = 'button';
      ok.onclick = async () => {
        const err = f.check();
        if (err) { msg.textContent = err; return; }
        ok.disabled = true;
        const k = await newKey(f.a.value);
        save((ms) => { const m = ms.find((x) => x.id === p.id); if (m) Object.assign(m, k); }, `Nieuw wachtwoord voor ${p.naam}. Het oude werkt binnen een uur niet meer.`);
      };
      pwBox.append(f.a, f.b, ok);
      pw.onclick = () => { pwBox.hidden = !pwBox.hidden; };
      c.append(head, state, boxes, btns, pwBox);
      return c;
    }

    function addForm() {
      const box = h('div', 'mn-card mn-add');
      const name = h('input', 'vault-input');
      Object.assign(name, { placeholder: 'Naam (bijv. Thomas)', autocomplete: 'off' });
      const f = pwFields('Wachtwoord voor deze persoon');
      const go = h('button', 'w-btn', '+ Persoon toevoegen');
      go.type = 'button';
      go.onclick = async () => {
        const naam = name.value.trim();
        const id = naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!/^[a-z][a-z0-9-]{1,23}$/.test(id)) { msg.textContent = 'Kies een naam van minstens 2 letters.'; return; }
        if (RESERVED.has(id)) { msg.textContent = `"${id}" gebruikt het dashboard zelf al; kies een andere naam.`; return; }
        if (mensen.some((m) => m.id === id)) { msg.textContent = `${naam} staat er al.`; return; }
        const err = f.check();
        if (err) { msg.textContent = err; return; }
        go.disabled = true;
        msg.textContent = 'Sleutel maken…';
        const k = await newKey(f.a.value);
        save((ms) => ms.push({ id, naam, onderdelen: [], ...k }), `${naam} toegevoegd: vink aan wat die persoon mag zien. Adres: ${link(id)}`);
      };
      box.append(name, f.a, f.b, go);
      return box;
    }

    function draw() {
      list.replaceChildren(...mensen.map(card), addForm());
    }

    D.read('config.json').then((f) => {
      mensen = (f ? JSON.parse(f.text).mensen : null) || [];
      msg.textContent = '';
      draw();
    }).catch((e) => { msg.textContent = `Archief lezen lukt niet: ${e.message}`; });
  }

  if (window.DASH_SETTINGS) DASH_SETTINGS.add({ id: 'mensen', label: 'Mensen', order: 40, render });
})();
