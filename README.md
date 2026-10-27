# Dashboard

Persoonlijk dashboard (nu: Spotify-speler). Statische site voor GitHub Pages.

Bestanden: `index.html`, `style.css`, `spotify.js`, `config.js`.
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

## 3. Lokaal testen (optioneel)

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
