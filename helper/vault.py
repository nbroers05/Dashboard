"""Versleutelde inlogbundel (vault.json) voor "Alles met één inlog".

Het dashboard versleutelt de sleutels zelf in de browser (vault.js); dit programma krijgt alleen de versleutelde bundel,
controleert of hij er zo uitziet, zet hem in de repo (dashboard/vault.json) en pusht alleen dat bestand.
"""

import base64
import json
import os
import subprocess

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HIER)
BESTAND = os.path.join(REPO, "vault.json")
VELDEN = {"v", "kdf", "iter", "cipher", "salt", "iv", "data", "made"}


class VaultError(Exception):
    pass


def status():
    try:
        with open(BESTAND, encoding="utf-8") as f:
            return {"exists": True, "made": json.load(f).get("made")}
    except (FileNotFoundError, ValueError):
        return {"exists": False}


def controleer(box):
    if not isinstance(box, dict) or set(box) - VELDEN:
        raise VaultError("onverwachte velden")
    if box.get("v") != 1 or box.get("kdf") != "PBKDF2-SHA256" or box.get("cipher") != "AES-GCM":
        raise VaultError("onbekend formaat")
    if not isinstance(box.get("iter"), int) or box["iter"] < 300000:
        raise VaultError("te weinig rondes")
    try:
        if len(base64.b64decode(box["salt"])) != 16 or len(base64.b64decode(box["iv"])) != 12:
            raise VaultError("salt of iv klopt niet")
        base64.b64decode(box["data"])
    except (KeyError, ValueError, TypeError):
        raise VaultError("geen geldige base64")


def git(*args):
    r = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, timeout=120,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode != 0:
        raise VaultError((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else f"git {args[0]} mislukt")
    return r.stdout


def bewaar(box):
    controleer(box)
    tmp = BESTAND + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(box, f, indent=1)
    os.replace(tmp, BESTAND)
    try:
        git("add", "vault.json")
        if not git("diff", "--cached", "--name-only").strip():
            return {"ok": True, "pushed": True}
        git("commit", "-m", "Inlogbundel bijgewerkt", "--", "vault.json")
        git("pull", "--rebase", "--autostash")
        git("push")
        return {"ok": True, "pushed": True}
    except (VaultError, subprocess.SubprocessError, OSError) as e:
        return {"ok": True, "pushed": False, "error": str(e)}
