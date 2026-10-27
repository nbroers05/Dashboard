// Laat de popup van de Sterrenvoorspeller-extensie als gewone webpagina in het dashboard draaien.
// De extensie-functies (browser.*) worden hier nagebootst; opslag gaat naar localStorage.
// De rest van de bestanden is een ongewijzigde kopie van de extensie.
(() => {
  const PREFIX = 'lbv:';
  const open = (url) => window.open(url, '_blank', 'noopener');
  globalThis.browser = {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of [].concat(keys)) {
            try { const v = localStorage.getItem(PREFIX + k); if (v != null) out[k] = JSON.parse(v); } catch (e) {}
          }
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) {
            try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {}
          }
        },
      },
    },
    // Geen actieve tab: de popup begint met de bovenste film van je watchlist
    tabs: {
      async query() { return []; },
      async create({ url }) { open(url); },
      async update(id, { url }) { open(url); },
      async sendMessage() { throw new Error('geen tab'); },
      reload() {},
    },
    permissions: { async contains() { return true; }, async request() { return true; } },
    runtime: { getURL: (p) => new URL(`../${p}`, location.href).href },
  };
})();
