# Dashboard

Noah's personal dashboard, live at https://nbroers05.github.io/Dashboard/ (repo `nbroers05/Dashboard`, capital D).
Static site: vanilla HTML/CSS/JS, no build step, no server. Runs all day on a portrait monitor and also works on a phone.

History (everything before 1.0.0, the long per-file notes, test logs, old decisions): `docs/archive/CLAUDE-pre-1.0.md`, in Dutch. Read it only when you need background on a specific file or decision; it is not kept up to date.

## Working with Noah (preferences, reviewed 13-11-2026)

**Language**
- Everything is in English: replies, the dashboard's screen text, code, comments, internal names, docs and commit messages. Noah may write Dutch; answer in English anyway unless he says otherwise.
- When giving click-by-click steps, assume his devices, browsers and apps are set to English.
- Noah is not a programmer: short, direct, concrete step-by-step explanations.
- Dutch proper names stay (Sinterklaas, Koningsdag, Albert Heijn, place names). The Japanese words of the Huisstijl stay.

**How to work**
- Do the whole request in one go; don't stop between phases for approval. Commit and push each step, then end with one report: what was done, what works, what doesn't, what Noah must do or test.
- If Noah says "run without stops", same thing; use placeholders in config.js for anything missing.
- Design changes: show one version first and wait for feedback.
- Commit and push to `main` yourself. Always `git pull --rebase` first (the data Action also commits). Always `git add <file>` by name, never `git add -A`, so nothing from `helper/` (tokens, logs) or the private archive goes in.
- Update the phase pane (`update_phase`) when a piece of work starts and when it's ready for Noah to test.
- Claude never types or pastes passwords, API keys or tokens into websites for Noah; he creates accounts and tokens himself. Scripts that pass values on safely (like `dashboard-data/scripts/setup/set_secrets.py`) are fine.
- The dashboard reloads itself within ~15 minutes of a new version. Don't tell Noah to press Ctrl+F5.

**Versions**: `1.MINOR.PATCH`. Big request = MINOR (PATCH back to 0), small fix = PATCH. Bump on every change: the number is in `index.html` as `?v=` after style.css, config, dash and topbar (dash.js passes it to every other script) and at the bottom as "Dashboard version …". Every version gets a row in `CHANGELOG.md` (newest first, one table per day). Current: see `DASH.VERSION` in dash.js.

**Testing**: only the portrait screen, **1350 × 2294** CSS px (Windows zoom 80%), in Huisstijl, demo mode (`?demo`), with the script that looks for elements sticking out of their tile. Other sizes (landscape 2400 × 1149, phone 408 × 770, desktop-site 980 × 1912), Modern, Y2K and themes only when Noah reports a problem there.

**Privacy**
- Nothing personal in this public repo: no wage, age, address, IBAN or employee number.
- Data from the private archive (`dashboard-data`) never goes into this public repo, not even as a test file.
- The check-in tile only shows how many check-ins were done today, never the values. Noah only looks at check-in data after the hypotheses are written and there are 120 check-ins (`dashboard-data/HYPOTHESES.md`).
- Maps data in the archive only as time per day and ~250 m blocks, never routes. Bank data only date, amount, description and type (no account numbers).

**Look and behaviour**
- Albert Heijn always uses the bright AH blue `#00ADE6` (CSS `--ah-c` in Huisstijl), in every style, wherever AH appears.
- Huisstijl is the default style. Modern and Y2K stay as options in Settings › Theme. The phone has its own Huisstijl app (`dashboard-app/android`).
- Only the portrait screen ("tall") really counts. It shows everything without a click and keeps itself running: a "Refresh" button, a login screen or "helper not reachable" is a bug; after sleep or lost internet it recovers by itself. Nothing needed at night (PC and screen are off).
- Player and lyrics stay. The weather/F1/AH row stays as it is. The More bar may stay ("a few clicks is fine, but no maze of tabs").
- Canvas assignments are checked off by hand ("handed in"), shared between devices.
- The "Reload now" button in a failed tile stays.
- Sleep and heart rate aren't shown (they aren't measured).
- Reddit, KINO and Pathé are left out on purpose (Reddit blocks new API apps; KINO's robots.txt forbids it; Pathé refuses GitHub Actions).
- The ideas under "After 1.0 (parked)" in WISHES.md are not built unless Noah brings one up.

## Wish list

Noah writes wishes in `Documents/Claude eigen mapje/WISHES.md` (his Obsidian vault, outside the repos). Pictures are in `wishes/` next to it, written as `![[name.png]]` (no path, Obsidian style). Older material: `ARCHIVE.md` next to it.
Sections: "To do" (small wishes), "Big ideas" (each a `### Name` with What, Why, Mockup, Done when), "After 1.0 (parked)", "Questions", "Done".

**"Do the wishes"**: read WISHES.md. If there are open questions under "Questions" that wait on Noah, ask about those first. Otherwise do everything under "To do" top to bottom plus every big idea that has What and a Mockup, without stopping to ask.
- Per wish: do it, bump the version, commit and push, and move the line with its picture to "Done" with date and version, e.g. `- the clock can be bigger (29-10-2026, 1.7.2)`.
- Unclear: move the line with its picture to "Questions" with your question below (`  - Question: …`) and go on.
- Pictures of finished wishes move to `wishes/done/` and the reference becomes `![[done/name.png]]`. Never delete them. Pictures under "Questions" stay in `wishes/`.
- **Never** put a picture from `wishes/` or anything from `.obsidian/` in a repo.
- At the end: a short list of what was done (with versions) and what is under "Questions".
- A big idea without What or Mockup: write your questions below it and skip it.

## Running locally

```
python -m http.server 8000 --bind 127.0.0.1 --directory dashboard
```
Open `http://127.0.0.1:8000/` (not `localhost`: Spotify doesn't accept it as a redirect). The preview config is `.claude/launch.json` ("dashboard"). `?demo` shows fake data for the player, agenda and Episodes Left without logging in; weather, F1, sun, AniList covers, TMDB posters and LRCLIB lyrics are real. The preview sometimes serves an old cached version: add `&r=N` or reload files with `fetch(…, {cache: 'reload'})`. In a hidden preview pane `requestAnimationFrame` doesn't run.

Other test parameters: `?datum=YYYY-MM-DD`, `?thema=<id>` or `?<id>`, `?weer=sneeuw|regen|zon|koud`, `?stand=digital|poster|titel`, `?stijl=modern|y2k|huisstijl`, `?maat` (shows the real window size), `?mini=1` (new-tab page: starts minimal, loads tiles only when expanded), `?kamer` (3D room), `?app=pc` (Windows app title bar).

On Noah's PC: Python 3.14 via the Python manager (real path `C:\Users\broer\AppData\Local\Python\pythoncore-3.14-64\`; `python` in PATH is the WindowsApps shortcut), no `node`, GitHub CLI logged in as nbroers05 (`C:\Program Files\GitHub CLI\gh.exe`), ActivityWatch. The helper (`helper/start.bat`) starts with Windows. Phone: Samsung Galaxy S24 Ultra with Firefox. New-tab page in Firefox: `?mini=1`.

## Layout of the code

`index.html` holds the top bar and all tiles. Loaded directly: config, vault, dash, sync, topbar, settings, huisstijl, themes, focus, feeds, mydata, games. Everything else is in `DASH.boot([...])` at the bottom and inserted by dash.js in that order with the same `?v=` (with `?mini=1` only when expanded). **New script = add it to that list.**

| File | What |
|---|---|
| `dash.js` | Shared helpers: `DASH.widget()` (each tile fails on its own and then shows `DASH.problem()` with "Reload now"), `DASH.radar()` (rain for the next 2 h: Buienradar, fallback Open-Meteo), `DASH.alert(key, list)`, `DASH.every()`, `img()`, `panel()`, date helpers. Self-recovery: detects sleep (gap > 3 min) and `online` → event `dash:wake`. Self-reload on a new version: every 15 min fetches `index.html` and compares `dash.js?v=` with `DASH.VERSION`; reloads after 2 min without mouse/keyboard, no open dialog or focused input. Registers `sw.js` |
| `desk.js` | Picks the layout: **tall** (wider than 700 px, not desk), **desk** (≥ 1280 px wide and landscape, with `rail.js` sidebar) or **phone** (≤ 700 px, `phone.js` tab bar). Moves existing tiles and puts them back; sends `dash:layout`. Tall: player, row weather/F1/AH, row Canvas/notifications/health, rotating tile (Last watched, Memory Lane, friends, film, Spotify month, Episodes; 12 s), agenda, More bar (check-in, wishes). Thin player button `#player-size` |
| `topbar.js` | Clock, date + ISO week, day line (`DASH_DAYLINE`: AH today, rain, next Canvas deadline, birthdays), shortcuts (`config.snelkoppelingen` + own list `dash.links`), search (a URL goes straight there), minimal mode (`body.minimal`), Research menu (`config.onderzoek`) |
| `vault.js` | One login: keys encrypted with the passphrase (PBKDF2-SHA256 600,000 → AES-GCM 256) in public `vault.json`; created in Settings › Log in and pushed by the helper (`POST /vault`). "Don't remember" redirects `localStorage` to `sessionStorage`. Also derives the Supabase password (`DASH_SB.prepare`) |
| `sync.js` | `DASH_SB`: Supabase via plain `fetch` (GoTrue + PostgREST). Shared keys (`SHARED`): `dash.links`, `health.goal`, `todo.items`; newest wins (hook on `Storage.prototype`). Internal flags `_…` in `dashboard_settings`. Never shows a login screen; logs in again with the derived password |
| `telefoon.js` | Writes `_telefoon.stand` (Canvas, Episodes, mail, check-ins, film, Spotify) to Supabase for the phone app; `widgets/ah.js` writes `_telefoon.loon`. The app calculates net pay with the same formula (`Loon.kt`): change both together |
| `settings.js` | Gear → settings dialog with tabs registered via `DASH_SETTINGS.add({id, label, order, render})` |
| `themes.js`, `themes/*.js` | Theme system: season + highest-priority holiday/event, real weather on top, particles behind the tiles, decorations, one-off effects. One file per theme (fields explained in `themes/standaard.js`); new theme = new file + name in `FILES`. Own birthday comes from the private archive (`config.json` → `persoonlijk.verjaardag`) |
| `huisstijl.css`, `huisstijl.js`, `huisstijl/` | Huisstijl (design system https://claude.ai/artifact/1uHEFBcpmD23vuaQRoQED9). `html.nh` on screens wider than 700 px; mood `html[data-stand]` = `digital` (sunrise–12:00), `poster` (12:00–sunset), `titel` (evening) on tall, elsewhere `poster`. Window titles from `WINDOWS` (file name + Japanese word). `FEEST` = holiday decorations |
| `style.css`, `y2k.css` | Base styles (12-column grid, `--c` per tile, phone below 700 px) and the Y2K style (`html.y2k`) |
| `calendar.js` | Google Calendar (list/week; in Huisstijl on tall a day timeline, `renderDay()`/`fitDay()`). Publishes `dash:calendar` / `DASH_CALENDAR`. Tokens: helper `/token` first, then the bundle's refresh token directly at Google, retry every 5 min; "Refresh" only after an hour without success. Also `DASH_GOOGLE` for Gmail and a separate health token |
| `spotify.js` | Player (PKCE). `DASH_SPOTIFY`, `dash:track`. Never logs out on its own; retries every 5 min |
| `rail.js`, `phone.js` | Desk sidebar; phone tab bar (Today, Agenda, Media, Data) |
| `feeds.js`, `mydata.js`, `games.js`, `focus.js` | Pages: Feeds (`data/feeds.json` + markets), My data (private aggregates), games (higher/lower, poster guess, 2048), focus mode |
| `datarepo.js`, `datastatus.js`, `datarun.js` | Private archive via the GitHub contents API with the archive token (`data.token`); status panel; starts the hourly collect Action if GitHub delayed it |
| `kamer.js`, `appbar.js` | 3D room start screen (only `?kamer` or the Windows app; parked) and the Windows app title bar |
| `motion.js` | One-off load animations |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: network first, cache only offline; never `data/`, `helper/` or login returns |
| `privacy.html`, `google8b5e1b4439cc1a23.html` | Needed for the Google app verification. **Don't remove or rename** |
| `planner/` | Separate planner page with its own version and `planner/CHANGELOG.md`; data only in Supabase (separate project). Test: `planner/?demo` |
| `sterrenvoorspeller/` | Copy of the Sterrenvoorspeller extension popup with a shim |

**Tiles (`widgets/`)**: `weather.js` (Open-Meteo, moving Meteocons icons, popup), `rain.js` (rain alarm), `f1.js` (Jolpica: countdown or results), `ah.js` (AH shifts = events with "AH" in the title; hours, pay period, expected pay from `ahLoon` in the private archive), `canvas.js` (deadlines from the Canvas iCal in Google Calendar; handed-in marks in Supabase `dashboard_canvas_done`, else the archive), `episodes.js` + `episodes-log.js` (Episodes Left extension via `postMessage`, AniList covers), `stars.js` (film tonight + cinema, `DASH_FILM`), `letterboxd.js`, `friends.js`, `spotify-top.js`, `lyrics.js` (LRCLIB), `media.js` (media stack with helper media cards), `alerts.js` (notifications tile + phone notifications from the helper), `mail.js` (Gmail), `health.js` (Google Health API, steps only; highest source per day counts), `memory.js` (Memory Lane from the archive), `checkin.js`, `todo.js`, `wishes.js` (WISHES.md via the helper).

**Animations**: allowed on load, on opening and on a change; everything off with `prefers-reduced-motion`.

## Data sources

| Where | What |
|---|---|
| `config.js` (public) | Client IDs and keys that may be public: `spotifyClientId`, `googleClientId`, `tmdbApiKey`, Supabase `{url, anonKey, email}`, shortcuts, feeds, friends, focus playlist, markets |
| `.github/workflows/letterboxd.yml` ("Dashboard data") | At :17 and :47: Letterboxd + friends (`letterboxd.py`), LantarenVenster (`cinema.py`, once a day), feeds (`feeds.py`) → `data/*.json`. Everything it writes is public. Secret `TMDB_API_KEY` |
| `helper/` (Noah's PC, `127.0.0.1:8765`) | `server.py`: phone notifications (Phone Link; `/notifications`, `/dismiss/<id>`, log `notifications-log.csv` without content), media sessions (`/media`), Google tokens (`/token`), linking page `/link` (Google + Spotify; redirect URIs `/oauth`, `/spotify-oauth`), wishes (`/wishes`, `wishes.py`), vault (`/vault`). Old aliases `/meldingen`, `/weg/<id>`, `/koppel`, `/wensen` stay for one version (remove in 1.8). CORS only for `https://nbroers05.github.io` and `http://127.0.0.1:8000`. Secrets in `tokens.json`, `google-client.json`, `spotify-client.json` (gitignored). After changing it: run `helper/start.bat` again |
| Private archive `nbroers05/dashboard-data` | Own CLAUDE.md. The dashboard reads `data/status.json`, `data/aggregates/`, `config.json` (`ahLoon`, `persoonlijk`) and writes `data/self-report/` (check-ins) and `data/episodes-left/` |
| Supabase project "dashboard" | `supabase.sql`: `dashboard_settings`, `dashboard_canvas_done`, RLS own rows only, sign-ups off. Separate from the planner's project |
| No key needed | Buienradar, Open-Meteo, Jolpica, AniList, LRCLIB, flagcdn, jsDelivr, CoinGecko, NOS/NU.nl/YouTube RSS, Letterboxd Journal |

## Other repos

- `dashboard-app` (public): Windows app (Tauri 2, a window around this site with `?app=pc`) and the Android phone app (`android/`, Jetpack Compose in Huisstijl, built only via GitHub Actions; downloads as release `telefoon-v<version>`). The phone app reads Supabase (`_telefoon.stand`, `_telefoon.loon`, `todo.items`, `dashboard_canvas_done`) and the planner project.
- `dashboard-data` (private): the data archive; see its CLAUDE.md.
- Firefox extensions in `Documents/Claude eigen mapje/Episodes Left/`: `episodes-left` and `letterboxd-voorspeller` (Sterrenvoorspeller), each with a `dashboard-bridge.js`.
