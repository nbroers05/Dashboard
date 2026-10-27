// Vul hier je eigen gegevens in. De Client ID is niet geheim, dit mag gewoon op GitHub.
window.DASHBOARD_CONFIG = {
  spotifyClientId: '4da05ad75fe84a41859a6a18ef2eef70',
  // AH-loon: alle getallen voor het verwachte salaris. Neem ze over van je loonstrook (of je CAO).
  // null = nog niet ingevuld: dat deel telt dan niet mee, en het dashboard zegt wat er ontbreekt.
  // Bedragen in euro's met een punt (12.75), percentages als getal (50 = 50%).
  ahLoon: {
    brutoUurloon: 20,
    // Toeslag bovenop het uurloon per tijdvak. dagen: ma di wo do vr za zo, of 'feestdag'. tot: '24:00' = einde van de dag.
    // Een dienst die over meerdere tijdvakken loopt, wordt per minuut opgesplitst.
    toeslagen: [
      { naam: 'Avond', dagen: ['ma', 'di', 'wo', 'do', 'vr'], van: null, tot: '24:00', procent: null }, // TODO: vanaf hoe laat, en hoeveel %
      { naam: 'Zaterdag', dagen: ['za'], van: '00:00', tot: '24:00', procent: null }, // TODO: hoeveel % (en hele dag of pas vanaf een tijd?)
      { naam: 'Zondag', dagen: ['zo'], van: '00:00', tot: '24:00', procent: null }, // TODO: hoeveel %
      { naam: 'Feestdag', dagen: ['feestdag'], van: '00:00', tot: '24:00', procent: null }, // TODO: hoeveel %
    ],
    // Vallen er twee toeslagen tegelijk (bijv. zondagavond): 'hoogste' telt alleen de hoogste, 'optellen' telt ze bij elkaar op
    meerdereToeslagen: 'hoogste',
    // Welke feestdagen meetellen voor de feestdagtoeslag. Haal weg wat bij jou niet telt.
    feestdagen: ['nieuwjaar', 'pasen1', 'pasen2', 'koningsdag', 'bevrijdingsdag', 'hemelvaart', 'pinksteren1', 'pinksteren2', 'kerst1', 'kerst2'],
    // Onbetaalde pauze, bijv. { langerDanUren: 5.5, minuten: 30 }. Leeg = geen pauze afgetrokken.
    pauzes: [],
    vakantiegeldProcent: null, // TODO: vakantiegeld in % van je bruto loon (wordt meestal één keer per jaar uitbetaald)
    // Vaste bedragen per periode bovenop je uren, bijv. { naam: 'Reiskosten', bedrag: 12.50 }
    vasteToeslagen: [],
    nettoVerhouding: null, // TODO: netto ÷ bruto van een recente loonstrook, bijv. 0.88 (alleen voor de schatting)
  },
  // Voor filmposters (themoviedb.org → Instellingen → API → "API Key"). Leeg laten mag: dan een kleurvlak.
  tmdbApiKey: '0d5a58e53bb2d4420ee65e51e1d6f63a',
  googleClientId: '149288254289-i5t6b2sc6gio1r92nioscj61ij2n098c.apps.googleusercontent.com',
  // Standaard-snelkoppelingen in de topbalk. Je kunt ze ook op het dashboard zelf aanpassen (knop + naast de icoontjes);
  // dat wordt dan in die browser bewaard en gaat vóór deze lijst.
  // name = tekst bij het icoontje, url = waar hij heen gaat. Het icoontje is het logo van die site,
  // tenzij je zelf een plaatje opgeeft met icon ({dag} wordt de datum van vandaag).
  snelkoppelingen: [
    { name: 'Canvas', url: 'https://canvas.instructure.com/' }, // TODO: vervang door de Canvas-link van je school
    { name: 'Letterboxd', url: 'https://letterboxd.com/nbroers05/' },
    { name: 'Gmail', url: 'https://mail.google.com/', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' },
    { name: 'Agenda', url: 'https://calendar.google.com/', icon: 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_{dag}_2x.png' },
    { name: 'Spotify', url: 'https://open.spotify.com/' },
  ],
};
