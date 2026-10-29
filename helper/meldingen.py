"""Hulpprogramma: geeft de Windows-meldingen (ook die van je telefoon via Phone Link) door aan het dashboard.

Draait op je eigen pc en luistert alleen op 127.0.0.1 (niet bereikbaar vanaf andere apparaten).
Alleen het dashboard (github.io en de lokale testversie) mag de meldingen lezen.
Geeft het dashboard ook nieuwe Google-tokens (google_token.py), zodat "Vernieuwen" niet meer nodig is.
Starten: dubbelklik op start.bat in deze map. Zie README, stap 9.

Houdt ook een logboek bij (meldingen-log.csv, alleen op deze pc): per nieuwe melding de tijd en de app, ZONDER inhoud.
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
lock = threading.Lock()


async def lees():
    if listener.get_access_status() != UserNotificationListenerAccessStatus.ALLOWED:
        status = await listener.request_access_async()
        if status != UserNotificationListenerAccessStatus.ALLOWED:
            return None
    items = []
    for n in await listener.get_notifications_async(NotificationKinds.TOAST):
        try:
            app = n.app_info.display_info.display_name
        except Exception:
            app = "Onbekend"
        if ALLEEN_TELEFOON and app not in TELEFOON_APPS:
            continue
        binding = n.notification.visual.get_binding(KnownNotificationBindings.toast_generic)
        teksten = [t.text for t in binding.get_text_elements()] if binding else []
        teksten = [t for t in teksten if t and t.strip()]
        if not teksten:
            continue
        items.append({
            "id": n.id,
            "app": app,
            "telefoon": app in TELEFOON_APPS,
            "title": teksten[0],
            "body": " · ".join(teksten[1:]),
            "time": int(n.creation_time.timestamp() * 1000),
        })
    items.sort(key=lambda x: x["time"], reverse=True)
    return items[:MAX]


# ---------- Logboek: alleen tijd en app per melding, geen inhoud ----------
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meldingen-log.csv")
LOG_ELKE = 30          # seconden
gezien = set()         # (tijd, app) die al in het logboek staan, zodat een melding maar één keer telt (ook na herstarten)


async def voor_log():
    if listener.get_access_status() != UserNotificationListenerAccessStatus.ALLOWED:
        return []
    out = []
    for n in await listener.get_notifications_async(NotificationKinds.TOAST):
        try:
            win_app = n.app_info.display_info.display_name
        except Exception:
            win_app = "Onbekend"
        app = win_app
        if win_app in TELEFOON_APPS:
            # Bij Phone Link is de eerste regel de naam van de app op de telefoon (bijv. "WhatsApp"); de rest is inhoud en wordt niet bewaard
            binding = n.notification.visual.get_binding(KnownNotificationBindings.toast_generic)
            teksten = [t.text for t in binding.get_text_elements()] if binding else []
            app = (teksten[0].strip() if teksten and teksten[0].strip() else win_app)[:60]
        out.append((n.id, int(n.creation_time.timestamp() * 1000), win_app, app))
    return out


def log_lus():
    nieuw_bestand = not os.path.exists(LOG_FILE)
    if not nieuw_bestand:
        with open(LOG_FILE, encoding="utf-8", newline="") as f:
            for r in list(csv.DictReader(f))[-5000:]:
                gezien.add((int(r["time_ms"]), r["app"]))
    while True:
        try:
            with lock:
                items = asyncio.run(voor_log())
            nieuw = [x for x in items if (x[1], x[3]) not in gezien]
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
            print(f"Logboek meldingen: {e}", file=sys.stderr)
        time.sleep(LOG_ELKE)


def weg(nid):
    listener.remove_notification(nid)


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get("Origin")
        if origin in TOEGESTAAN:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
        self.pagina(200, "Google koppelen", "<p>Koppel allebei. Daarna haalt het dashboard zelf elk uur een nieuwe toegang op.</p>" + regels)

    def do_GET(self):
        pad, _, query = self.path.partition("?")
        params = dict(urllib.parse.parse_qsl(query))
        if pad == "/koppel":
            return self.koppel()
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
        if pad != "/meldingen":
            return self.antwoord(404, {"error": "niet gevonden"})
        # Andere sites mogen niets lezen
        if self.headers.get("Origin") not in TOEGESTAAN | {None}:
            return self.antwoord(403, {"error": "niet toegestaan"})
        with lock:
            items = asyncio.run(lees())
        if items is None:
            return self.antwoord(403, {"error": "Windows geeft geen toegang tot meldingen. Zet het aan bij Instellingen > Privacy en beveiliging > Meldingen."})
        self.antwoord(200, {"items": items})

    def do_POST(self):
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
            with lock:
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
    threading.Thread(target=log_lus, daemon=True).start()
    print(f"Meldingen: http://127.0.0.1:{PORT}/meldingen · Google koppelen: http://127.0.0.1:{PORT}/koppel (Ctrl+C om te stoppen)")
    server.serve_forever()


if __name__ == "__main__":
    main()
