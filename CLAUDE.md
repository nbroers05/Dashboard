# Dashboard

Persoonlijk dashboard van Noah, live op https://nbroers05.github.io/Dashboard/ (repo `nbroers05/Dashboard`, hoofdletter D).
Statische site: vanilla HTML/CSS/JS, geen build-stap, geen server. Hangt altijd op een staand scherm (1080×1920) en moet ook op de telefoon werken.

## Over de gebruiker

- Schrijf in het **Nederlands**, **kort en direct**.
- Noah is **geen programmeur**: leg stappen (GitHub, Google Cloud, Spotify-dashboard, extensies) concreet en stap voor stap uit.
- Bij ontwerpwijzigingen: eerst één versie laten zien en op feedback wachten.
- Noah uploadde tot nu toe bestanden met de hand via de GitHub-website. Zeg na elke wijziging **welke bestanden** naar GitHub moeten en dat hij daarna **Ctrl+F5** moet doen (een oude, bewaarde `layout.js` of `style.css` gaf al eens verwarring).

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
| `index.html` | Topbalk en alle vakken; scripts onderaan in volgorde: config, dash, topbar, layout, spotify, calendar, widgets |
| `style.css` | Alle opmaak. 12-koloms grid, per vak een eigen kleur (`--c`), telefoon onder `max-width: 700px` |
| `config.js` | Client-ID's en sleutels (zie hieronder) |
| `dash.js` | Gedeelde hulpjes: `DASH.widget()` (elk vak faalt los), `img()` (kleurvlak als plaatje niet laadt), `panel()` (pop-up), `onCalendar()`, datumfuncties |
| `topbar.js` | Topbalk: klok, datum + ISO-weeknummer, snelkoppelingen (uit `config.snelkoppelingen`, icoon = favicon via Google s2 of eigen `icon`), Google-zoekbalk (sneltoets `/`), minimale modus (`body.minimal`, bewaard als `dash.minimal`, Esc zet terug). Telefoon: snelkoppelingen in uitklapmenu |
| `layout.js` | Knop "Indelen": vakken verplaatsen/vergroten, bewaard in `localStorage` (`dash.layout.v2.wide/phone`) |
| `spotify.js` | Spotify-speler (Authorization Code + PKCE, refresh token in localStorage). Publiceert `dash:track`, `window.spotifyPosition()`, `window.spotifySeek()` |
| `calendar.js` | Google Agenda (lijst/week), kleuren per categorie, tooltips. Publiceert afspraken via `dash:calendar` / `window.DASH_CALENDAR` |
| `widgets/*.js` | Eén bestand per vak (zie hieronder) |
| `sterrenvoorspeller/` | Kopie van de popup van Noahs Firefox-extensie, met `popup/dashboard-shim.js` (nabootsing van `browser.*`) en `popup/dashboard.css` |
| `README.md` | Stappen voor Noah (Spotify, GitHub Pages, Google Cloud, Canvas, TMDB, extensies) |

Indeling: bovenaan de topbalk over de volle breedte. Daarna de speler over de volle breedte (met songtekst open: speler 8 kolommen + songtekstvak 4).
Daarna vakken van 4 kolommen: Weer, F1, Zon / AH-uren, Canvas, Episodes Left / Film van vanavond, To-do. Onderaan de agenda over de volle breedte.

### Vakken (`widgets/`)

- `weather.js`: Open-Meteo (Rotterdam), geanimeerde Meteocons-iconen via jsDelivr, regen per kwartier, fietscheck (25 min) voor de volgende AH-dienst. Vakkleur verandert met het weer.
- `f1.js`: Jolpica-API (volgende sessie, aftellen "3d 4h 35min", seconden alleen op de dag zelf), vlag via flagcdn, circuit-omtrek uit bacinger/f1-circuits (MIT). Knop **Stream**: pop-up waarin Noah zelf een link/embed-code plakt (YouTube, Vimeo, Twitch); de video is 16:9 en het paneel past zich daarop aan.
- `sun.js`: zonsop- en ondergang zelf uitgerekend (SunCalc-methode), boog met de zon op de plek van nu.
- `ah.js`: AH-diensten = afspraken met "AH" in de titel. Uren deze week (staafjes per dag) en per **AH-periode**: 4 weken (ma–zo), daarna een week ertussen, in de week erna het salaris. De periode wordt afgeleid uit afspraken met "Salaris" in de titel. Verwacht bruto salaris = uren × `ahUurloon`.
- `canvas.js`: deadlines van deze week als tijdlijn, uit de Canvas-iCal die in Google Agenda is geabonneerd (agendanaam bevat "Canvas"; opdrachten herkend aan `iCalUID` met "assignment").
- `episodes.js`: data van de Episodes Left-extensie via `postMessage`; covers via AniList GraphQL. Gebruik `Page { media(search:) }` en niet `Media(search:)`: daarbij maakt één onbekende titel het hele verzoek leeg.
- `stars.js`: Film van vanavond = bovenste film van de watchlist volgens de Sterrenvoorspeller-formule; poster via TMDB; knop "Voorspel een film" opent de echte popup in een paneel.
- `lyrics.js`: songtekst via LRCLIB (Spotify geeft zelf geen teksten). Loopt mee, klik op een regel om te spoelen. Bij sped-up/slowed versies worden de tijden omgerekend.
- `todo.js`: to-do-lijst, alleen in `localStorage` van die browser.

## API's, sleutels en waar ze staan

Alles staat in `config.js` en is openbaar (staat op GitHub). Dat is bewust: het zijn client-ID's of alleen-lezen-sleutels.

| Dienst | Waarvoor | Sleutel / instelling |
|---|---|---|
| Spotify Web API | speler | `spotifyClientId`. App in Dev Mode, geen client secret. Redirect URI's: `https://nbroers05.github.io/Dashboard/`, `https://nbroers05.github.io/dashboard/`, `http://127.0.0.1:8000/` |
| Google Calendar API | agenda, AH, Canvas | `googleClientId` (OAuth "Web application", project "Dashboard"). JavaScript origins: `https://nbroers05.github.io`, `http://127.0.0.1:8000`. Scope `calendar.readonly`. Token is maar 1 uur geldig (geen server), daarna knop "Vernieuwen" |
| TMDB | filmposters | `tmdbApiKey` (v3 API key) |
| AH-loon | verwacht salaris | `ahUurloon` (bruto, nu 20) |
| Snelkoppelingen | topbalk | `snelkoppelingen` (lijst van `{ name, url, icon? }`). Canvas- en AH-rooster-link zijn nog placeholders (TODO) |
| Open-Meteo, Jolpica, AniList, LRCLIB, flagcdn, jsDelivr | weer, F1, covers, songteksten, vlaggen, iconen/circuits | geen sleutel |

Firefox-extensies van Noah staan buiten deze repo (`Documents/Claude eigen mapje/Episodes Left/`):
`episodes-left` (0.1.2) en `letterboxd-voorspeller` (Sterrenvoorspeller, 0.2.2) hebben elk een klein `dashboard-bridge.js` dat hun data alleen op de dashboard-pagina doorgeeft. Episodes Left 0.1.2 is ondertekend en geïnstalleerd. Sterrenvoorspeller 0.2.2 ligt ter ondertekening; dat regelt Noah zelf. Tot die versie draait toont het dashboard de snapshot van 19 oktober 2026.

## Uitbreidingen in fases (gestart 27 okt 2026)

Noah wil per fase: bouwen, committen, kort zeggen wat er gedaan is en wat hij moet testen, en dan **stoppen tot hij akkoord geeft**. Nooit zelf aan de volgende fase beginnen. Telefoonweergave na elke fase checken. Geen geheimen in de code: alleen als GitHub-secret of in Noahs eigen localStorage. Het felle AH-blauw blijft zoals het is.

1. Topbalk en minimale modus: **gebouwd**
2. Weer-popup (zon-vak gaat erin op), buienalarm-vak (eerst Buienradar proberen, anders Open-Meteo minutely_15; eerlijk melden welke bron)
3. Subtiele animaties, alles uit bij prefers-reduced-motion
4. Canvas op urgentie (Te laat / Vandaag / Morgen / Deze week / Later), vak toont top 3, aparte pagina met de rest
5. Letterboxd via GitHub Action → `data/letterboxd.json`, TMDB-key als secret, vak "Laatst gekeken"
6. Meldingenvak + telefoonmeldingen via ntfy.sh vanuit een Action (eerlijk zijn over wat zonder server niet veilig kan)
7. AH-loon: alles in één config-object, toeslagen per tijdvak, netto als schatting. Geen verzonnen CAO-getallen
8. Gezondheid (Google Fit / Health Connect): eerst onderzoeken en rapporteren, pas bouwen na akkoord

## Af

Speler met bediening, opslaan, spoelen, vervaagde hoes en songtekst; agenda (lijst/week, categoriekleuren, tooltips); weer; F1 met stream-pop-up; zon; AH-uren met periode en salaris; Canvas-tijdlijn; Episodes Left met covers; Film van vanavond met poster en voorspeller; to-do; Indelen; telefoonweergave. Gecontroleerd op de echte site: AH-periode, Canvas-feed, spelerknoppen in Firefox.

## Open / ideeën

- To-do eventueel later koppelen aan Google Tasks (zelfde Google-inlog).
- Letterboxd: laatste logs (RSS kan niet direct vanuit de browser, er is een tussenstation nodig).
- Pop-ups (`DASH.panel`) ook voor andere vakken, bijvoorbeeld een weekoverzicht van het weer of de volledige Canvas-lijst.
