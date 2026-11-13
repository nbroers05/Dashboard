"""Encrypted login bundle (vault.json) for "Everything with one login".

The dashboard encrypts the keys itself in the browser (vault.js); this program only gets the encrypted bundle,
checks that it looks like one, puts it in the repo (dashboard/vault.json) and pushes only that file.
"""

import base64
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FILE = os.path.join(REPO, "vault.json")
FIELDS = {"v", "kdf", "iter", "cipher", "salt", "iv", "data", "made"}


class VaultError(Exception):
    pass


def status():
    try:
        with open(FILE, encoding="utf-8") as f:
            return {"exists": True, "made": json.load(f).get("made")}
    except (FileNotFoundError, ValueError):
        return {"exists": False}


def check(box):
    if not isinstance(box, dict) or set(box) - FIELDS:
        raise VaultError("unexpected fields")
    if box.get("v") != 1 or box.get("kdf") != "PBKDF2-SHA256" or box.get("cipher") != "AES-GCM":
        raise VaultError("unknown format")
    if not isinstance(box.get("iter"), int) or box["iter"] < 300000:
        raise VaultError("too few rounds")
    try:
        if len(base64.b64decode(box["salt"])) != 16 or len(base64.b64decode(box["iv"])) != 12:
            raise VaultError("salt or iv is wrong")
        base64.b64decode(box["data"])
    except (KeyError, ValueError, TypeError):
        raise VaultError("not valid base64")


def git(*args):
    r = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, timeout=120,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode != 0:
        raise VaultError((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else f"git {args[0]} failed")
    return r.stdout


def save(box):
    check(box)
    tmp = FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(box, f, indent=1)
    os.replace(tmp, FILE)
    try:
        git("add", "vault.json")
        if not git("diff", "--cached", "--name-only").strip():
            return {"ok": True, "pushed": True}
        git("commit", "-m", "Login bundle updated", "--", "vault.json")
        git("pull", "--rebase", "--autostash")
        git("push")
        return {"ok": True, "pushed": True}
    except (VaultError, subprocess.SubprocessError, OSError) as e:
        return {"ok": True, "pushed": False, "error": str(e)}
