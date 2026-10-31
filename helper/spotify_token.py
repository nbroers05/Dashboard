"""Spotify-koppeling voor de inlogbundel ("Alles met één inlog").

De gewone Spotify-inlog van het dashboard (PKCE) geeft een refresh token dat bij gebruik vervangen wordt: in een bundel
die op meerdere computers wordt gebruikt gaat dat mis. Daarom hier een koppeling met de Client Secret (Authorization
Code), die een blijvende sleutel geeft. Die gaat alleen versleuteld in de bundel (vault.js); het hulpprogramma zelf
gebruikt hem niet.

Eenmalig: Client Secret plakken op http://127.0.0.1:8765/koppel (staat daarna in spotify-client.json, gitignored),
en http://127.0.0.1:8765/spotify-oauth als Redirect URI in je Spotify-app zetten (README stap 13).
"""

import base64
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

import google_token   # post(), lees_tokens(), bewaar_tokens(), lock: dezelfde tokens.json

HIER = os.path.dirname(os.path.abspath(__file__))
CLIENT_FILE = os.path.join(HIER, "spotify-client.json")
CLIENT_ID = "4da05ad75fe84a41859a6a18ef2eef70"   # dezelfde app als het dashboard (config.js)
# Zelfde scopes als spotify.js
SCOPES = "user-read-currently-playing user-read-playback-state user-modify-playback-state user-library-read user-library-modify user-top-read"

pending = set()


class TokenError(Exception):
    pass


def secret():
    try:
        with open(CLIENT_FILE, encoding="utf-8") as f:
            return json.load(f).get("client_secret") or None
    except (FileNotFoundError, ValueError):
        return None


def bewaar_secret(waarde):
    waarde = (waarde or "").strip()
    if not (len(waarde) == 32 and all(c in "0123456789abcdef" for c in waarde)):
        raise TokenError("Dat lijkt geen Client Secret (32 tekens, 0-9 en a-f)")
    with open(CLIENT_FILE, "w", encoding="utf-8") as f:
        json.dump({"client_secret": waarde}, f)


def redirect_uri(port):
    return f"http://127.0.0.1:{port}/spotify-oauth"


def login_url(port):
    if not secret():
        raise TokenError("Plak eerst de Client Secret op /koppel")
    state = secrets.token_urlsafe(16)
    pending.add(state)
    return "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": CLIENT_ID, "scope": SCOPES,
        "redirect_uri": redirect_uri(port), "state": state, "show_dialog": "true",
    })


def callback(params, port):
    if params.get("error"):
        raise TokenError(f"Spotify: {params['error']}")
    if params.get("state") not in pending:
        raise TokenError("Deze inlogpoging is verlopen. Probeer het opnieuw via /koppel.")
    pending.discard(params["state"])
    auth = base64.b64encode(f"{CLIENT_ID}:{secret()}".encode()).decode()
    req = urllib.request.Request("https://accounts.spotify.com/api/token", method="POST",
                                 data=urllib.parse.urlencode({"grant_type": "authorization_code", "code": params.get("code", ""), "redirect_uri": redirect_uri(port)}).encode(),
                                 headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read())
    except urllib.error.HTTPError as e:
        raise TokenError(f"Spotify weigert ({e.code}): staat de Redirect URI {redirect_uri(port)} in je app, en klopt de Client Secret?")
    if not data.get("refresh_token"):
        raise TokenError("Spotify gaf geen blijvende sleutel")
    with google_token.lock:
        tokens = google_token.lees_tokens()
        tokens["spotify"] = {"refresh_token": data["refresh_token"], "scope": data.get("scope", ""), "linked_at": int(time.time())}
        google_token.bewaar_tokens(tokens)


def status():
    return {"secret": bool(secret()), "linked": bool(google_token.lees_tokens().get("spotify"))}


def bundel():
    """Wat er van Spotify in de inlogbundel gaat (of None als het nog niet gekoppeld is)."""
    t = google_token.lees_tokens().get("spotify")
    s = secret()
    if not t or not s:
        return None
    return {"client_id": CLIENT_ID, "client_secret": s, "refresh": t["refresh_token"], "scope": t.get("scope", "")}
