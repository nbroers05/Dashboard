# Dashboard

Noah's personal dashboard: a static website on GitHub Pages at https://nbroers05.github.io/Dashboard/.
It runs all day on a portrait monitor and shows music, weather, rain, F1, AH shifts and pay, Canvas deadlines, agenda, films, series, notifications and more.
Claude makes the changes and pushes them; the site updates itself within about 15 minutes.

Try it without logging in: add `?demo` to the address.

These steps were all done once already. They're here in case something needs to be set up again (a new PC, a revoked key). Directions assume your browser and apps are in English.

## 1. Spotify (developer.spotify.com/dashboard)

Open the app **Dashboard** → **Settings** → **Edit**:

- **Redirect URIs**: exactly these (with `/` at the end):
  - `https://nbroers05.github.io/Dashboard/`
  - `https://nbroers05.github.io/dashboard/`
  - `http://127.0.0.1:8000/`
  - `http://127.0.0.1:8765/spotify-oauth` (for the helper, step 9)
- **APIs used**: Web API ticked.
- **User Management**: your own Spotify email address (Development mode only allows these users).
- **Save**.

The **Client ID** is in `config.js` as `spotifyClientId`.

## 2. GitHub Pages

The repo `nbroers05/Dashboard` is public and served from **Settings** → **Pages** → Source: **Deploy from a branch**, Branch: **main** / **(root)**.

## 3. Google Calendar, Gmail and Health (console.cloud.google.com)

All in the project **Dashboard**.

1. Search bar → enable **Google Calendar API**, **Gmail API** and **Google Health API**.
2. Menu → **Google Auth Platform** → **Audience**: the app is **In production** (so keys don't expire after 7 days). Google shows "unverified" when logging in; click **Continue**.
3. **Data Access** → **Add or remove scopes**: `calendar.readonly`, `gmail.readonly` and the three Google Health scopes `googlehealth.activity_and_fitness.readonly`, `googlehealth.sleep.readonly`, `googlehealth.health_metrics_and_measurements.readonly` → **Update** → **Save**.
4. **Clients**:
   - A **Web application** client with **Authorized JavaScript origins** `https://nbroers05.github.io` and `http://127.0.0.1:8000` (no `/` at the end). Its Client ID is in `config.js` as `googleClientId`.
   - A **Desktop app** client for the helper (step 9). Its JSON file is `helper/google-client.json` (never goes to GitHub).

## 4. Canvas deadlines in Google Calendar

1. Canvas → **Calendar** → bottom right **Calendar Feed** → copy the link.
2. Google Calendar on the computer → **Other calendars** **+** → **From URL** → paste → **Add calendar**.
3. Make sure the word **Canvas** is in that calendar's name; that's how the dashboard recognises it.

Google refreshes subscribed calendars itself, roughly every 8 to 24 hours, so a new deadline can take a while.

## 5. Film posters (TMDB)

The TMDB **API Key** (the short key, not the long Read Access Token) is in `config.js` as `tmdbApiKey` and is also the repository secret `TMDB_API_KEY` (repo → **Settings** → **Secrets and variables** → **Actions**) for the data Action.

## 6. Firefox extensions

Two of your own extensions pass data to the dashboard, only on the dashboard page:

- **Episodes Left** (`Episodes Left/episodes-left`): your LiveChart list with how many episodes are left.
- **Sterrenvoorspeller** (`Episodes Left/letterboxd-voorspeller`): your Letterboxd watchlist with predicted ratings. In `about:addons` → Sterrenvoorspeller → **Permissions**, allow `nbroers05.github.io`.

New version: zip the **contents** of the extension folder, sign it on addons.mozilla.org as "unlisted" and install it in Firefox. Quick test: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → `manifest.json`.

The `sterrenvoorspeller/` folder in this repo is a copy of the extension's popup. After changing the extension, copy `lib/`, `popup/` (except `dashboard-shim.js` and `dashboard.css`) and `fonts/` again.

## 7. Data Action (Letterboxd, cinema, feeds)

The Action "Dashboard data" runs twice an hour and writes `data/*.json` (Letterboxd for you and friends, LantarenVenster, news/film/YouTube feeds). It needs the secret `TMDB_API_KEY` (step 5). Run it by hand: repo → **Actions** → **Dashboard data** → **Run workflow**.

## 8. Phone notifications, media and Google tokens (the helper)

A small program on your PC passes on what a website can't reach itself: phone notifications (via Phone Link), what's playing (YouTube, VLC…), fresh Google tokens every hour, your wish list, and saving the login bundle. Only the dashboard may talk to it.

1. Open the folder `dashboard\helper` and double-click **start.bat**. The first time it installs what it needs. After that it runs invisibly.
2. If Windows asks for access to notifications: **Settings** → **Privacy & security** → **Notifications** → allow apps access.
3. Linking Google and Spotify: open `http://127.0.0.1:8765/koppel` and click the link buttons. For Spotify, paste the Client Secret (Spotify app → **Settings** → **View client secret**) first.
4. Start with Windows: **Windows key + R** → `shell:startup` → Enter. Right-click **start.bat** → **Create shortcut** and drag the shortcut into that folder.

After the helper is updated: double-click **start.bat** again (it stops the old one first).
Stop it: Task Manager → **pythonw** → **End task**. Revoke Google access at myaccount.google.com/permissions and delete `helper\tokens.json`.

## 9. Health

Samsung Health → Health Connect → the Google Health app → Google → dashboard. The Google Health app on your phone must be logged in with the same Google account and linked to Health Connect. Only steps are shown (sleep and heart rate aren't measured).

## 10. One login on every computer

1. Make sure the helper runs and Google and Spotify are linked (step 8).
2. Dashboard → gear → **Log in**. You see which keys go into the bundle (all green = good).
3. Pick a **long passphrase** of at least 4 words (anyone can download the encrypted bundle and try to guess), type it twice and click **Create bundle and put it online**. A few minutes later it's live.
4. On another computer: open the dashboard and type the passphrase. Tick **Remember this computer** only on your own devices.

New key or new passphrase: repeat steps 2 and 3. Browsers that are already logged in keep their keys until you log out there.

## 11. Supabase (same settings and Canvas checks on every device)

Project **dashboard** on supabase.com (separate from the planner). Tables and security rules are in `supabase.sql`. Sign-ups are off.
Link a device: Settings (gear) → **Log in** → **Supabase** → type your passphrase → **Link Supabase**. After that it logs itself in again when needed.

Daily copy of the Canvas checks to the archive: in a terminal in `dashboard-data`, run `python scripts/setup/dashboard_export.py`, paste the line it copies into Supabase → **SQL Editor** → **New query** → **Run**, then press Enter in the terminal.

## 12. Apps

- **Phone**: the Android app "Dashboard" (in `dashboard-app/android`), see its README.
- **Windows**: download `…_x64-setup.exe` from https://github.com/nbroers05/dashboard-app/releases. Windows says "Windows protected your PC": **More info** → **Run anyway**. Log in once with your passphrase.

## 13. Testing locally

In the `dashboard` folder:

```
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` (not `localhost`: Spotify treats that as a different address).

## Problems

- **"INVALID_CLIENT: Invalid redirect URI"**: the address doesn't exactly match a Redirect URI in step 1. Mind the `/` at the end.
- **"User not registered in the Developer Dashboard"** or 403: your email address isn't under User Management (step 1).
- **"No active device"**: open Spotify somewhere (phone or PC).

Image sources: weather icons Meteocons (Bas Milius, MIT), circuits bacinger/f1-circuits (MIT), flags flagcdn.com, anime covers AniList.
