# Dashboard

Persoonlijk dashboard van Noah, live op https://nbroers05.github.io/Dashboard/ (repo `nbroers05/Dashboard`, hoofdletter D).
Statische site: vanilla HTML/CSS/JS, geen build-stap, geen server. Hangt altijd op een staand scherm (1080×1920) en moet ook op de telefoon werken.

## Over de gebruiker

- Schrijf in het **Nederlands**, **kort en direct**.
- Noah is **geen programmeur**: leg stappen (GitHub, Google Cloud, Spotify-dashboard, extensies) concreet en stap voor stap uit.
- Bij ontwerpwijzigingen: eerst één versie laten zien en op feedback wachten.
- Sinds 27 okt 2026 commit en pusht Claude zelf naar `main` (daarvoor uploadde Noah met de hand). De Letterboxd-Action commit ook naar `main`: altijd eerst `git pull --rebase` voor het pushen. Zeg na elke wijziging dat hij **Ctrl+F5** moet doen (een oude, bewaarde `layout.js` of `style.css` gaf al eens verwarring).

**Nieuwe-tabpagina:** Noah gebruikt `https://nbroers05.github.io/Dashboard/?mini=1` in Firefox (New Tab Override). `?mini=1` start altijd minimaal, schrijft `dash.minimal` niet weg (uitklappen/terug alleen voor dat tabblad), zet focus op de zoekbalk en laadt Spotify/agenda/vakken pas bij uitklappen (`DASH.loadAll`). Tijdens het laden staat `body.booting` (vakken onzichtbaar) tot motion.js de inschuif-animatie start. Spotify-redirect is `origin + pathname` (zonder query), Google gaat via pop-up/hulpprogramma: geen van beide raakt de parameter.

**Versie (afspraak met Noah, vanaf 28 okt 2026):** `0.MINOR.PATCH`. Grote opdracht = MINOR omhoog (PATCH terug naar 0), kleine fix = PATCH omhoog. Het nummer staat als `?v=0.MINOR.PATCH` achter `style.css`, config, dash en topbar in `index.html` (alle andere scripts krijgen het via dash.js) en onderaan als "Dashboard versie …". Altijd ophogen bij een wijziging, anders mengt de browser oude en nieuwe bestanden. Huidige: 0.27.1.

## Lokaal testen

```
python -m http.server 8000 --bind 127.0.0.1 --directory dashboard
```

Open `http://127.0.0.1:8000/` (niet `localhost`: Spotify accepteert dat niet als redirect).
`?demo` achter de URL toont nepdata voor speler, agenda en Episodes Left, zonder in te loggen.
In demo-modus komen weer, F1, zon, AniList-covers, TMDB-poster en LRCLIB-teksten wel echt van internet.

## Opbouw

| Bestand | Wat |
|---|---|
| `index.html` | Topbalk en alle vakken. Statisch geladen: config, dash, topbar. De rest staat in `DASH.boot([...])` onderaan en wordt door dash.js in die volgorde ingevoegd (met dezelfde `?v=`): meteen, of met **`?mini=1`** pas bij uitklappen. Nieuw script = toevoegen aan die lijst |
| `style.css` | Alle opmaak. 12-koloms grid, per vak een eigen kleur (`--c`), telefoon onder `max-width: 700px` |
| `config.js` | Client-ID's en sleutels (zie hieronder) |
| `dash.js` | Gedeelde hulpjes: `DASH.widget()` (elk vak faalt los, en toont dan `DASH.problem()`: melding + knop "Nu herladen"; AH/Canvas zonder agenda krijgen "Agenda koppelen", Letterboxd "Opnieuw proberen"), `DASH.radar()` (regen komende 2 uur per 5 min: Buienradar raintext, anders Open-Meteo minutely_15; 5 min cache; `DASH.HOME` = Rotterdam), `img()` (kleurvlak als plaatje niet laadt), `panel()` (pop-up), `onCalendar()`, datumfuncties |
| `topbar.js` | Topbalk: klok, datum + ISO-weeknummer, snelkoppelingen (uit `config.snelkoppelingen`, icoon = favicon via Google s2 of eigen `icon` (`'agenda'` = ingebouwd agenda-icoon zonder datum), zonder reserveletter of kleurvlak), Google-zoekbalk (sneltoets `/`), minimale modus (`body.minimal`, bewaard als `dash.minimal`, Esc zet terug). Telefoon: snelkoppelingen in uitklapmenu. Staand scherm (`html.portrait-wide`): links ingeklapt achter knopje `.tb-handle` (rood puntje bij ongelezen mail), vouwen bij hover/focus/tik naar links uit (`.tb-tray`, clip-path); de datumtekst eronder vervaagt via een masker op `.tb-clock` (`--fade-x` uit JS, `--fade-on`). Knop **+** opent een paneel om links toe te voegen/wijzigen/verplaatsen; eigen lijst in `dash.links` (localStorage) gaat vóór `config.snelkoppelingen`. Verder: **dagregel** `.tb-dayline` naast de datum (AH vandaag, droog/regen uit `DASH.radar()`, eerstvolgende niet-ingeleverde Canvas-deadline binnen 3 dagen; in de minimale modus uit de bewaarde agenda `google.events`), **nachtstand** (23:00–07:00 `html.night` = `body::after` met backdrop-filter, knop `.tb-night`, `dash.night` = off/on), **Onderzoek**-knop met menu uit `config.onderzoek` (paper, review-labels-Sheet, Sterrenvoorspeller; los van de bewerkbare snelkoppelingen) |
| `motion.js` | Eenmalige animaties bij laden: vakken schuiven in (`body.intro` + `--i`, na 2,6 s weg), grote getallen (`.w-big`) tellen op (alleen eerste 30 s). Doet niets bij prefers-reduced-motion |
| `desk.js` | Indelingen naast de gewone (layout.js): verplaatst bestaande vakken en zet ze terug (oorspronkelijke ouder+plek, daarna `DASH.layoutApply()`). Stuurt `dash:layout` (alerts.js toont dan max 3 + "Alle meldingen"). **desk** = breed liggend (buienalarm volledig onder het weer in hetzelfde vak, bron rechts naast de zin; meldingen krijgen de rest van de kolom en tonen alleen kaartjes die helemaal passen, `fitRows()`; AH op inhoudshoogte) (`min-width: 1280px` + liggend): kolommen links/midden/rechts + `.desk-more` (mail, to-do, gezondheid), weer+buienalarm in `.desk-weather`, film/Laatst gekeken met tabjes (`desk.tab`), songtekst als pop-up, alles in 100dvh (alleen agenda/meldingen scrollen), compacte stand onder 820px hoogte; getest 1916×912 en 1366×768. **tall** = staand/middelgroot (breder dan 700px, niet desk) als `dash.design` niet `old` is (knop `.tb-design` in de topbalk, standaard nieuw): speler, rij weer(+buienalarm volledig eronder, zoals desk)/F1/AH, rij Canvas/meldingen, roterend vak `.tall-rot` (Laatst gekeken, film, Episodes, gezondheid; 12 s crossfade, pauze bij hover/pop-up/Meer open, puntje = 30 s pauze, onderdelen zonder data overgeslagen, geen auto bij reduced-motion), agenda (lijst max 640px, scrollt), Meer-balk met to-do (sticky onderaan); mailvak verborgen maar laadt (rood getal op het Gmail-icoon, `.tb-badge`, ook in andere indelingen). Op 1080×1920 = 1,50 schermhoogte (oud: ~2,5). "Indelen" alleen in het oude ontwerp |
| `layout.js` | Knop "Indelen": vakken verplaatsen/vergroten, bewaard in `localStorage` (`dash.layout.v2.wide/phone`) |
| `widgets/media.js` | **Mediastapel** (Now Bar-stijl) rond `#spotify` in `.media-stack`: Spotify-kaart + kaarten voor Windows-mediasessies uit het hulpprogramma (`/media` elke 2 s, hoes via `/media/thumb`, bediening via POST `/media/playpause|next|prev?id=`). Alle kaarten in één grid-cel, `data-pos` 0 = vooraan, 1/2 steken onderaan smaller uit (klik, veeg of bolletjes om te wisselen). Vooraan: je eigen keuze blijft staan; alleen als de voorste verdwijnt, of als er iets nieuw begint te spelen terwijl de voorste stilstaat, schuift dat vanzelf naar voren. Klik op een kaart erachter (ook de Spotify-kaart) brengt hem naar voren. Windows-Spotify wordt weggelaten als de Spotify-koppeling al een nummer toont. Paginakleur via `DASH.tint(owner)` / `DASH.tintFront(id)` (kaart vooraan bepaalt). Demo heeft een nep-YouTube-kaart |
| `spotify.js` | Spotify-speler (Authorization Code + PKCE, refresh token in localStorage). Publiceert `dash:track`, `window.spotifyPosition()`, `window.spotifySeek()`. Paginatitel blijft altijd "Dashboard". Knoppen verdwijnen nooit: wat nu niet kan krijgt `setOff()` (klasse `.off`, `aria-disabled`, tooltip met de reden; klikken wordt in de capture-fase geblokkeerd). Mediakaarten (YouTube enz.) hebben dezelfde vier knoppen rechts, gedimd |
| `calendar.js` | Google Agenda (lijst/week), kleuren per categorie, tooltips. Week = altijd ma–zo met vorige/volgende/Vandaag en label "week N · d mmm – d mmm" (buiten het opgehaalde bereik: opnieuw ophalen). Stand `calendar.fit`: **Passend** (standaard; precies 08–24, uurhoogte = beschikbare hoogte / 16, min 14px; afspraken vóór 8 uur bovenaan; korte blokken `.tight` = één regel met puntjes) of **Scrollen** (normale uurhoogte, `.wk-body` scrolt zelf en springt bij openen naar het eerstvolgende evenement van vandaag, anders het huidige uur). Rasterhoogte: in desk het vak zelf (`--fit-source: box`), anders `--fit-h` (600px, tall 540px, telefoon 480px). Publiceert afspraken via `dash:calendar` / `window.DASH_CALENDAR` |
| `widgets/*.js` | Eén bestand per vak (zie hieronder) |
| `sterrenvoorspeller/` | Kopie van de popup van Noahs Firefox-extensie, met `popup/dashboard-shim.js` (nabootsing van `browser.*`) en `popup/dashboard.css` |
| `.github/workflows/letterboxd.yml` + `.github/scripts/letterboxd.py` | GitHub Action, elk uur (:17) en met de hand: Letterboxd-RSS van nbroers05 → `data/letterboxd.json` (titel, jaar, rating, kijkdatum, rewatch, like, link, tmdbId, poster). Poster via TMDB met secret `TMDB_API_KEY`, anders uit de RSS; poster van vorige keer wordt hergebruikt. Geen tijdstempel in de JSON, commit alleen bij verandering |
| `data/letterboxd.json` | Wordt door de Action geschreven, niet met de hand aanpassen |
| `helper/` | Hulpprogramma voor telefoonmeldingen, media (`media.py`: `GlobalSystemMediaTransportControlsSessionManager`, Firefox-AUMID `308046B0AF4A39CB`) én Google-tokens (`google_token.py`: Desktop-client uit `google-client.json`, koppelen op `127.0.0.1:8765/koppel`, refresh tokens in `tokens.json` (beide gitignored), `/token?which=main|health` geeft toegangstokens aan het dashboard; calendar.js `refreshFromHelper()` / `DASH_GOOGLE.refresh()` probeert dat stil vóór de Vernieuwen-knop. Twee aparte koppelingen omdat Google Health geen gemengd token accepteert. Testing-modus = refresh token 7 dagen, daarom app op "In production" (README 9). `start.bat` stopt eerst een draaiende versie). Meldingen: `meldingen.py` (pywinrt `UserNotificationListener`, HTTP op 127.0.0.1:8765, CORS alleen voor github.io en 127.0.0.1:8000, met `Access-Control-Allow-Private-Network`), `start.bat` (maakt `.venv`, installeert `requirements.txt`, start met pythonw). Standaard alleen Phone Link-meldingen (`ALLEEN_TELEFOON`). Getest op Noahs pc: toegang stond al aan |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | Eigen logo: donker afgerond vierkant met een brede balk (paars→roze) en twee tegels (blauw, geel), het dashboard in het klein. PNG's zijn met Pillow uit dezelfde vormen getekend |
| `privacy.html`, `google8b5e1b4439cc1a23.html` | Nodig voor het publiceren van de Google-app (Branding: homepage + privacyverklaring, eigendom via Search Console). **Niet weghalen of hernoemen**, anders vervalt de verificatie |
| `README.md` | Stappen voor Noah (Spotify, GitHub Pages, Google Cloud, Canvas, TMDB, extensies) |

Indeling: bovenaan de topbalk over de volle breedte. Daarna de mediastapel (speler) over de volle breedte (met songtekst open: speler 8 kolommen + songtekstvak 4).
Daarna vakken van 4 kolommen: Weer, F1, Buienalarm / AH-uren, Canvas, Episodes Left / Film van vanavond, To-do. Onderaan de agenda over de volle breedte.

### Vakken (`widgets/`)

- `weather.js`: Open-Meteo (Rotterdam, `past_days=1`, 10 dagen), geanimeerde Meteocons-iconen via jsDelivr (Noah wil ze bewegend houden; een stilstaande versie is op zijn verzoek teruggedraaid). Vak: temperatuur, min/max, regenkans, zon op/onder, fietscheck (25 min) voor de volgende AH-dienst: binnen 2 uur via `DASH.radar()`, verder weg via het Open-Meteo-model. Klik = popup in weer-app-stijl (per uur met zon op/onder ertussen, 10 dagen met min/max-balkjes, wind met windroos, UV, vocht, neerslag, zonneboog); achtergrond via `wx-scene-<weer>-<day|night>`. Vakkleur verandert met het weer.
- `rain.js`: Buienalarm, 24 staafjes van 5 min uit `DASH.radar()` (helemaal droog: vlakke lijn met "Geen regen de komende 2 uur"), zin als "Droog tot 19:40" / "Over 15 minuten lichte regen", toont de bron. Vervangt het oude zon-vak (`layout.js` zet een bewaarde `w-sun`-plek om naar `w-rain`).
- `f1.js`: Jolpica-API (volgende sessie, aftellen "3d 4h 35min", seconden alleen op de dag zelf), vlag via flagcdn, circuit-omtrek uit bacinger/f1-circuits (MIT). Knop **Stream**: pop-up waarin Noah zelf een link/embed-code plakt (YouTube, Vimeo, Twitch); de video is 16:9 en het paneel past zich daarop aan.
- `ah.js`: AH-diensten = afspraken met "AH" in de titel. Uren deze week (staafjes per dag) en per **AH-periode**: 4 weken (ma–zo), daarna een week ertussen, in de week erna het salaris. De periode wordt afgeleid uit afspraken met "Salaris" in de titel. Loon uit `config.ahLoon`: per minuut het tarief met de toeslag die dan geldt (dagen/tijdvak, NL-feestdagen zelf uitgerekend, 'hoogste' of 'optellen' bij overlap), onbetaalde pauze naar verhouding, vaste bedragen per periode, uitbetaalde ADV/vakantie-uren als % van alle uren (bruto ÷ uurloon), vakantietoeslag en winstuitkering als % over alle uurposten, netto = bruto × `nettoVerhouding` (gelabeld als schatting). Klik op het vak = pop-up met de berekening per dienst en wat er nog ontbreekt. Velden met `null` tellen niet mee.
- `canvas.js`: deadlines op urgentie, uit de Canvas-iCal die in Google Agenda is geabonneerd (agendanaam bevat "Canvas"; opdrachten herkend aan `iCalUID` met "assignment"; link naar de opdracht als die in de beschrijving staat, `canvasUrl`). Vak: aantal open, "X te laat" en de 3 urgentste. Knop "Alle deadlines" opent een schermvullend paneel (`.page-dialog`, adres `#canvas`, terug-knop sluit) met groepen Te laat / Vandaag / Morgen / Deze week / Later / Ingeleverd. Kleur: rood < 24 u, oranje < 3 dagen, te laat met rode achtergrond. **Ingeleverd vinkt Noah zelf af** (de iCal-feed heeft geen inleverstatus en de Canvas-API werkt niet vanuit de browser); bewaard in `canvas.done`, tonen/verbergen in `canvas.showDone`.
- `episodes.js`: data van de Episodes Left-extensie via `postMessage`; covers via AniList GraphQL. Gebruik `Page { media(search:) }` en niet `Media(search:)`: daarbij maakt één onbekende titel het hele verzoek leeg.
- `stars.js`: Film van vanavond = bovenste film van de watchlist volgens de Sterrenvoorspeller-formule (in het roterende vak van het staande ontwerp: top 3 naast elkaar, `.film3`); poster via TMDB; knop "Voorspel een film" opent de echte popup in een paneel.
- `lyrics.js`: songtekst via LRCLIB (Spotify geeft zelf geen teksten). Loopt mee, klik op een regel om te spoelen. Bij sped-up/slowed versies worden de tijden omgerekend.
- `alerts.js`: Meldingen. Verzamelt `DASH.alert(key, lijst)` van de andere vakken: `ah-rain` (weather.js: regen bij heen fietsen of tijdens de dienst, als die binnen 24 u is), `canvas` (te laat / binnen 24 u, klik opent de Canvas-pagina), `f1` (sessie binnen 1 u of bezig), `episodes` (meer open dan `episodes.seen`, ✕ = gezien). Plus telefoonmeldingen uit het hulpprogramma (`http://127.0.0.1:8765/meldingen`, elke 20 s; ✕ haalt hem ook van de pc). Niks = "Niks aan de hand".
- `mail.js`: ongelezen Gmail (`is:unread in:inbox -category:promotions -category:social`, 5 stuks), via `window.DASH_GOOGLE` uit calendar.js (zelfde token, scope `gmail.readonly` erbij). Demo heeft nepmails.
- `health.js`: Gezondheid via de **Google Health API** (`health.googleapis.com/v4`, opvolger van Google Fit; CORS werkt vanaf github.io). Route: Samsung Health → Health Connect → Google Health-app → cloud. Stappen: `steps/dataPoints:dailyRollUp` (7 dagen, `countSum`), slaap: `sleep/dataPoints` met filter `sleep.interval.civil_end_time >= "YYYY-MM-DD"` (`summary.minutesAsleep`, `stagesSummary`), hartslag: laatste `heart-rate` (pageSize 1, aflopend) en `daily-resting-heart-rate`. Scopes `googlehealth.{activity_and_fitness,sleep,health_metrics_and_measurements}.readonly` via een **eigen token** in calendar.js (`connectHealth`, `google.healthToken`, `include_granted_scopes: false`): met agenda/Gmail-scopes in hetzelfde token gaf de API 403 "Request contains disallowed OAuth scope(s)". Eigen "Vernieuwen"-knop na 1 uur. Onderdelen mogen los mislukken; Google-foutmelding wordt getoond. Doel in `config.gezondheid.stappenDoel`. Werkt met Noahs echte data (27 okt 2026).
- `letterboxd.js`: "Laatst gekeken", tot 20 logs; `.lb-row` is een flex-wrap met vaste hoogte, dus alleen wat op één rij past is zichtbaar (`--lb-w`: 104px, tall 128px, desk 52px) (poster, sterren, datum, ♥ en ↻ voor like/rewatch) uit `data/letterboxd.json` (`?t=` per kwartier). Standaard 8 kolommen breed (`DEFAULTS` in `layout.js`).
- `todo.js`: to-do-lijst, alleen in `localStorage` van die browser.

**Animaties:** nooit iets dat blijft bewegen als er niets gebeurt (afspraak met Noah), behalve de weericoontjes: die vindt hij leuk. Alleen bij laden, bij openen of bij een wijziging. Alles uit bij prefers-reduced-motion (staat onderaan `style.css`).

## API's, sleutels en waar ze staan

Alles staat in `config.js` en is openbaar (staat op GitHub). Dat is bewust: het zijn client-ID's of alleen-lezen-sleutels.

| Dienst | Waarvoor | Sleutel / instelling |
|---|---|---|
| Spotify Web API | speler | `spotifyClientId`. App in Dev Mode, geen client secret. Redirect URI's: `https://nbroers05.github.io/Dashboard/`, `https://nbroers05.github.io/dashboard/`, `http://127.0.0.1:8000/` |
| Google Calendar + Gmail + Google Health API | agenda, AH, Canvas, mail, gezondheid | `googleClientId` (OAuth "Web application", project "Dashboard"). JavaScript origins: `https://nbroers05.github.io`, `http://127.0.0.1:8000`. Scopes `calendar.readonly` en `gmail.readonly` (Gmail API moet aan staan en de scope bij Data Access, README stap 8). Token is maar 1 uur geldig (geen server), daarna knop "Vernieuwen" |
| TMDB | filmposters | `tmdbApiKey` (v3 API key) in `config.js` voor Film van vanavond; dezelfde key als repository secret `TMDB_API_KEY` voor de Letterboxd-Action |
| AH-loon | verwacht salaris | `ahLoon` in `config.js`, afgeleid uit Noahs loonstroken 2026/09 en 2026/10 (narekening periode 09: dashboard € 1.388,34 vs strook € 1.388,27): uurloon 11,99 (jeugdloon; Noah wordt 4 nov 2026 21, dan gaat het waarschijnlijk omhoog), zondag +50%, feestdag +100% (volgens Noah de enige toeslagen), ADV 9,01% en vakantie-uren 11,09% van alle uren incl. toeslaguren, vakantietoeslag 8% en WUK (winstuitkering) 3,46% over alle uurposten, allemaal elke periode uitbetaald (KPT), netto/bruto 0,96. Contract 48 u per periode; meer uren komen als TVT, tegen gewoon uurloon. Geen adres/IBAN/personeelsnummer opslaan |
| Snelkoppelingen | topbalk | `snelkoppelingen` (lijst van `{ name, url, icon? }`). Canvas-link is nog een placeholder (TODO) |
| Buienradar (`gpsgadget.buienradar.nl/data/raintext`, CORS `*`), Open-Meteo, Jolpica, AniList, LRCLIB, flagcdn, jsDelivr | buienalarm, weer, F1, covers, songteksten, vlaggen, iconen/circuits | geen sleutel |

Firefox-extensies van Noah staan buiten deze repo (`Documents/Claude eigen mapje/Episodes Left/`):
`episodes-left` (0.1.2) en `letterboxd-voorspeller` (Sterrenvoorspeller, 0.2.2) hebben elk een klein `dashboard-bridge.js` dat hun data alleen op de dashboard-pagina doorgeeft. Episodes Left 0.1.2 is ondertekend en geïnstalleerd. Sterrenvoorspeller 0.2.2 ligt ter ondertekening; dat regelt Noah zelf. Tot die versie draait toont het dashboard de snapshot van 19 oktober 2026.

## Uitbreidingen in fases (gestart 27 okt 2026)

Noah wil per fase: bouwen, committen, kort zeggen wat er gedaan is en wat hij moet testen, en dan **stoppen tot hij akkoord geeft**. Nooit zelf aan de volgende fase beginnen. Telefoonweergave na elke fase checken. Geen geheimen in de code: alleen als GitHub-secret of in Noahs eigen localStorage. Het felle AH-blauw blijft zoals het is.

1. Topbalk en minimale modus: **gebouwd** (AH-rooster-link weggehaald, links aanpasbaar op het dashboard)
2. Weer-popup en buienalarm: **gebouwd**, bron Buienradar (Open-Meteo als terugval)
3. Animaties: **gebouwd** (inschuiven, optellen, popup schaal-fade, hoes-crossfade via View Transitions; op verzoek wat langzamer: inschuiven 0,9 s + 75 ms per vak, optellen 1,2 s, popup 0,35 s, hoes 0,7 s; alles uit bij prefers-reduced-motion)
4. Canvas op urgentie: **gebouwd** ("aparte pagina" = schermvullend paneel op `#canvas`, omdat alleen het dashboard de agenda-inlog heeft; ingeleverd = zelf afvinken)
5. Letterboxd via GitHub Action: **gebouwd** (secret `TMDB_API_KEY` staat erin, Action draait groen)
6. Meldingen en mail: **gebouwd**. Op Noahs verzoek géén ntfy/Action met tokens; in plaats daarvan telefoonmeldingen via Phone Link + lokaal hulpprogramma, en een Gmail-vak
7. AH-loon: **gebouwd** (getest met tijdelijke testgetallen; config staat weer op placeholders)
8. Gezondheid: **gebouwd en werkend** via Google Health API (Google Fit API stopt eind 2026; Health Connect en Samsung Health hebben geen web-API). Noah zag zijn stappen/slaap/hartslag in de Google Health-app

## Af

Speler met bediening, opslaan, spoelen, vervaagde hoes en songtekst; agenda (lijst/week, categoriekleuren, tooltips); weer met popup; buienalarm; F1 met stream-pop-up; AH-uren met periode en salaris (toeslagen per tijdvak, netto-schatting, pop-up met berekening); Canvas-deadlines op urgentie met eigen pagina; Episodes Left met covers; Film van vanavond met poster en voorspeller; Laatst gekeken (Letterboxd via Action); gezondheid (Google Health API); meldingenvak (incl. telefoon via hulpprogramma); Gmail; to-do; Indelen; telefoonweergave. Gecontroleerd op de echte site: AH-periode, Canvas-feed, spelerknoppen in Firefox.

## Open / ideeën

- To-do eventueel later koppelen aan Google Tasks (zelfde Google-inlog).
