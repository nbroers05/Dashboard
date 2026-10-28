# Wijzigingen

## 0.28.0 – 0.34.0 (28 oktober 2026): uitbreiding in 7 fases

### Gebouwd

| Versie | Wat |
|---|---|
| 0.28.0 | **Vrienden op Letterboxd**: de GitHub Action haalt elk uur de RSS van Loeka (`loekatheactor`) en Margriet (`Marrie01`) op en schrijft `data/friends.json`. Nieuw vak met posters, naam en sterren; staat een film op je watchlist, dan staat je verwachte cijfer uit de Sterrenvoorspeller erbij. Staand: in het roterende vak. Liggend: derde tabje "Vrienden" naast Film en Laatst gekeken. |
| 0.29.0 | **Draait nu in de bios** in het Film-vak: films van je watchlist die in LantarenVenster draaien, met de eerstvolgende voorstelling (of "t/m 4 nov") en je verwachte cijfer. De Action haalt het programma één keer per dag op (`data/cinema.json`). |
| 0.30.0 | **F1 na de race**: tussen de finish en de volgende sessie toont het F1-vak de uitslag (top 3 groot met vlaggen, 4–10 klein) en het klassement (top 5). Daarna weer de aftelklok. |
| 0.31.0 | **Spotify-maandoverzicht**: top 5 nummers en top 5 artiesten van de afgelopen ~4 weken, met hoezen en foto's. Staand in het roterende vak, liggend in de Meer-balk. |
| 0.32.0 | **Focusmodus**: knop met het klokje in de topbalk. Studietimer (standaard 50 min werken, 10 min pauze, aantal rondes instelbaar), start eventueel je studieplaylist, dempt het meldingenvak, dimt de rest van het dashboard en toont de resterende tijd in de topbalk. Klaar: melding in de browser en (als je een onderwerp invult) via ntfy op je telefoon. **Verjaardagen** uit je Google-agenda in de dagregel ("🎂 Loeka over 3 dagen jarig"); vandaag extra opvallend. Ook: de topbalk op de telefoon staat nu netjes in rijen. |
| 0.33.0 | **Feeds-pagina**: krant-icoon in de topbalk (terug met hetzelfde icoon of Esc). Nieuws (NOS algemeen en sport, extra bron als placeholder), Reddit, YouTube (Patrick (H) Willems + placeholders) en Markten (koers, % vandaag, lijntje van de afgelopen maand; alleen weergave). Nieuws, Reddit en YouTube via de Action (elk half uur), markten in je browser. |
| 0.34.0 | **Opruimen en controleren**: alle indelingen nagelopen op 1916×912 en 1366×768 (liggend), 1080×1920 (staand) en 375×812 (telefoon) met een script dat zoekt naar onderdelen die buiten hun vak steken. Gerepareerd: posters in de liggende tabjes Laatst gekeken/Vrienden vielen half buiten het vak (schalen nu mee), F1-uitslag op 1366×768. CLAUDE.md bijgewerkt. |

Eén Action ("Dashboard-data", bestand `.github/workflows/letterboxd.yml`) doet alles: elk uur Letterboxd + bioscoop (die laatste één keer per dag), elk half uur de feeds. Hij commit alleen als er echt iets veranderd is.

### Niet (helemaal) gebouwd, en waarom

- **Pathé (De Kuip, Schouwburgplein)**: pathe.nl weigert verzoeken die zich eerlijk als GitHub Action melden (fout 403). Ik ga ons niet als gewone browser voordoen om dat te omzeilen, dus Pathé zit er niet in.
- **KINO Rotterdam**: hun robots.txt verbiedt het ophalen van de filmladder (`/filmladder`). Overgeslagen.
- **LantarenVenster**: werkt wel (openbare RSS). Voorstellingstijden worden alleen opgezocht voor films die op de watchlist-snapshot in de repo staan (zo blijft het bij een paar verzoeken per dag). Voor andere watchlist-films staat er "t/m <datum>" of "in het programma".
- **Reddit**: zonder account kan het niet meer (Reddit blokkeert dat). Het werkt via de officiële Reddit-API zodra jij de secrets toevoegt (zie hieronder). Tot die tijd staat er een nette melding op de Feeds-pagina.
- **AEX in Markten**: Twelve Data heeft indexen zoals de AEX mogelijk niet in het gratis plan. Dan staat er "niet beschikbaar" bij; de rest werkt gewoon.
- **Verjaardagen uit Google Contacten**: via de verjaardagen-agenda in Google Agenda (die bevat je contacten). Een aparte Contacten-koppeling (extra toestemming) was niet nodig.
- **De Action zelf** heb ik niet op GitHub kunnen starten (geen GitHub-programma op deze pc). Alles is lokaal getest; de eerste echte run volgt vanzelf op :17 of :47.

### Wat je zelf moet invullen

**In `config.js`** (op GitHub: bestand openen → potloodje → aanpassen → "Commit changes"):

| Waar | Wat |
|---|---|
| `vrienden` → `MARIJN_GEBRUIKERSNAAM` | Marijns Letterboxd-gebruikersnaam (staat in de adresbalk op zijn profiel: letterboxd.com/**naam**/) |
| `focus.playlist` → `STUDIE_PLAYLIST_ID` | Het ID van je studieplaylist: in Spotify "Delen → Link kopiëren", het stuk na `/playlist/` en vóór `?` (22 tekens) |
| `nieuwsFeeds` → `EXTRA_RSS_URL` | RSS-adres van een extra nieuwsbron, of haal die regel weg |
| `subreddits` → `SUBREDDIT_1` t/m `_3` | Subreddits zonder "r/", bijvoorbeeld `movies`, `formula1`, `Rotterdam` |
| `youtubeKanalen` → `KANAAL_ID_2`, `KANAAL_ID_3` | Kanaal-ID's (beginnen met `UC`, 24 tekens). Op het kanaal: rechtermuisknop → Paginabron bekijken → zoek op `channelId` |
| `markten` → `TICKER_1`, `TICKER_2` | Aandelen, bijvoorbeeld `ASML` of `AAPL` |

**Op het dashboard zelf** (blijft alleen in je eigen browser, staat nergens op GitHub):

- **Twelve Data-key** (voor aandelen/indexen): maak gratis een account op twelvedata.com → Dashboard → API key kopiëren → Feeds-pagina → Markten → onderaan plakken → Opslaan.
- **ntfy-onderwerp** (melding op je telefoon als de focustimer klaar is): installeer de ntfy-app, abonneer op een zelfbedacht, lastig te raden onderwerp (bijv. `noah-dash-8f3k2`), en vul precies hetzelfde in bij de focusknop.
- **Spotify opnieuw inloggen**: voor het maandoverzicht is één extra toestemming nodig. Het vak toont een knop "Opnieuw inloggen bij Spotify".

**Secrets in GitHub** (alleen voor Reddit): repository `nbroers05/Dashboard` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

1. Log in op reddit.com, ga naar **reddit.com/prefs/apps** → **create another app…**
2. Naam: `dashboard`, kies **script**, redirect uri: `http://localhost:8080` (wordt niet gebruikt) → **create app**.
3. Voeg toe als secrets:
   - `REDDIT_CLIENT_ID`: de code onder "personal use script" (onder de naam van de app)
   - `REDDIT_CLIENT_SECRET`: de waarde bij "secret"
   - `REDDIT_USER_AGENT` (mag weg): bijvoorbeeld `web:nbroers05-dashboard:1.0 (by /u/jouwnaam)`

`TMDB_API_KEY` staat er al; daar hoef je niets aan te doen.

### Testen

Doe **Ctrl+F5** op het dashboard. Kijk daarna bij GitHub → **Actions** → "Dashboard-data" of de eerste run groen is (of klik daar op **Run workflow** om hem meteen te draaien).
