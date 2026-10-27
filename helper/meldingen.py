"""Hulpprogramma: geeft de Windows-meldingen (ook die van je telefoon via Phone Link) door aan het dashboard.

Draait op je eigen pc en luistert alleen op 127.0.0.1 (niet bereikbaar vanaf andere apparaten).
Alleen het dashboard (github.io en de lokale testversie) mag de meldingen lezen.
Starten: dubbelklik op start.bat in deze map. Zie README, stap 9.
"""

import asyncio
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from winrt.windows.ui.notifications import KnownNotificationBindings, NotificationKinds
from winrt.windows.ui.notifications.management import UserNotificationListener, UserNotificationListenerAccessStatus

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

    def do_GET(self):
        if self.path.split("?")[0] != "/meldingen":
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
    print(f"Meldingen voor het dashboard op http://127.0.0.1:{PORT}/meldingen (Ctrl+C om te stoppen)")
    server.serve_forever()


if __name__ == "__main__":
    main()
