// Fill in your own details here. The Client ID isn't secret, so this may simply be on GitHub.
window.DASHBOARD_CONFIG = {
  spotifyClientId: '4da05ad75fe84a41859a6a18ef2eef70',
  // AH wage settings (hourly wage, allowances, percentages) live in the private data archive since 0.44.18: config.json → ahWage.
  // widgets/ah.js reads them with the archive token; so nothing to fill in here.
  // Letterboxd research: a fixed button in the top bar (separate from your own shortcuts)
  research: [
    { name: 'Paper', url: 'https://claude.ai/code/artifact/89ee7dac-4563-47d1-a358-3df7a9b0d813' },
    { name: 'Review labels (Sheet)', url: 'https://docs.google.com/spreadsheets/d/1kf305bm5mv6RfPXRklkZ1Yd50Xdh_XcuwbrRiJPxFW4/edit' },
    { name: 'Sterrenvoorspeller', url: 'https://claude.ai/artifact/AUgYvmNHZW9xwNn7jGZVhP' },
  ],
  // Friends on Letterboxd: the GitHub Action reads this list (user = Letterboxd username, name = how they show on the dashboard).
  // Keep the format exactly like this: { user: '...', name: '...' }, with single quotes.
  friends: [
    { user: 'loekatheactor', name: 'Loeka' },
    { user: 'Marrie01', name: 'Margriet' },
    { user: 'marijn2005', name: 'Marijn' },
  ],
  // Focus mode (the button with the clock in the top bar). playlist = the ID from the Spotify link of your study playlist:
  // open.spotify.com/playlist/<THIS PART>?si=...
  focus: {
    workMinutes: 50,
    breakMinutes: 10,
    playlist: '43DsRhxuUHK4mphwDGEs2L', // study playlist
  },
  // ---------- Feeds page (newspaper icon in the top bar) ----------
  // The GitHub Action fetches news, film news and YouTube every half hour (data/feeds.json); keep the format exactly like this.
  newsFeeds: [
    { name: 'NOS', url: 'https://feeds.nos.nl/nosnieuwsalgemeen' },
    { name: 'NOS Sport', url: 'https://feeds.nos.nl/nossportalgemeen' },
    { name: 'NU.nl', url: 'https://www.nu.nl/rss/Algemeen' },
  ],
  // Film news (replaces Reddit: Reddit doesn't allow new API apps anymore). More sources are fine, same format.
  filmFeeds: [
    { name: 'Letterboxd Journal', url: 'https://letterboxd.com/journal/rss/' },
  ],
  // YouTube channels: id = channel ID (starts with UC, 24 characters; it's in the channel page's source as "channelId")
  youtubeChannels: [
    { name: 'Patrick (H) Willems', id: 'UCF1fG3gT44nGTPU2sVLoFWg' },
    { name: 'The Yard', id: 'UCGbg3DjQdcqWwqOLHpYHXIg' },
    { name: 'Ken', id: 'UCiFOL6V9KbvxfXvzdFSsqCw' }, // @kenforrest
  ],
  // Markets: only the price, today's change and a line for the last month. No advice.
  // Stocks/indexes via Twelve Data (free key, you fill it in on the Feeds page itself; it stays in your browser).
  // Crypto via CoinGecko (no key): add coingecko: '<id>'.
  markets: [
    // The AEX (and other indexes) isn't in Twelve Data's free plan
    { symbol: 'ASML', name: 'ASML' },
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'BTC', name: 'Bitcoin', coingecko: 'bitcoin' },
  ],
  // Fast sync (since 1.1.0, sync.js): own Supabase project "dashboard", separate from the planner. README "Supabase".
  // url and anonKey from Supabase › Project Settings › API (the anon/publishable key is meant to be public; the
  // security is in supabase.sql). email = the dashboard's account; it may be an address you use nowhere else,
  // because this file is public. Never paste the service_role/secret key or a password here.
  // As long as a value here ends in _HERE, everything works like before 1.1.0 (everything per browser).
  supabase: {
    url: 'https://pakweewdaxaaxupdpfyu.supabase.co',
    anonKey: 'sb_publishable_htAR8KMBf2SJaQJ-qY9AUw_hxtzTaDR',
    email: 'broersnoah@gmail.com',
  },
  // Private data archive (check-ins and the Data overview). The token is only in your browser, never here.
  dataRepo: 'nbroers05/dashboard-data',
  // Health (Google Health): your daily step goal
  health: { stepGoal: 10000 },
  // For film posters (themoviedb.org → Settings → API → "API Key"). Leaving it empty is fine: then a color block.
  tmdbApiKey: '0d5a58e53bb2d4420ee65e51e1d6f63a',
  googleClientId: '149288254289-i5t6b2sc6gio1r92nioscj61ij2n098c.apps.googleusercontent.com',
  // Default shortcuts in the top bar. You can also change them on the dashboard itself (+ button next to the icons);
  // that's saved in that browser and goes before this list.
  // name = text by the icon, url = where it goes. The icon is that site's logo,
  // unless you give your own image with icon (an address, or 'agenda' for the built-in calendar icon).
  shortcuts: [
    { name: 'Canvas', url: 'https://canvas.eur.nl/' },
    { name: 'Letterboxd', url: 'https://letterboxd.com/nbroers05/' },
    { name: 'Gmail', url: 'https://mail.google.com/', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' },
    { name: 'Calendar', url: 'https://calendar.google.com/', icon: 'agenda' },
    { name: 'Spotify', url: 'https://open.spotify.com/' },
  ],
};
