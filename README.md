# Dashboard

Persoonlijk dashboard (nu: Spotify-speler). Statische site voor GitHub Pages.

Bestanden: `index.html`, `style.css`, `config.js`, `dash.js`, `spotify.js`, `calendar.js`, de map `widgets/` (één bestand per vak) en `data/films.json`.
Upload altijd de mappen mee (sleep de hele inhoud van de map `dashboard` in GitHub).
Demo zonder inloggen: voeg `?demo` toe aan de URL.

## 1. Spotify-dashboard (developer.spotify.com/dashboard)

Open je app → **Settings** → **Edit**:

- **Redirect URIs**, zet er precies deze twee in (met `/` aan het eind):
  - `https://JOUWNAAM.github.io/dashboard/`
  - `http://127.0.0.1:8000/`
- **APIs used**: Web API aangevinkt.
- **User Management**: zet je eigen Spotify-e-mailadres erin (Dev Mode laat alleen deze gebruikers toe).
- **Save**.

Kopieer de **Client ID** en plak hem in `config.js` op de plek van `PLAK_HIER_JE_CLIENT_ID`.

## 2. GitHub

1. Ga naar github.com → **+** (rechtsboven) → **New repository**.
2. Naam: `dashboard`, **Public**, **Create repository**.
3. Klik **uploading an existing file** en sleep de 4 bestanden + `README.md` erin → **Commit changes**.
4. Repo → **Settings** → **Pages** → Source: **Deploy from a branch**, Branch: **main** / **(root)** → **Save**.
5. Na ±1 minuut staat hij op `https://JOUWNAAM.github.io/dashboard/`.

Later iets aanpassen: bestand openen op GitHub → potloodje → **Commit changes**, of opnieuw uploaden.

## 3. Google Agenda (console.cloud.google.com)

1. Bovenaan: projectkiezer → **New project** → naam `Dashboard` → **Create**. Zorg dat dit project geselecteerd is.
2. Zoekbalk: **Google Calendar API** → **Enable**.
3. Menu → **Google Auth Platform** (of "OAuth consent screen") → **Get started**:
   app-naam `Dashboard`, je Gmail als support-e-mail, Audience **External**, je Gmail als contact → **Create**.
4. **Audience** → **Test users** → **Add users** → je eigen Gmail-adres → **Save**.
5. **Clients** → **Create client** → type **Web application**, naam `Dashboard`.
   Bij **Authorized JavaScript origins** (géén `/` aan het eind, geen pad):
   - `https://nbroers05.github.io`
   - `http://127.0.0.1:8000`
   Redirect URIs leeg laten → **Create**.
6. Kopieer de **Client ID** (eindigt op `.apps.googleusercontent.com`) naar `config.js` bij `googleClientId`.

Bij de eerste keer inloggen zegt Google "Google hasn't verified this app": klik **Continue** (het is je eigen app) en vink agenda-toegang aan.

Let op: Google geeft een browser-site maar 1 uur toegang. Daarna verschijnt in de kaart **Vernieuwen**; één klik, geen nieuwe toestemming nodig. Je laatst opgehaalde afspraken blijven zichtbaar.

## 4. Canvas-deadlines in Google Agenda

1. Canvas → **Agenda** (links in het menu) → rechtsonder **Agendafeed** → kopieer de link.
2. Google Agenda op de computer → links bij **Andere agenda's** het **+** → **Via URL** → link plakken → **Agenda toevoegen**.
3. Zorg dat het woord **Canvas** in de naam van die agenda staat (Instellingen van die agenda → naam). Daaraan herkent het dashboard hem.
4. Tip: vink hem links uit in Google Agenda als je de opdrachten niet in je weekoverzicht wil. Het Canvas-vak toont ze toch.

Google ververst geabonneerde agenda's zelf, ongeveer elke 8 tot 24 uur. Een nieuwe deadline kan dus even duren.

## 5. Filmposters (TMDB, optioneel)

1. Maak een gratis account op themoviedb.org.
2. Klik rechtsboven op je profiel → **Instellingen** → **API** → **Een API-sleutel aanvragen** → kies **Developer**.
3. Vul het formulier in (gebruik: persoonlijk dashboard, website: je GitHub-pagina) en accepteer de voorwaarden.
4. Kopieer de **API Key** (de korte sleutel, niet het lange "Read Access Token") naar `config.js` bij `tmdbApiKey`.

Zonder sleutel toont het filmvak een goudkleurig vlak met de titel.

Beeldbronnen: weericonen Meteocons (Bas Milius, MIT), circuits bacinger/f1-circuits (MIT), vlaggen flagcdn.com, animecovers AniList.

## 6. Sterrenvoorspeller

De map `sterrenvoorspeller` is een kopie van de popup uit je extensie (plus `dashboard-shim.js` en `dashboard.css` om hem als website te laten draaien).
Pas je de extensie aan, kopieer dan `lib/`, `popup/` (behalve die twee bestanden) en `fonts/` opnieuw.

Zonder extensie toont hij de watchlist-snapshot van 19 oktober. **Vernieuwen** zit er niet in: Letterboxd laat een gewone website hun pagina's niet ophalen.
Wil je je vernieuwde watchlist op het dashboard:

1. Zip de **inhoud** van `Episodes Left/letterboxd-voorspeller` (zonder `test/`), onderteken als "unlisted" en installeer versie 0.2.2.
2. Firefox → `about:addons` → Sterrenvoorspeller → **Rechten** → zet toegang tot `nbroers05.github.io` aan.
3. Vernieuw in de extensie-popup zoals altijd. Het dashboard neemt de nieuwe lijst over zodra het open staat.

## 6. Episodes Left op het dashboard

Een website kan niet zelf in een extensie kijken. Daarom stuurt Episodes Left (vanaf versie 0.1.2) je lijst door naar het dashboard, alleen op je dashboard-pagina.

1. Zip de **inhoud** van de map `Episodes Left/episodes-left` (niet de map zelf).
2. Onderteken hem op addons.mozilla.org als "unlisted", net als eerder, en installeer de nieuwe versie in Firefox.
   Snel testen kan ook: `about:debugging` → Deze Firefox → Tijdelijke add-on laden → `manifest.json`.
3. Open één keer livechart.me (zoals altijd) en daarna je dashboard.

Op je telefoon is er geen extensie: daar blijft dit vak leeg.

## 7. Laatst gekeken (Letterboxd via GitHub Action)

Letterboxd is niet direct vanuit de browser te lezen. Daarom haalt een GitHub Action elk uur je Letterboxd-feed op en zet die in `data/letterboxd.json`. Het vak "Laatst gekeken" leest dat bestand.

De posters komen van TMDB. Daarvoor heeft de Action je TMDB-sleutel nodig, als **geheim** (niet in de code):

1. Ga naar github.com/nbroers05/Dashboard → **Settings** (bovenaan, tandwiel).
2. Links: **Secrets and variables** → **Actions**.
3. Klik **New repository secret**.
4. **Name**: `TMDB_API_KEY` (precies zo, hoofdletters).
5. **Secret**: je TMDB "API Key" (themoviedb.org → profiel → **Instellingen** → **API** → het vak **API Key**, de korte code van 32 tekens).
6. **Add secret**.

Direct uitproberen: repo → **Actions** → links **Letterboxd** → **Run workflow** → **Run workflow**. Na een halve minuut staat er een groen vinkje. Daarna draait hij elk uur vanzelf en slaat hij alleen iets op als je iets nieuws gelogd hebt.

Zonder geheim werkt het ook, maar dan komen de posters van Letterboxd zelf in plaats van TMDB.

## 8. Mail (Gmail)

Het mailvak gebruikt dezelfde Google-koppeling als de agenda, maar heeft één extra stap nodig in Google Cloud:

1. Ga naar console.cloud.google.com en kies bovenaan het project **Dashboard**.
2. Zoekbalk: **Gmail API** → **Enable**.
3. Menu → **Google Auth Platform** → **Data Access** → **Add or remove scopes**.
4. Zoek `gmail.readonly`, vink **.../auth/gmail.readonly** aan → **Update** → **Save**.

Daarna op het dashboard: klik in het mailvak op **Gmail koppelen** en vink bij Google de toegang tot Gmail aan. Het dashboard kan je mail alleen **lezen**, niet versturen of verwijderen.
Net als bij de agenda is de toegang 1 uur geldig; daarna één klik op **Vernieuwen**.

## 9. Telefoonmeldingen (hulpprogramma op je pc)

Je telefoon stuurt zijn meldingen al naar Windows (Phone Link). Een website kan daar niet zelf bij, daarom is er een klein hulpprogramma dat ze doorgeeft. Het werkt alleen op de pc waar het draait, en alleen voor het dashboard (andere sites krijgen niets).

1. Open de map `dashboard\helper` in Verkenner.
2. Dubbelklik op **start.bat**. De eerste keer installeert hij wat hij nodig heeft (een minuutje). Daarna draait hij onzichtbaar op de achtergrond.
3. Herlaad het dashboard. Chrome of Edge vraagt misschien of de site "apparaten op je lokale netwerk" mag gebruiken: kies **Toestaan** (dat is je eigen pc).
4. Vraagt Windows om toegang tot meldingen: **Instellingen** → **Privacy en beveiliging** → **Meldingen** → toegang voor apps **Aan**.

**Automatisch starten met Windows:** druk op Windows-toets + R, typ `shell:startup` en druk op Enter. Er opent een map. Klik met rechts op **start.bat** (in `dashboard\helper`) → **Snelkoppeling maken**, en sleep die snelkoppeling naar die map.

Stoppen: Taakbeheer → zoek **pythonw** → **Taak beëindigen**.
Alle Windows-meldingen tonen in plaats van alleen die van je telefoon: zet in `helper\meldingen.py` `ALLEEN_TELEFOON = False`.

## 10. Lokaal testen (optioneel)

In deze map:

```
python -m http.server 8000 --bind 127.0.0.1
```

Open dan `http://127.0.0.1:8000/` (niet `localhost`, dat telt voor Spotify als ander adres).

## Problemen

- **"INVALID_CLIENT: Invalid redirect URI"**: de URL in de adresbalk komt niet exact overeen met een Redirect URI. Let op `/` aan het eind.
- **"User not registered in the Developer Dashboard"** of 403: je e-mailadres staat niet bij User Management.
- **"Geen actief apparaat"**: open Spotify ergens (telefoon/pc) of kies een apparaat uit de lijst.
- Opnieuw inloggen forceren: klik **Uitloggen** onderaan de kaart.
