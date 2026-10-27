// Vul hier je eigen gegevens in. De Client ID is niet geheim, dit mag gewoon op GitHub.
window.DASHBOARD_CONFIG = {
  spotifyClientId: '4da05ad75fe84a41859a6a18ef2eef70',
  // Bruto uurloon bij AH in euro's met een punt (bijv. 12.75), voor het verwachte salaris per periode
  ahUurloon: 20,
  // Voor filmposters (themoviedb.org → Instellingen → API → "API Key"). Leeg laten mag: dan een kleurvlak.
  tmdbApiKey: '0d5a58e53bb2d4420ee65e51e1d6f63a',
  googleClientId: '149288254289-i5t6b2sc6gio1r92nioscj61ij2n098c.apps.googleusercontent.com',
  // Snelkoppelingen in de topbalk. Toevoegen, weghalen of de volgorde veranderen mag gewoon.
  // name = tekst bij het icoontje, url = waar hij heen gaat. Het icoontje is het logo van die site,
  // tenzij je zelf een plaatje opgeeft met icon ({dag} wordt de datum van vandaag).
  snelkoppelingen: [
    { name: 'Canvas', url: 'https://canvas.instructure.com/' }, // TODO: vervang door de Canvas-link van je school
    { name: 'Letterboxd', url: 'https://letterboxd.com/nbroers05/' },
    { name: 'Gmail', url: 'https://mail.google.com/', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' },
    { name: 'Agenda', url: 'https://calendar.google.com/', icon: 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_{dag}_2x.png' },
    { name: 'Spotify', url: 'https://open.spotify.com/' },
    { name: 'AH-rooster', url: 'https://www.ah.nl/' }, // TODO: vervang door de link van je AH-rooster
  ],
};
