"""Read WISHES.md (Noah's wish list in the Obsidian vault, next to the repos) for the Wishes tile on the dashboard.

Read-only, only on this PC (via /wishes on the helper). Pictures (![[...]]) are only flagged, never sent.
Returns: {"updated": unix, "sections": [{"title": "To do", "items": [{"text", "sub": [...], "image": bool}],
"ideas": [{"title", "lines": [...]}]}]}
"""

import os
import re

PATH = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "WISHES.md"))
IMG = re.compile(r"!\[\[[^\]]*\]\]")


def read():
    if not os.path.exists(PATH):
        return None
    with open(PATH, encoding="utf-8") as f:
        lines = f.read().splitlines()
    sections, section, idea, item = [], None, None, None
    for line in lines:
        if line.startswith("## "):
            section = {"title": line[3:].strip(), "items": [], "ideas": []}
            sections.append(section)
            idea = item = None
            continue
        if section is None:
            continue   # the explanation at the top
        if line.startswith("### "):
            idea = {"title": line[4:].strip(), "lines": []}
            section["ideas"].append(idea)
            item = None
            continue
        picture = bool(IMG.search(line))
        text = IMG.sub("", line).rstrip()
        if idea is not None:
            if text.strip():
                idea["lines"].append(text.strip().lstrip("- ").strip())
            continue
        if re.match(r"^- ", text):
            item = {"text": text[2:].strip(), "sub": [], "image": picture}
            section["items"].append(item)
        elif re.match(r"^\s+- ", text) and item is not None:
            item["sub"].append(text.strip()[2:].strip())
        elif picture and item is not None:
            item["image"] = True   # picture on the line below
    return {"updated": int(os.path.getmtime(PATH)), "sections": sections}
