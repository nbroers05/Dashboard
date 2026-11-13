"""Spotify link for the login bundle ("Everything with one login").

The dashboard's normal Spotify sign-in (PKCE) gives a refresh token that is replaced when used: in a bundle that is
used on several computers that goes wrong. So here is a link with the Client Secret (Authorization Code), which gives
a lasting key. It only goes into the bundle encrypted (vault.js); the helper itself doesn't use it.

Once: paste the Client Secret at http://127.0.0.1:8765/link (then stored in spotify-client.json, gitignored),
and add http://127.0.0.1:8765/spotify-oauth as a Redirect URI in your Spotify app (README step 1).
"""

import base64
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

import google_token   # post(), read_tokens(), save_tokens(), lock: the same tokens.json

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENT_FILE = os.path.join(HERE, "spotify-client.json")
CLIENT_ID = "4da05ad75fe84a41859a6a18ef2eef70"   # the same app as the dashboard (config.js)
# Same scopes as spotify.js
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


def save_secret(value):
    value = (value or "").strip()
    if not (len(value) == 32 and all(c in "0123456789abcdef" for c in value)):
        raise TokenError("That doesn't look like a Client Secret (32 characters, 0-9 and a-f)")
    with open(CLIENT_FILE, "w", encoding="utf-8") as f:
        json.dump({"client_secret": value}, f)


def redirect_uri(port):
    return f"http://127.0.0.1:{port}/spotify-oauth"


def login_url(port):
    if not secret():
        raise TokenError("First paste the Client Secret on /link")
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
        raise TokenError("This sign-in attempt has expired. Try again via /link.")
    pending.discard(params["state"])
    auth = base64.b64encode(f"{CLIENT_ID}:{secret()}".encode()).decode()
    req = urllib.request.Request("https://accounts.spotify.com/api/token", method="POST",
                                 data=urllib.parse.urlencode({"grant_type": "authorization_code", "code": params.get("code", ""), "redirect_uri": redirect_uri(port)}).encode(),
                                 headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read())
    except urllib.error.HTTPError as e:
        raise TokenError(f"Spotify refuses ({e.code}): is the Redirect URI {redirect_uri(port)} in your app, and is the Client Secret right?")
    if not data.get("refresh_token"):
        raise TokenError("Spotify gave no lasting key")
    with google_token.lock:
        tokens = google_token.read_tokens()
        tokens["spotify"] = {"refresh_token": data["refresh_token"], "scope": data.get("scope", ""), "linked_at": int(time.time())}
        google_token.save_tokens(tokens)


def status():
    return {"secret": bool(secret()), "linked": bool(google_token.read_tokens().get("spotify"))}


def bundle():
    """What goes into the login bundle from Spotify (or None if it isn't linked yet)."""
    t = google_token.read_tokens().get("spotify")
    s = secret()
    if not t or not s:
        return None
    return {"client_id": CLIENT_ID, "client_secret": s, "refresh": t["refresh_token"], "scope": t.get("scope", "")}
