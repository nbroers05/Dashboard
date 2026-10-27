'use strict';

// Mail: ongelezen mail in je Gmail-inbox (zonder reclame en sociale media), via dezelfde Google-inlog als de agenda.
// Alleen lezen (scope gmail.readonly). Het token is 1 uur geldig, net als bij de agenda.
DASH.widget('w-mail', (card, body, guard) => {
  const { h, fmtTime, startOfDay, DEMO } = DASH;
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const QUERY = 'is:unread in:inbox -category:promotions -category:social';
  const SHOW = 5;
  const G = window.DASH_GOOGLE;

  // "Naam <adres>" → "Naam"
  const sender = (from) => (from || '').replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '') || from || '(onbekend)';
  function when(ms) {
    if (startOfDay(ms) === startOfDay(Date.now())) return fmtTime(ms);
    return new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '');
  }
  // Gmail geeft tekst soms met &amp; enz.
  const decode = (s) => { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; };

  function message(text, button, onClick) {
    const box = h('div', 'w-empty');
    box.append(h('p', null, text));
    if (button) {
      const b = h('button', 'w-btn', button);
      b.type = 'button';
      b.onclick = onClick;
      box.append(b);
    }
    body.replaceChildren(box);
  }

  async function api(path) {
    const token = G && G.token();
    if (!token) throw Object.assign(new Error('geen token'), { auth: true });
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Gmail ${res.status}`), { auth: true, status: res.status });
    if (!res.ok) throw new Error(`Gmail ${res.status}`);
    return res.json();
  }

  async function fetchMail() {
    const list = await api(`/messages?${new URLSearchParams({ q: QUERY, maxResults: SHOW })}`);
    const ids = (list.messages || []).map((m) => m.id);
    const msgs = await Promise.all(ids.map((id) => api(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)));
    return {
      count: list.resultSizeEstimate || ids.length,
      mails: msgs.map((m) => {
        const head = Object.fromEntries((m.payload.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
        return { from: sender(head.from), subject: head.subject || '(geen onderwerp)', snippet: decode(m.snippet), at: Number(m.internalDate), thread: m.threadId };
      }),
    };
  }

  function demoMail() {
    const now = Date.now();
    return {
      count: 3,
      mails: [
        { from: 'Erasmus Universiteit', subject: 'Rooster blok 2 staat online', snippet: 'Beste student, het rooster voor blok 2 is gepubliceerd…', at: now - 25 * 60000, thread: 'demo1' },
        { from: 'Sam', subject: 'Zaterdag?', snippet: 'Heb je zin om zaterdag mee te gaan naar…', at: now - 3 * 3600000, thread: 'demo2' },
        { from: 'Albert Heijn', subject: 'Je rooster voor volgende week', snippet: 'Bekijk je diensten voor week 45 in de app.', at: now - 26 * 3600000, thread: 'demo3' },
      ],
    };
  }

  function render(data) {
    const head = h('div', 'w-row');
    const big = h('div', 'w-big', String(data.count));
    big.append(h('small', null, data.count === 1 ? 'ongelezen mail' : 'ongelezen mails'));
    const open = h('a', 'w-btn ghost', 'Gmail ↗');
    open.href = 'https://mail.google.com/mail/u/0/#inbox';
    open.target = '_blank';
    open.rel = 'noopener';
    head.append(big, open);

    const list = h('div', 'ml-list');
    if (!data.mails.length) list.append(h('p', 'w-note', 'Inbox bijgewerkt, niks ongelezen ✉️'));
    for (const m of data.mails) {
      const a = h('a', 'ml-item');
      a.href = `https://mail.google.com/mail/u/0/#inbox/${m.thread}`;
      a.target = '_blank';
      a.rel = 'noopener';
      const top = h('div', 'ml-top');
      top.append(h('b', 'ml-from', m.from), h('span', 'ml-time', when(m.at)));
      a.append(top, h('div', 'ml-subject', m.subject), h('div', 'ml-snippet', m.snippet));
      a.title = `${m.from}\n${m.subject}`;
      list.append(a);
    }
    body.replaceChildren(head, list);
    window.DASH_MAIL = data;
    window.dispatchEvent(new CustomEvent('dash:mail', { detail: data }));
  }

  const load = guard(async () => {
    if (DEMO) return render(demoMail());
    if (!G || !G.connected()) return message('Koppel eerst je Google Agenda (onderaan). Daarna kan Gmail erbij.');
    if (!G.gmail()) {
      return G.token()
        ? message('Geef het dashboard leesrechten voor je Gmail.', 'Gmail koppelen', () => G.connect())
        : message('Toegang tot Google is verlopen.', 'Vernieuwen', () => G.connect());
    }
    try {
      render(await fetchMail());
    } catch (e) {
      if (!e.auth) throw e;
      if (e.status === 403) message('Gmail weigert de toegang. Staat de Gmail API aan in Google Cloud? (README, stap 8)', 'Opnieuw koppelen', () => G.connect());
      else message('Toegang tot Google is verlopen.', 'Vernieuwen', () => G.connect());
    }
  });

  window.addEventListener('dash:google', load);
  DASH.every(2 * 60 * 1000, load);
  load();
});
