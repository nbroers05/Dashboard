"""Cinemas in Rotterdam: which films are showing, and when is the next screening.
Writes data/cinema.json, once a day (the Action looks at "day" in the file).

Sources (public, robots.txt allows it, gently: a handful of requests per day):
- LantarenVenster: the public RSS /upcoming_events (Theater for WordPress) and, only for films on the watchlist,
  the times from the schema.org data on the film page
- KINO Rotterdam: NO. Their robots.txt forbids /filmladder (the programme) for all bots.
- Pathé (De Kuip, Schouwburgplein): NO. The JSON of pathe.nl refuses requests that identify as a GitHub Action
  (HTTP 403). We don't get around that by pretending to be a browser.

Times are only looked up for films on the watchlist snapshot (sterrenvoorspeller/popup/watchlist.js);
for the rest only "until" (last screening day from the RSS) is filled in. Matching with your current watchlist
happens in the browser.
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
    "KINO Rotterdam": "robots.txt of kinorotterdam.nl forbids fetching /filmladder",
    "Pathé": "pathe.nl refuses requests from a GitHub Action (403)",
}


# Dutch month names: the RSS descriptions read like "Tot 12 december 2026"
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
        log(f"Watchlist snapshot not read: {e}")
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
                log(f"LantarenVenster {title} failed: {e}")
            time.sleep(1)
        films[key] = {"title": title, "key": key, "poster": None, "shows": [show]}
    return films


def main():
    now = dt.datetime.now(AMS)
    previous = read_json("data/cinema.json") or {}
    if previous.get("day") == now.date().isoformat() and not os.environ.get("FORCE"):
        log("Cinemas were already fetched today")
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
            log(f"{name} failed: {e}")
    if not ok:
        raise SystemExit("Not a single cinema worked")
    out = sorted(films.values(), key=lambda f: f["title"].lower())
    write_json("data/cinema.json", {"day": now.date().isoformat(), "sources": ok, "skipped": SKIPPED, "films": out})
    log(f"cinema.json: {len(out)} films, {sum(1 for f in out if f['key'] in wanted)} on the watchlist")


if __name__ == "__main__":
    main()
