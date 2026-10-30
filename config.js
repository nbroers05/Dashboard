// Vul hier je eigen gegevens in. De Client ID is niet geheim, dit mag gewoon op GitHub.
window.DASHBOARD_CONFIG = {
  spotifyClientId: '4da05ad75fe84a41859a6a18ef2eef70',
  // AH-loon (uurloon, toeslagen, percentages) staat sinds 0.44.18 in het privé data-archief: config.json → ahLoon.
  // widgets/ah.js leest het met het archief-token; hier dus niets meer invullen.
  // Letterboxd-onderzoek: vaste knop in de topbalk (los van je eigen snelkoppelingen)
  onderzoek: [
    { name: 'Paper', url: 'https://claude.ai/code/artifact/89ee7dac-4563-47d1-a358-3df7a9b0d813' },
    { name: 'Review-labels (Sheet)', url: 'https://docs.google.com/spreadsheets/d/1kf305bm5mv6RfPXRklkZ1Yd50Xdh_XcuwbrRiJPxFW4/edit' },
    { name: 'Sterrenvoorspeller', url: 'https://claude.ai/artifact/AUgYvmNHZW9xwNn7jGZVhP' },
  ],
  // Letterboxd van vrienden: de GitHub Action leest deze lijst (user = gebruikersnaam op Letterboxd, name = hoe hij op het dashboard staat).
  // Hou het formaat precies zo: { user: '...', name: '...' }, met enkele aanhalingstekens.
  vrienden: [
    { user: 'loekatheactor', name: 'Loeka' },
    { user: 'Marrie01', name: 'Margriet' },
    { user: 'marijn2005', name: 'Marijn' },
  ],
  // Focusmodus (knop met het klokje in de topbalk). playlist = het ID uit de Spotify-link van je studieplaylist:
  // open.spotify.com/playlist/<DIT DEEL>?si=...
  focus: {
    werkMinuten: 50,
    pauzeMinuten: 10,
    playlist: '43DsRhxuUHK4mphwDGEs2L', // studieplaylist
  },
  // ---------- Feeds-pagina (icoon met de krant in de topbalk) ----------
  // Nieuws, filmnieuws en YouTube haalt de GitHub Action elk half uur op (data/feeds.json); hou het formaat precies zo.
  nieuwsFeeds: [
    { name: 'NOS', url: 'https://feeds.nos.nl/nosnieuwsalgemeen' },
    { name: 'NOS Sport', url: 'https://feeds.nos.nl/nossportalgemeen' },
    { name: 'NU.nl', url: 'https://www.nu.nl/rss/Algemeen' },
  ],
  // Filmnieuws (vervangt Reddit: Reddit laat geen nieuwe API-apps meer toe). Meer bronnen mag, zelfde formaat.
  filmFeeds: [
    { name: 'Letterboxd Journal', url: 'https://letterboxd.com/journal/rss/' },
  ],
  // YouTube-kanalen: id = kanaal-ID (begint met UC, 24 tekens; staat in de pagina-bron van het kanaal als "channelId")
  youtubeKanalen: [
    { name: 'Patrick (H) Willems', id: 'UCF1fG3gT44nGTPU2sVLoFWg' },
    { name: 'The Yard', id: 'UCGbg3DjQdcqWwqOLHpYHXIg' },
    { name: 'Ken', id: 'UCiFOL6V9KbvxfXvzdFSsqCw' }, // @kenforrest
  ],
  // Markten: alleen koers, verandering vandaag en een lijntje van de afgelopen maand. Geen advies.
  // Aandelen/indexen via Twelve Data (gratis key, vul je op de Feeds-pagina zelf in; blijft in je browser).
  // Crypto via CoinGecko (geen key): zet coingecko: '<id>' erbij.
  markten: [
    // De AEX (en andere indexen) zit niet in het gratis plan van Twelve Data
    { symbol: 'ASML', name: 'ASML' },
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'BTC', name: 'Bitcoin', coingecko: 'bitcoin' },
  ],
  // Privé data-archief (check-ins en het Data-overzicht). Het token staat alleen in je browser, nooit hier.
  dataRepo: 'nbroers05/dashboard-data',
  // Gezondheid (Google Health): je dagelijkse stappendoel
  gezondheid: { stappenDoel: 10000 },
  // Voor filmposters (themoviedb.org → Instellingen → API → "API Key"). Leeg laten mag: dan een kleurvlak.
  tmdbApiKey: '0d5a58e53bb2d4420ee65e51e1d6f63a',
  googleClientId: '149288254289-i5t6b2sc6gio1r92nioscj61ij2n098c.apps.googleusercontent.com',
  // Standaard-snelkoppelingen in de topbalk. Je kunt ze ook op het dashboard zelf aanpassen (knop + naast de icoontjes);
  // dat wordt dan in die browser bewaard en gaat vóór deze lijst.
  // name = tekst bij het icoontje, url = waar hij heen gaat. Het icoontje is het logo van die site,
  // tenzij je zelf een plaatje opgeeft met icon (een adres, of 'agenda' voor het ingebouwde agenda-icoon).
  snelkoppelingen: [
    { name: 'Canvas', url: 'https://canvas.eur.nl/' },
    { name: 'Letterboxd', url: 'https://letterboxd.com/nbroers05/' },
    { name: 'Gmail', url: 'https://mail.google.com/', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' },
    { name: 'Agenda', url: 'https://calendar.google.com/', icon: 'agenda' },
    { name: 'Spotify', url: 'https://open.spotify.com/' },
  ],
};
