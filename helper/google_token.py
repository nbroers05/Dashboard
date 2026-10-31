"""Google-tokens voor het dashboard, zodat je niet elk uur op "Vernieuwen" hoeft te klikken.

Eenmalig koppelen op http://127.0.0.1:8765/koppel. Google geeft dan een blijvende sleutel (refresh token),
die alleen op deze pc staat (tokens.json, staat niet op GitHub). Daarmee haalt dit programma telkens een nieuw
toegangstoken van 1 uur op als het dashboard erom vraagt.

Twee aparte koppelingen, omdat Google Health geen token accepteert waar ook agenda/Gmail in zitten:
  main   = agenda + Gmail (lezen)
  health = stappen, slaap, hartslag (lezen)

Nodig: google-client.json in deze map (een "Desktop app"-client uit Google Cloud, zie README stap 9).
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

HIER = os.path.dirname(os.path.abspath(__file__))
CLIENT_FILE = os.path.join(HIER, "google-client.json")
TOKENS_FILE = os.path.join(HIER, "tokens.json")

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
NAMEN = {"main": "Agenda en Gmail", "health": "Gezondheid"}

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
        raise TokenError("google-client.json ontbreekt in de map helper (README stap 9)")
    c = data.get("installed") or data.get("web") or data
    if not c.get("client_id") or not c.get("client_secret"):
        raise TokenError("google-client.json klopt niet: client_id of client_secret ontbreekt")
    return c


def lees_tokens():
    try:
        with open(TOKENS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def bewaar_tokens(data):
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
    """Adres van het Google-inlogscherm voor één koppeling (met PKCE)."""
    if which not in SCOPES:
        raise TokenError("onbekende koppeling")
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
        "access_type": "offline",     # geeft de blijvende sleutel
        "prompt": "consent",          # ook bij opnieuw koppelen een nieuwe sleutel
        "include_granted_scopes": "false",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })


def callback(params, port):
    """Google stuurt je hierheen terug na het inloggen. Geeft de naam van de koppeling terug."""
    if params.get("error"):
        raise TokenError(f"Google: {params['error']}")
    p = pending.pop(params.get("state", ""), None)
    if not p:
        raise TokenError("Deze inlogpoging is verlopen. Probeer het opnieuw via /koppel.")
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
        raise TokenError("Google gaf geen blijvende sleutel. Haal de toegang weg op myaccount.google.com/permissions en koppel opnieuw.")
    granted = set((data.get("scope") or "").split())
    missing = [s for s in SCOPES[p["which"]] if s not in granted]
    with lock:
        tokens = lees_tokens()
        tokens[p["which"]] = {"refresh_token": data["refresh_token"], "scope": data.get("scope", ""), "linked_at": int(time.time())}
        bewaar_tokens(tokens)
        cache[p["which"]] = {"access_token": data["access_token"], "expires_at": time.time() + int(data.get("expires_in", 3600)), "scope": data.get("scope", "")}
    return NAMEN[p["which"]], missing


def access_token(which):
    """Geldig toegangstoken (uit het geheugen, of vernieuwd met de blijvende sleutel)."""
    if which not in SCOPES:
        raise TokenError("onbekende koppeling")
    with lock:
        hit = cache.get(which)
        if hit and hit["expires_at"] - time.time() > 300:
            return hit
        tokens = lees_tokens()
        t = tokens.get(which)
        if not t:
            raise TokenError(f"{NAMEN[which]} is nog niet gekoppeld: open http://127.0.0.1:8765/koppel")
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
                # Sleutel verlopen of ingetrokken: weggooien, opnieuw koppelen nodig
                tokens.pop(which, None)
                bewaar_tokens(tokens)
                raise TokenError(f"De koppeling voor {NAMEN[which]} is verlopen: koppel opnieuw via http://127.0.0.1:8765/koppel")
            raise
        hit = {"access_token": data["access_token"], "expires_at": time.time() + int(data.get("expires_in", 3600)), "scope": data.get("scope", t.get("scope", ""))}
        cache[which] = hit
        return hit


def bundel():
    """Wat er van Google in de inlogbundel gaat (vault.js): client + beide blijvende sleutels, of None."""
    tokens = lees_tokens()
    try:
        c = client()
    except TokenError:
        return None
    if not any(tokens.get(w) for w in SCOPES):
        return None
    return {"client_id": c["client_id"], "client_secret": c["client_secret"],
            **{w: tokens[w]["refresh_token"] for w in SCOPES if tokens.get(w)}}


def status():
    tokens = lees_tokens()
    try:
        client()
        heeft_client = True
    except TokenError:
        heeft_client = False
    return {"client": heeft_client, **{w: bool(tokens.get(w)) for w in SCOPES}}
