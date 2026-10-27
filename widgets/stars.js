'use strict';

// De echte Sterrenvoorspeller-popup, als losse pagina in een iframe (gaat die mis, dan blijft de rest werken).
// Met Sterrenvoorspeller 0.2.2+ in Firefox stuurt de extensie je vernieuwde watchlist hierheen.
DASH.widget('w-stars', (card, body, guard) => {
  const KEY = 'lbv:wl';
  const frame = document.createElement('iframe');
  frame.className = 'stars-frame';
  frame.title = 'Sterrenvoorspeller';
  frame.src = 'sterrenvoorspeller/popup/popup.html';
  body.replaceChildren(frame);

  window.addEventListener('message', guard((e) => {
    if (e.source !== window || !e.data || e.data.source !== 'sterrenvoorspeller' || !e.data.wl) return;
    const old = DASH.store.get(KEY);
    if (old && old.t === e.data.wl.t) return;
    DASH.store.set(KEY, e.data.wl);
    frame.contentWindow.location.reload();
  }));
  window.postMessage({ type: 'sterrenvoorspeller:request' }, location.origin);
});
