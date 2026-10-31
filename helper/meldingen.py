"""Hulpprogramma: geeft de Windows-meldingen (ook die van je telefoon via Phone Link) door aan het dashboard.

Draait op je eigen pc en luistert alleen op 127.0.0.1 (niet bereikbaar vanaf andere apparaten).
Alleen het dashboard (github.io en de lokale testversie) mag de meldingen lezen.
Geeft het dashboard ook nieuwe Google-tokens (google_token.py), zodat "Vernieuwen" niet meer nodig is.
Starten: dubbelklik op start.bat in deze map. Zie README, stap 9.

Houdt ook een logboek bij (meldingen-log.csv, alleen op deze pc): per nieuwe melding de tijd en de app, ZONDER inhoud.
Het meldingencentrum wordt elke 10 s op de achtergrond gelezen (Windows doet daar zelf ~3 s over); /meldingen antwoordt uit dat geheugen.
De dagelijkse taak van de privé repo dashboard-data telt daaruit het aantal meldingen per app per uur.
"""

import asyncio
import csv
import html
import os
import json
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from winrt.windows.ui.notifications import KnownNotificationBindings, NotificationKinds
from winrt.windows.ui.notifications.management import UserNotificationListener, UserNotificationListenerAccessStatus

import google_token
import spotify_token
import vault
import wensen

# Media (wat er afspeelt): als dat deel niet laadt, werkt de rest gewoon door
try:
    import media
except Exception as e:  # bijv. pakket nog niet geïnstalleerd
    media = None
    MEDIA_FOUT = str(e)

PORT = 8765
# Alleen meldingen van je telefoon (Phone Link). Zet op False om alle Windows-meldingen te tonen.
ALLEEN_TELEFOON = True
TELEFOON_APPS = {"Phone Link", "Telefoonkoppeling", "Your Phone", "Je telefoon"}
MAX = 30
TOEGESTAAN = {"https://nbroers05.github.io", "http://127.0.0.1:8000"}

listener = UserNotificationListener.current
lock = threading.Lock()          # media (wat er afspeelt, bedienen)
meld_lock = threading.Lock()     # meldingencentrum (los, zodat een trage leesronde de mediaknoppen niet ophoudt)


async def lees():
    """Eén keer het meldingencentrum lezen, voor het dashboard én het logboek. Windows doet hier zelf al ~3 s over
    (gemeten 31 okt 2026, 30 meldingen), daarom gebeurt dit alleen in ververs_lus() en niet per vraag van het dashboard."""
    if listener.get_access_status() != UserNotificationListenerAccessStatus.ALLOWED:
        status = await listener.request_access_async()
        if status != UserNotificationListenerAccessStatus.ALLOWED:
            return None, []
    items, log = [], []
    for n in await listener.get_notifications_async(NotificationKinds.TOAST):
        try:
            app = n.app_info.display_info.display_name
        except Exception:
            app = "Onbekend"
        t = int(n.creation_time.timestamp() * 1000)
        try:
            binding = n.notification.visual.get_binding(KnownNotificationBindings.toast_generic)
            teksten = [x.text for x in binding.get_text_elements()] if binding else []
        except Exception:
            teksten = []
        # Logboek: bij Phone Link is de eerste regel de naam van de app op de telefoon (bijv. "WhatsApp"); de rest is
        # inhoud en wordt niet bewaard
        log.append((n.id, t, app, (teksten[0].strip() if app in TELEFOON_APPS and teksten and teksten[0].strip() else app)[:60]))
        if ALLEEN_TELEFOON and app not in TELEFOON_APPS:
            continue
        teksten = [x for x in teksten if x and x.strip()]
        if not teksten:
            continue
        items.append({"id": n.id, "app": app, "telefoon": app in TELEFOON_APPS, "title": teksten[0], "body": " · ".join(teksten[1:]), "time": t})
    items.sort(key=lambda x: x["time"], reverse=True)
    return items[:MAX], log


# ---------- Logboek: alleen tijd en app per melding, geen inhoud ----------
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meldingen-log.csv")
VERVERS = 10          # seconden tussen twee keer het meldingencentrum lezen (dat duurt zelf al ~3 s)
cache = {"items": None, "geen_toegang": False, "klaar": threading.Event()}
gezien = set()         # (tijd, app) die al in het logboek staan, zodat een melding maar één keer telt (ook na herstarten)


def ververs_lus():
    """Meldingen op de achtergrond bijhouden (voor /meldingen, dat dan meteen antwoordt) en het logboek bijwerken."""
    nieuw_bestand = not os.path.exists(LOG_FILE)
    if not nieuw_bestand:
        with open(LOG_FILE, encoding="utf-8", newline="") as f:
            for r in list(csv.DictReader(f))[-5000:]:
                gezien.add((int(r["time_ms"]), r["app"]))
    while True:
        try:
            with meld_lock:
                items, log = asyncio.run(lees())
            cache["items"], cache["geen_toegang"] = items or [], items is None
            cache["klaar"].set()
            nieuw = [x for x in log if (x[1], x[3]) not in gezien]
            if nieuw:
                with open(LOG_FILE, "a", encoding="utf-8", newline="") as f:
                    w = csv.writer(f)
                    if nieuw_bestand:
                        w.writerow(["time_ms", "windows_app", "app"])
                        nieuw_bestand = False
                    for nid, t, win_app, app in nieuw:
                        w.writerow([t, win_app, app])
                        gezien.add((t, app))
            if len(gezien) > 20000:
                houden = sorted(gezien)[-10000:]   # alleen de nieuwste onthouden (oude staan niet meer in het meldingencentrum)
                gezien.clear()
                gezien.update(houden)
        except Exception as e:
            print(f"Meldingen lezen: {e}", file=sys.stderr)
        time.sleep(VERVERS)


def weg(nid):
    listener.remove_notification(nid)
    if cache["items"]:
        cache["items"] = [x for x in cache["items"] if x["id"] != nid]


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get("Origin")
        if origin in TOEGESTAAN:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            # Chrome vraagt dit als een https-site met je eigen pc praat
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def antwoord(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def pagina(self, code, titel, inhoud):
        body = f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titel}</title><style>body{{font-family:system-ui,sans-serif;background:#121214;color:#eee;max-width:560px;margin:60px auto;padding:0 20px;line-height:1.5}}
a.k{{display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;border-radius:999px;background:#1ed760;color:#06210f;font-weight:700;text-decoration:none}}
.ok{{color:#5bd38a}}.nee{{color:#ff8a5c}}code{{background:#222;padding:2px 6px;border-radius:6px}}</style>
<h1>{titel}</h1>{inhoud}""".encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def koppel(self):
        st = google_token.status()
        if not st["client"]:
            return self.pagina(200, "Google koppelen", "<p class='nee'>Eerst <code>google-client.json</code> in de map <code>helper</code> zetten (README stap 9). Daarna deze pagina vernieuwen.</p>")
        regels = "".join(
            f"<p>{google_token.NAMEN[w]}: {'<span class=ok>gekoppeld ✓</span>' if st[w] else '<span class=nee>nog niet gekoppeld</span>'}<br>"
            f"<a class='k' href='/koppel/{w}'>{'Opnieuw koppelen' if st[w] else 'Koppelen'}</a></p>"
            for w in google_token.SCOPES
        )
        sp = spotify_token.status()
        uri = spotify_token.redirect_uri(PORT)
        spotify = ("<h2>Spotify (voor de inlogbundel)</h2>"
                   "<p>Alleen nodig voor <b>Alles met één inlog</b> (README stap 13). Zet eerst <code>" + uri + "</code> als Redirect URI in je Spotify-app.</p>"
                   "<form method='post' action='/spotify-secret'><p>Client Secret: " + ("<span class=ok>staat erin ✓</span>" if sp["secret"] else "<span class=nee>nog niet</span>") + "<br>"
                   "<input name='secret' type='password' autocomplete='off' placeholder='plak hier de Client Secret' style='width:300px;padding:8px;border-radius:8px;border:1px solid #444;background:#222;color:#eee'> "
                   "<button style='padding:8px 14px;border-radius:999px;border:0'>Bewaren</button></p></form>"
                   + (f"<p>Spotify: {'<span class=ok>gekoppeld ✓</span>' if sp['linked'] else '<span class=nee>nog niet gekoppeld</span>'}<br>"
                      f"<a class='k' href='/koppel/spotify'>{'Opnieuw koppelen' if sp['linked'] else 'Koppelen'}</a></p>" if sp["secret"] else ""))
        self.pagina(200, "Google koppelen", "<p>Koppel allebei. Daarna haalt het dashboard zelf elk uur een nieuwe toegang op.</p>" + regels + spotify)

    def do_GET(self):
        pad, _, query = self.path.partition("?")
        params = dict(urllib.parse.parse_qsl(query))
        if pad == "/koppel":
            return self.koppel()
        if pad == "/vault" and self.headers.get("Origin") in TOEGESTAAN:
            return self.antwoord(200, vault.status())
        if pad == "/koppel/spotify":
            try:
                url = spotify_token.login_url(PORT)
            except spotify_token.TokenError as e:
                return self.pagina(400, "Koppelen lukt niet", f"<p class='nee'>{html.escape(str(e))}</p><p><a class='k' href='/koppel'>Terug</a></p>")
            self.send_response(302)
            self.send_header("Location", url)
            self.end_headers()
            return
        if pad == "/spotify-oauth":
            try:
                spotify_token.callback(params, PORT)
            except spotify_token.TokenError as e:
                return self.pagina(400, "Koppelen lukt niet", f"<p class='nee'>{html.escape(str(e))}</p><p><a class='k' href='/koppel'>Terug</a></p>")
            return self.pagina(200, "Spotify gekoppeld ✓", "<p>Maak nu de bundel opnieuw: dashboard → tandwiel → Inloggen.</p><p><a class='k' href='/koppel'>Terug naar koppelen</a></p>")
        if pad == "/vault/keys" and self.headers.get("Origin") in TOEGESTAAN:
            # Alleen voor Instellingen › Inloggen: de blijvende sleutels, die daar versleuteld in de bundel gaan
            return self.antwoord(200, {"google": google_token.bundel(), "spotify": spotify_token.bundel()})
        if pad.startswith("/koppel/"):
            try:
                url = google_token.login_url(pad.rsplit("/", 1)[1], PORT)
            except google_token.TokenError as e:
                return self.pagina(400, "Koppelen lukt niet", f"<p class='nee'>{html.escape(str(e))}</p>")
            self.send_response(302)
            self.send_header("Location", url)
            self.end_headers()
            return
        if pad == "/oauth":
            try:
                naam, missing = google_token.callback(params, PORT)
            except google_token.TokenError as e:
                return self.pagina(400, "Koppelen lukt niet", f"<p class='nee'>{html.escape(str(e))}</p><p><a class='k' href='/koppel'>Terug</a></p>")
            waarschuwing = f"<p class='nee'>Niet alle vinkjes stonden aan; ontbreekt: {html.escape(', '.join(m.rsplit('/', 1)[1] for m in missing))}</p>" if missing else ""
            return self.pagina(200, f"{naam} gekoppeld ✓", waarschuwing + "<p>Je kunt dit tabblad sluiten.</p><p><a class='k' href='/koppel'>Terug naar koppelen</a></p>")
        if pad == "/token":
            # Alleen het dashboard mag een token krijgen
            if self.headers.get("Origin") not in TOEGESTAAN:
                return self.antwoord(403, {"error": "niet toegestaan"})
            try:
                t = google_token.access_token(params.get("which", ""))
            except google_token.TokenError as e:
                return self.antwoord(409, {"error": str(e)})
            except OSError as e:
                return self.antwoord(502, {"error": f"Google niet bereikbaar: {e}"})
            return self.antwoord(200, {"access_token": t["access_token"], "expires_in": int(t["expires_at"] - time.time()), "scope": t["scope"]})
        if pad == "/media":
            if self.headers.get("Origin") not in TOEGESTAAN:
                return self.antwoord(403, {"error": "niet toegestaan"})
            if media is None:
                return self.antwoord(503, {"error": f"media niet beschikbaar: {MEDIA_FOUT}"})
            with lock:
                items = asyncio.run(media.lijst())
            return self.antwoord(200, {"items": items})
        if pad == "/media/thumb":
            t = media.thumb(params.get("k", "")) if media else None
            if not t:
                return self.antwoord(404, {"error": "geen hoes"})
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", t[0])
            self.send_header("Cache-Control", "max-age=3600")
            self.send_header("Content-Length", str(len(t[1])))
            self.end_headers()
            self.wfile.write(t[1])
            return
        if pad == "/wensen":
            # Wensenlijst (WENSEN.md naast de repo's), alleen lezen en alleen voor het dashboard
            if self.headers.get("Origin") not in TOEGESTAAN:
                return self.antwoord(403, {"error": "niet toegestaan"})
            data = wensen.lees()
            return self.antwoord(200, data) if data else self.antwoord(404, {"error": "WENSEN.md niet gevonden"})
        if pad != "/meldingen":
            return self.antwoord(404, {"error": "niet gevonden"})
        # Andere sites mogen niets lezen
        if self.headers.get("Origin") not in TOEGESTAAN | {None}:
            return self.antwoord(403, {"error": "niet toegestaan"})
        cache["klaar"].wait(8)   # alleen vlak na het starten hoeft dit te wachten
        items = None if cache["geen_toegang"] else (cache["items"] or [])
        if items is None:
            return self.antwoord(403, {"error": "Windows geeft geen toegang tot meldingen. Zet het aan bij Instellingen > Privacy en beveiliging > Meldingen."})
        self.antwoord(200, {"items": items})

    def do_POST(self):
        # /spotify-secret: formulier op /koppel (alleen vanaf de koppelpagina zelf)
        if self.path == "/spotify-secret":
            if self.headers.get("Origin") != f"http://127.0.0.1:{PORT}":
                return self.antwoord(403, {"error": "niet toegestaan"})
            lengte = min(int(self.headers.get("Content-Length") or 0), 2000)
            velden = dict(urllib.parse.parse_qsl(self.rfile.read(lengte).decode("utf-8", "replace")))
            try:
                spotify_token.bewaar_secret(velden.get("secret"))
            except spotify_token.TokenError as e:
                return self.pagina(400, "Niet bewaard", f"<p class='nee'>{html.escape(str(e))}</p><p><a class='k' href='/koppel'>Terug</a></p>")
            self.send_response(303)
            self.send_header("Location", "/koppel")
            self.end_headers()
            return
        # /vault: versleutelde inlogbundel van Instellingen › Inloggen opslaan en pushen (vault.py)
        if self.path == "/vault" and self.headers.get("Origin") in TOEGESTAAN:
            try:
                lengte = int(self.headers.get("Content-Length") or 0)
                if not 0 < lengte < 200000:
                    raise vault.VaultError("bundel te groot of leeg")
                return self.antwoord(200, vault.bewaar(json.loads(self.rfile.read(lengte))))
            except (vault.VaultError, ValueError) as e:
                return self.antwoord(400, {"error": str(e)})
        # /media/playpause|next|prev?id=...: media bedienen
        if self.path.startswith("/media/") and self.headers.get("Origin") in TOEGESTAAN and media is not None:
            pad, _, query = self.path.partition("?")
            try:
                with lock:
                    ok = asyncio.run(media.bedien(dict(urllib.parse.parse_qsl(query)).get("id", ""), pad.rsplit("/", 1)[1]))
                return self.antwoord(200, {"ok": bool(ok)})
            except (KeyError, ValueError) as e:
                return self.antwoord(404, {"error": str(e)})
        # /weg/123: melding weghalen (ook uit het Windows-meldingencentrum)
        if not self.path.startswith("/weg/") or self.headers.get("Origin") not in TOEGESTAAN:
            return self.antwoord(403, {"error": "niet toegestaan"})
        try:
            with meld_lock:
                weg(int(self.path.split("/")[2]))
            self.antwoord(200, {"ok": True})
        except (ValueError, IndexError):
            self.antwoord(400, {"error": "ongeldig id"})

    def log_message(self, *args):
        pass  # niet elke vraag in beeld zetten


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"Poort {PORT} is al in gebruik: draait het hulpprogramma al?", file=sys.stderr)
        return
    threading.Thread(target=ververs_lus, daemon=True).start()
    print(f"Meldingen: http://127.0.0.1:{PORT}/meldingen · Google koppelen: http://127.0.0.1:{PORT}/koppel (Ctrl+C om te stoppen)")
    server.serve_forever()


if __name__ == "__main__":
    main()
