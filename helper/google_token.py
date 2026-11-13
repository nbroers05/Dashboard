"""Google tokens for the dashboard, so you don't have to click "Refresh" every hour.

Link once at http://127.0.0.1:8765/link. Google then gives a lasting key (refresh token), which is only stored on
this PC (tokens.json, not on GitHub). With it this program gets a new 1-hour access token whenever the dashboard
asks for one.

Two separate links, because Google Health doesn't accept a token that also holds calendar/Gmail:
  main   = calendar + Gmail (read)
  health = steps, sleep, heart rate (read)

Needed: google-client.json in this folder (a "Desktop app" client from Google Cloud, see README step 8).
"""

import base64
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENT_FILE = os.path.join(HERE, "google-client.json")
TOKENS_FILE = os.path.join(HERE, "tokens.json")

SCOPES = {
    "main": [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
    ],
    "health": [
        "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
        "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
        "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    ],
}
NAMES = {"main": "Calendar and Gmail", "health": "Health"}

lock = threading.Lock()
cache = {}      # which -> {"access_token", "expires_at", "scope"}
pending = {}    # state -> {"which", "verifier"}


class TokenError(Exception):
    pass


def client():
    try:
        with open(CLIENT_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise TokenError("google-client.json is missing in the helper folder (README step 8)")
    c = data.get("installed") or data.get("web") or data
    if not c.get("client_id") or not c.get("client_secret"):
        raise TokenError("google-client.json is wrong: client_id or client_secret is missing")
    return c


def read_tokens():
    try:
        with open(TOKENS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def save_tokens(data):
    tmp = TOKENS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, TOKENS_FILE)


def post(url, fields):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except ValueError:
            body = {}
        raise TokenError(body.get("error_description") or body.get("error") or f"HTTP {e.code}")


def redirect_uri(port):
    return f"http://127.0.0.1:{port}/oauth"


def login_url(which, port):
    """Address of the Google sign-in screen for one link (with PKCE)."""
    if which not in SCOPES:
        raise TokenError("unknown link")
    c = client()
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    pending[state] = {"which": which, "verifier": verifier}
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": c["client_id"],
        "redirect_uri": redirect_uri(port),
        "response_type": "code",
        "scope": " ".join(SCOPES[which]),
        "access_type": "offline",     # gives the lasting key
        "prompt": "consent",          # a new key also when linking again
        "include_granted_scopes": "false",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })


def callback(params, port):
    """Google sends you back here after signing in. Returns the name of the link."""
    if params.get("error"):
        raise TokenError(f"Google: {params['error']}")
    p = pending.pop(params.get("state", ""), None)
    if not p:
        raise TokenError("This sign-in attempt has expired. Try again via /link.")
    c = client()
    data = post("https://oauth2.googleapis.com/token", {
        "code": params.get("code", ""),
        "client_id": c["client_id"],
        "client_secret": c["client_secret"],
        "redirect_uri": redirect_uri(port),
        "grant_type": "authorization_code",
        "code_verifier": p["verifier"],
    })
    if not data.get("refresh_token"):
        raise TokenError("Google gave no lasting key. Remove the access at myaccount.google.com/permissions and link again.")
    granted = set((data.get("scope") or "").split())
    missing = [s for s in SCOPES[p["which"]] if s not in granted]
    with lock:
        tokens = read_tokens()
        tokens[p["which"]] = {"refresh_token": data["refresh_token"], "scope": data.get("scope", ""), "linked_at": int(time.time())}
        save_tokens(tokens)
        cache[p["which"]] = {"access_token": data["access_token"], "expires_at": time.time() + int(data.get("expires_in", 3600)), "scope": data.get("scope", "")}
    return NAMES[p["which"]], missing


def access_token(which):
    """A valid access token (from memory, or renewed with the lasting key)."""
    if which not in SCOPES:
        raise TokenError("unknown link")
    with lock:
        hit = cache.get(which)
        if hit and hit["expires_at"] - time.time() > 300:
            return hit
        tokens = read_tokens()
        t = tokens.get(which)
        if not t:
            raise TokenError(f"{NAMES[which]} is not linked yet: open http://127.0.0.1:8765/link")
        c = client()
        try:
            data = post("https://oauth2.googleapis.com/token", {
                "client_id": c["client_id"],
                "client_secret": c["client_secret"],
                "refresh_token": t["refresh_token"],
                "grant_type": "refresh_token",
            })
        except TokenError as e:
            if "invalid_grant" in str(e) or "expired" in str(e).lower() or "revoked" in str(e).lower():
                # Key expired or revoked: throw it away, linking again is needed
                tokens.pop(which, None)
                save_tokens(tokens)
                raise TokenError(f"The link for {NAMES[which]} has expired: link again via http://127.0.0.1:8765/link")
            raise
        hit = {"access_token": data["access_token"], "expires_at": time.time() + int(data.get("expires_in", 3600)), "scope": data.get("scope", t.get("scope", ""))}
        cache[which] = hit
        return hit


def bundle():
    """What goes into the login bundle from Google (vault.js): client + both lasting keys, or None."""
    tokens = read_tokens()
    try:
        c = client()
    except TokenError:
        return None
    if not any(tokens.get(w) for w in SCOPES):
        return None
    return {"client_id": c["client_id"], "client_secret": c["client_secret"],
            **{w: tokens[w]["refresh_token"] for w in SCOPES if tokens.get(w)}}


def status():
    tokens = read_tokens()
    try:
        client()
        has_client = True
    except TokenError:
        has_client = False
    return {"client": has_client, **{w: bool(tokens.get(w)) for w in SCOPES}}
