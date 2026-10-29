"""WENSEN.md (Noahs wensenlijst in de Obsidian-map, naast de repo's) lezen voor het vak Wensen op het dashboard.

Alleen lezen, alleen op deze pc (via /wensen van het hulpprogramma). Plaatjes (![[...]]) worden alleen gemeld, niet meegestuurd.
Formaat terug: {"updated": unix, "sections": [{"title": "Te doen", "items": [{"text", "sub": [...], "image": bool}],
"ideas": [{"title", "lines": [...]}]}]}
"""

import os
import re

PAD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "WENSEN.md"))
IMG = re.compile(r"!\[\[[^\]]*\]\]")


def lees():
    if not os.path.exists(PAD):
        return None
    with open(PAD, encoding="utf-8") as f:
        regels = f.read().splitlines()
    secties, sectie, idee, item = [], None, None, None
    for r in regels:
        if r.startswith("## "):
            sectie = {"title": r[3:].strip(), "items": [], "ideas": []}
            secties.append(sectie)
            idee = item = None
            continue
        if sectie is None:
            continue   # de uitleg bovenaan
        if r.startswith("### "):
            idee = {"title": r[4:].strip(), "lines": []}
            sectie["ideas"].append(idee)
            item = None
            continue
        plaatje = bool(IMG.search(r))
        tekst = IMG.sub("", r).rstrip()
        if idee is not None:
            if tekst.strip():
                idee["lines"].append(tekst.strip().lstrip("- ").strip())
            continue
        if re.match(r"^- ", tekst):
            item = {"text": tekst[2:].strip(), "sub": [], "image": plaatje}
            sectie["items"].append(item)
        elif re.match(r"^\s+- ", tekst) and item is not None:
            item["sub"].append(tekst.strip()[2:].strip())
        elif plaatje and item is not None:
            item["image"] = True   # plaatje op de regel eronder
    return {"updated": int(os.path.getmtime(PAD)), "sections": secties}
