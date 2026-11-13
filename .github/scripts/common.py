"""Shared helpers for the scripts of the dashboard Action (.github/workflows/letterboxd.yml).

- get(): fetch with a proper User-Agent and time-out
- config_items(): read lists from config.js (so everything Noah fills in is in one place)
- tmdb_poster(): poster via TMDB with the key from the repository secret TMDB_API_KEY
- write_json(): only write when the content really is different (the Action only commits on a change)
"""

import json
import os
import re
import sys
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
UA = {"User-Agent": "Mozilla/5.0 (dashboard of nbroers05; GitHub Action; github.com/nbroers05/Dashboard)"}


def get(url, headers=None, data=None, timeout=20):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})}, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def get_json(url, headers=None, data=None):
    return json.loads(get(url, headers, data))


def log(*args):
    print(*args, file=sys.stderr)


def _block(src, name):
    """The text between `name: [` and the matching `]` in config.js."""
    m = re.search(rf"\b{re.escape(name)}\s*:\s*\[", src)
    if not m:
        return ""
    depth, i = 1, m.end()
    while i < len(src) and depth:
        depth += {"[": 1, "]": -1}.get(src[i], 0)
        i += 1
    return src[m.end():i - 1]


def config_items(name):
    """Objects like { user: 'x', name: 'Y' } from a list in config.js, as dicts of strings.
    Bare strings ('AAPL') come back as {'value': 'AAPL'}. Comments (// ...) are skipped."""
    try:
        with open(os.path.join(ROOT, "config.js"), encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return []
    # Remove comments, but not the // in https://
    block = re.sub(r"(^|\s)//[^\n]*", r"\1", _block(src, name), flags=re.M)
    out = []
    for obj in re.findall(r"\{([^{}]*)\}", block):
        out.append({k: v for k, v in re.findall(r"(\w+)\s*:\s*'([^']*)'", obj)})
    if not out:
        out = [{"value": v} for v in re.findall(r"'([^']*)'", block)]
    return out


def is_placeholder(value):
    """Not filled in yet: empty or something like 'MARIJN_USERNAME' / 'PASTE_HERE' (old: 'PLAK_HIER')."""
    return not value or bool(re.fullmatch(r"[A-Z0-9_]+", value) and "_" in value) or "PLAK" in value or "PASTE" in value


def tmdb_poster(key, kind, tmdb_id):
    if not key or not tmdb_id:
        return None
    try:
        data = get_json(f"https://api.themoviedb.org/3/{kind}/{tmdb_id}?api_key={key}&language=nl-NL")
        path = data.get("poster_path")
        return f"https://image.tmdb.org/t/p/w342{path}" if path else None
    except Exception as e:  # TMDB briefly not reachable: then the poster from the RSS
        log(f"TMDB {kind}/{tmdb_id} failed: {e}")
        return None


def read_json(rel):
    try:
        with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_json(rel, data):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    try:
        with open(path, encoding="utf-8") as f:
            if f.read() == text:
                return False
    except OSError:
        pass
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return True
