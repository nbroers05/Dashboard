"""Helper: passes the Windows notifications (including your phone's, via Phone Link) on to the dashboard.

Runs on your own PC and only listens on 127.0.0.1 (not reachable from other devices).
Only the dashboard (github.io and the local test version) may read the notifications.
Also gives the dashboard fresh Google tokens (google_token.py), so "Refresh" is no longer needed.
Start: double-click start.bat in this folder. See README, step 8.

Also keeps a log (notifications-log.csv, only on this PC): per new notification the time and the app, WITHOUT content.
The notification center is read every 10 s in the background (Windows itself takes ~3 s for that); /notifications answers
from that memory. The daily task of the private repo dashboard-data counts the notifications per app per hour from it.

Endpoints: /notifications, /dismiss/<id>, /link (Google and Spotify linking page). The old Dutch names /meldingen,
/weg/<id> and /koppel still work as aliases for one version (dashboard 1.7.x); remove them after that.
/oauth and /spotify-oauth keep their names: they are registered redirect URIs.
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
import wishes

# Media (what's playing): if that part doesn't load, the rest keeps working
try:
    import media
except Exception as e:  # e.g. package not installed yet
    media = None
    MEDIA_ERROR = str(e)

PORT = 8765
# Only notifications from your phone (Phone Link). Set to False to show all Windows notifications.
PHONE_ONLY = True
PHONE_APPS = {"Phone Link", "Telefoonkoppeling", "Your Phone", "Je telefoon"}
MAX = 30
ALLOWED = {"https://nbroers05.github.io", "http://127.0.0.1:8000"}

listener = UserNotificationListener.current
lock = threading.Lock()          # media (what's playing, controls)
notif_lock = threading.Lock()    # notification center (separate, so a slow read doesn't hold up the media buttons)


async def read_center():
    """Read the notification center once, for the dashboard and the log. Windows itself already takes ~3 s for this
    (measured 31 Oct 2026, 30 notifications), so it only happens in refresh_loop() and not per dashboard request."""
    if listener.get_access_status() != UserNotificationListenerAccessStatus.ALLOWED:
        status = await listener.request_access_async()
        if status != UserNotificationListenerAccessStatus.ALLOWED:
            return None, []
    items, log = [], []
    for n in await listener.get_notifications_async(NotificationKinds.TOAST):
        try:
            app = n.app_info.display_info.display_name
        except Exception:
            app = "Unknown"
        t = int(n.creation_time.timestamp() * 1000)
        try:
            binding = n.notification.visual.get_binding(KnownNotificationBindings.toast_generic)
            texts = [x.text for x in binding.get_text_elements()] if binding else []
        except Exception:
            texts = []
        # Log: with Phone Link the first line is the name of the app on the phone (e.g. "WhatsApp"); the rest is
        # content and is not kept
        log.append((n.id, t, app, (texts[0].strip() if app in PHONE_APPS and texts and texts[0].strip() else app)[:60]))
        if PHONE_ONLY and app not in PHONE_APPS:
            continue
        texts = [x for x in texts if x and x.strip()]
        if not texts:
            continue
        items.append({"id": n.id, "app": app, "phone": app in PHONE_APPS, "title": texts[0], "body": " · ".join(texts[1:]), "time": t})
    items.sort(key=lambda x: x["time"], reverse=True)
    return items[:MAX], log


# ---------- Log: only time and app per notification, no content ----------
HERE = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(HERE, "notifications-log.csv")
OLD_LOG_FILE = os.path.join(HERE, "meldingen-log.csv")   # name before dashboard 1.7.1
REFRESH = 10          # seconds between two reads of the notification center (that itself already takes ~3 s)
cache = {"items": None, "no_access": False, "ready": threading.Event()}
seen = set()           # (time, app) already in the log, so a notification only counts once (also after a restart)


def refresh_loop():
    """Keep the notifications up to date in the background (for /notifications, which then answers at once) and update the log."""
    # Old log name: rename it once, so the history continues in one file
    if os.path.exists(OLD_LOG_FILE) and not os.path.exists(LOG_FILE):
        try:
            os.replace(OLD_LOG_FILE, LOG_FILE)
        except OSError as e:
            print(f"Renaming the log: {e}", file=sys.stderr)
    new_file = not os.path.exists(LOG_FILE)
    if not new_file:
        with open(LOG_FILE, encoding="utf-8", newline="") as f:
            for r in list(csv.DictReader(f))[-5000:]:
                seen.add((int(r["time_ms"]), r["app"]))
    while True:
        try:
            with notif_lock:
                items, log = asyncio.run(read_center())
            cache["items"], cache["no_access"] = items or [], items is None
            cache["ready"].set()
            new = [x for x in log if (x[1], x[3]) not in seen]
            if new:
                with open(LOG_FILE, "a", encoding="utf-8", newline="") as f:
                    w = csv.writer(f)
                    if new_file:
                        w.writerow(["time_ms", "windows_app", "app"])
                        new_file = False
                    for nid, t, win_app, app in new:
                        w.writerow([t, win_app, app])
                        seen.add((t, app))
            if len(seen) > 20000:
                keep = sorted(seen)[-10000:]   # only remember the newest (old ones are no longer in the notification center)
                seen.clear()
                seen.update(keep)
        except Exception as e:
            print(f"Reading notifications: {e}", file=sys.stderr)
        time.sleep(REFRESH)


def dismiss(nid):
    listener.remove_notification(nid)
    if cache["items"]:
        cache["items"] = [x for x in cache["items"] if x["id"] != nid]


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            # Chrome asks for this when an https site talks to your own PC
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def reply(self, code, data):
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

    def page(self, code, title, content):
        body = f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><style>body{{font-family:system-ui,sans-serif;background:#121214;color:#eee;max-width:560px;margin:60px auto;padding:0 20px;line-height:1.5}}
a.k{{display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;border-radius:999px;background:#1ed760;color:#06210f;font-weight:700;text-decoration:none}}
.ok{{color:#5bd38a}}.no{{color:#ff8a5c}}code{{background:#222;padding:2px 6px;border-radius:6px}}</style>
<h1>{title}</h1>{content}""".encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, url, code=302):
        self.send_response(code)
        self.send_header("Location", url)
        self.end_headers()

    def link_page(self):
        st = google_token.status()
        if not st["client"]:
            return self.page(200, "Link Google", "<p class='no'>First put <code>google-client.json</code> in the <code>helper</code> folder (README step 8). Then reload this page.</p>")
        rows = "".join(
            f"<p>{google_token.NAMES[w]}: {'<span class=ok>linked ✓</span>' if st[w] else '<span class=no>not linked yet</span>'}<br>"
            f"<a class='k' href='/link/{w}'>{'Link again' if st[w] else 'Link'}</a></p>"
            for w in google_token.SCOPES
        )
        sp = spotify_token.status()
        uri = spotify_token.redirect_uri(PORT)
        spotify = ("<h2>Spotify (for the login bundle)</h2>"
                   "<p>Only needed for <b>Everything with one login</b> (README). First add <code>" + uri + "</code> as a Redirect URI in your Spotify app.</p>"
                   "<form method='post' action='/spotify-secret'><p>Client Secret: " + ("<span class=ok>saved ✓</span>" if sp["secret"] else "<span class=no>not yet</span>") + "<br>"
                   "<input name='secret' type='password' autocomplete='off' placeholder='paste the Client Secret here' style='width:300px;padding:8px;border-radius:8px;border:1px solid #444;background:#222;color:#eee'> "
                   "<button style='padding:8px 14px;border-radius:999px;border:0'>Save</button></p></form>"
                   + (f"<p>Spotify: {'<span class=ok>linked ✓</span>' if sp['linked'] else '<span class=no>not linked yet</span>'}<br>"
                      f"<a class='k' href='/link/spotify'>{'Link again' if sp['linked'] else 'Link'}</a></p>" if sp["secret"] else ""))
        self.page(200, "Link Google", "<p>Link both. After that the dashboard gets new access by itself every hour.</p>" + rows + spotify)

    def failed(self, e, back=True):
        return self.page(400, "Linking failed", f"<p class='no'>{html.escape(str(e))}</p>" + ("<p><a class='k' href='/link'>Back</a></p>" if back else ""))

    def do_GET(self):
        path, _, query = self.path.partition("?")
        params = dict(urllib.parse.parse_qsl(query))
        # Old Dutch paths (before dashboard 1.7.1): same pages for one version
        if path == "/koppel" or path.startswith("/koppel/"):
            path = "/link" + path[len("/koppel"):]
        if path == "/meldingen":
            path = "/notifications"
        if path == "/link":
            return self.link_page()
        if path == "/vault" and self.headers.get("Origin") in ALLOWED:
            return self.reply(200, vault.status())
        if path == "/link/spotify":
            try:
                url = spotify_token.login_url(PORT)
            except spotify_token.TokenError as e:
                return self.failed(e)
            return self.redirect(url)
        if path == "/spotify-oauth":
            try:
                spotify_token.callback(params, PORT)
            except spotify_token.TokenError as e:
                return self.failed(e)
            return self.page(200, "Spotify linked ✓", "<p>Now make the bundle again: dashboard → gear → Log in.</p><p><a class='k' href='/link'>Back to linking</a></p>")
        if path == "/vault/keys" and self.headers.get("Origin") in ALLOWED:
            # Only for Settings › Log in: the lasting keys, which go into the bundle there, encrypted
            return self.reply(200, {"google": google_token.bundle(), "spotify": spotify_token.bundle()})
        if path.startswith("/link/"):
            try:
                url = google_token.login_url(path.rsplit("/", 1)[1], PORT)
            except google_token.TokenError as e:
                return self.failed(e, back=False)
            return self.redirect(url)
        if path == "/oauth":
            try:
                name, missing = google_token.callback(params, PORT)
            except google_token.TokenError as e:
                return self.failed(e)
            warning = f"<p class='no'>Not all boxes were ticked; missing: {html.escape(', '.join(m.rsplit('/', 1)[1] for m in missing))}</p>" if missing else ""
            return self.page(200, f"{name} linked ✓", warning + "<p>You can close this tab.</p><p><a class='k' href='/link'>Back to linking</a></p>")
        if path == "/token":
            # Only the dashboard may get a token
            if self.headers.get("Origin") not in ALLOWED:
                return self.reply(403, {"error": "not allowed"})
            try:
                t = google_token.access_token(params.get("which", ""))
            except google_token.TokenError as e:
                return self.reply(409, {"error": str(e)})
            except OSError as e:
                return self.reply(502, {"error": f"Google not reachable: {e}"})
            return self.reply(200, {"access_token": t["access_token"], "expires_in": int(t["expires_at"] - time.time()), "scope": t["scope"]})
        if path == "/media":
            if self.headers.get("Origin") not in ALLOWED:
                return self.reply(403, {"error": "not allowed"})
            if media is None:
                return self.reply(503, {"error": f"media not available: {MEDIA_ERROR}"})
            with lock:
                items = asyncio.run(media.list_sessions())
            return self.reply(200, {"items": items})
        if path == "/media/thumb":
            t = media.thumb(params.get("k", "")) if media else None
            if not t:
                return self.reply(404, {"error": "no cover"})
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", t[0])
            self.send_header("Cache-Control", "max-age=3600")
            self.send_header("Content-Length", str(len(t[1])))
            self.end_headers()
            self.wfile.write(t[1])
            return
        if path in ("/wishes", "/wensen"):
            # Wish list (WISHES.md next to the repos), read-only and only for the dashboard
            if self.headers.get("Origin") not in ALLOWED:
                return self.reply(403, {"error": "not allowed"})
            data = wishes.read()
            return self.reply(200, data) if data else self.reply(404, {"error": "WISHES.md not found"})
        if path != "/notifications":
            return self.reply(404, {"error": "not found"})
        # Other sites may not read anything
        if self.headers.get("Origin") not in ALLOWED | {None}:
            return self.reply(403, {"error": "not allowed"})
        cache["ready"].wait(8)   # only right after starting does this need to wait
        items = None if cache["no_access"] else (cache["items"] or [])
        if items is None:
            return self.reply(403, {"error": "Windows gives no access to notifications. Turn it on in Settings > Privacy & security > Notifications."})
        self.reply(200, {"items": items})

    def do_POST(self):
        # /spotify-secret: form on /link (only from the linking page itself)
        if self.path == "/spotify-secret":
            if self.headers.get("Origin") != f"http://127.0.0.1:{PORT}":
                return self.reply(403, {"error": "not allowed"})
            length = min(int(self.headers.get("Content-Length") or 0), 2000)
            fields = dict(urllib.parse.parse_qsl(self.rfile.read(length).decode("utf-8", "replace")))
            try:
                spotify_token.save_secret(fields.get("secret"))
            except spotify_token.TokenError as e:
                return self.page(400, "Not saved", f"<p class='no'>{html.escape(str(e))}</p><p><a class='k' href='/link'>Back</a></p>")
            return self.redirect("/link", 303)
        # /vault: save and push the encrypted login bundle from Settings › Log in (vault.py)
        if self.path == "/vault" and self.headers.get("Origin") in ALLOWED:
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if not 0 < length < 200000:
                    raise vault.VaultError("bundle too large or empty")
                return self.reply(200, vault.save(json.loads(self.rfile.read(length))))
            except (vault.VaultError, ValueError) as e:
                return self.reply(400, {"error": str(e)})
        # /media/playpause|next|prev?id=...: control media
        if self.path.startswith("/media/") and self.headers.get("Origin") in ALLOWED and media is not None:
            path, _, query = self.path.partition("?")
            try:
                with lock:
                    ok = asyncio.run(media.control(dict(urllib.parse.parse_qsl(query)).get("id", ""), path.rsplit("/", 1)[1]))
                return self.reply(200, {"ok": bool(ok)})
            except (KeyError, ValueError) as e:
                return self.reply(404, {"error": str(e)})
        # /dismiss/123 (old: /weg/123): remove a notification (also from the Windows notification center)
        if not (self.path.startswith("/dismiss/") or self.path.startswith("/weg/")) or self.headers.get("Origin") not in ALLOWED:
            return self.reply(403, {"error": "not allowed"})
        try:
            with notif_lock:
                dismiss(int(self.path.split("/")[2]))
            self.reply(200, {"ok": True})
        except (ValueError, IndexError):
            self.reply(400, {"error": "invalid id"})

    def log_message(self, *args):
        pass  # don't print every request


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"Port {PORT} is already in use: is the helper already running?", file=sys.stderr)
        return
    threading.Thread(target=refresh_loop, daemon=True).start()
    print(f"Notifications: http://127.0.0.1:{PORT}/notifications · Link Google: http://127.0.0.1:{PORT}/link (Ctrl+C to stop)")
    server.serve_forever()


if __name__ == "__main__":
    main()
