"""Bioscopen in Rotterdam: welke films draaien er, en wanneer is de eerstvolgende voorstelling.
Schrijft data/cinema.json, één keer per dag (de Action kijkt naar "day" in het bestand).

Bronnen (openbaar, robots.txt staat het toe, rustig: een handvol verzoeken per dag):
- LantarenVenster: de openbare RSS /upcoming_events (Theater for WordPress) en, alleen voor films op de watchlist,
  de tijden uit de schema.org-gegevens op de filmpagina
- KINO Rotterdam: NIET. Hun robots.txt verbiedt /filmladder (het programma) voor alle bots.
- Pathé (De Kuip, Schouwburgplein): NIET. De JSON van pathe.nl weigert verzoeken die zich als GitHub Action
  melden (HTTP 403). Dat omzeilen we niet door ons als browser voor te doen.

Tijden worden alleen opgezocht voor films op de watchlist-snapshot (sterrenvoorspeller/popup/watchlist.js);
voor de rest staat alleen "tot" (laatste speeldag uit de RSS) erin. Het matchen met je actuele watchlist gebeurt in de browser.
"""

import datetime as dt
import os
import json
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

from common import ROOT, get, get_json, log, read_json, write_json

AMS = ZoneInfo("Europe/Amsterdam")
LV_FEED = "https://www.lantarenvenster.nl/upcoming_events"
SKIPPED = {
    "KINO Rotterdam": "robots.txt van kinorotterdam.nl verbiedt het ophalen van /filmladder",
    "Pathé": "pathe.nl weigert verzoeken van een GitHub Action (403)",
}


MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "", s)


def watchlist_keys():
    try:
        with open(f"{ROOT}/sterrenvoorspeller/popup/watchlist.js", encoding="utf-8") as f:
            src = f.read()
        items = json.loads(src[src.index("["):src.rindex("]") + 1])
        return {norm(x["film"]) for x in items if x.get("film")}
    except Exception as e:
        log(f"Watchlist-snapshot niet gelezen: {e}")
        return set()


def lantarenvenster(now, wanted):
    root = ET.fromstring(get(LV_FEED))
    films = {}
    for item in root.iter("item"):
        title, link = (item.findtext("title") or "").strip(), (item.findtext("link") or "").strip()
        key = norm(title)
        if not key or key in films:
            continue
        until = re.match(r"\s*Tot (\d{1,2}) (\w+) (\d{4})", item.findtext("description") or "")
        show = {"cinema": "LantarenVenster", "url": link, "day": None, "next": None, "until": None}
        if until and until.group(2).lower() in MONTHS:
            show["until"] = f"{until.group(3)}-{MONTHS.index(until.group(2).lower()) + 1:02d}-{int(until.group(1)):02d}"
        if key in wanted and link:
            try:
                page = get(link).decode("utf-8", "ignore")
                starts = sorted(set(re.findall(r'"startDate":"(\d{4}-\d\d-\d\dT\d\d:\d\d)', page)))
                upcoming = [s for s in starts if dt.datetime.fromisoformat(s).replace(tzinfo=AMS) > now]
                if upcoming:
                    show["next"], show["day"] = upcoming[0], upcoming[0][:10]
            except Exception as e:
                log(f"LantarenVenster {title} mislukt: {e}")
            time.sleep(1)
        films[key] = {"title": title, "key": key, "poster": None, "shows": [show]}
    return films


def main():
    now = dt.datetime.now(AMS)
    previous = read_json("data/cinema.json") or {}
    if previous.get("day") == now.date().isoformat() and not os.environ.get("FORCE"):
        log("Bioscopen zijn vandaag al opgehaald")
        return
    wanted = watchlist_keys()
    films, ok = {}, []
    for name, fn in (("LantarenVenster", lantarenvenster),):
        try:
            for key, film in fn(now, wanted).items():
                if key in films:
                    films[key]["shows"] += film["shows"]
                    films[key]["poster"] = films[key]["poster"] or film["poster"]
                else:
                    films[key] = film
            ok.append(name)
        except Exception as e:
            log(f"{name} mislukt: {e}")
    if not ok:
        raise SystemExit("Geen enkele bioscoop gelukt")
    out = sorted(films.values(), key=lambda f: f["title"].lower())
    write_json("data/cinema.json", {"day": now.date().isoformat(), "sources": ok, "skipped": SKIPPED, "films": out})
    log(f"cinema.json: {len(out)} films, {sum(1 for f in out if f['key'] in wanted)} op de watchlist")


if __name__ == "__main__":
    main()
