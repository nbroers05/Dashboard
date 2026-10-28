"""Haalt de Letterboxd-RSS van nbroers05 en van vrienden op.

- data/letterboxd.json: Noahs eigen logs (Laatst gekeken)
- data/friends.json: de nieuwste logs van de vrienden uit config.js (`vrienden`), met de naam zoals Noah die wil zien

Draait in de GitHub Action (.github/workflows/letterboxd.yml). Posters via TMDB met de
API-key uit de omgevingsvariabele TMDB_API_KEY (een repository secret, nooit in de code).
Zonder key of als TMDB faalt: de poster uit de RSS zelf.
De bestanden bevatten geen tijdstempel, zodat ze alleen veranderen als er echt iets nieuws is.
"""

import os
import re
import xml.etree.ElementTree as ET

from common import config_items, get, is_placeholder, log, read_json, tmdb_poster, write_json

USER = "nbroers05"
KEEP = 20
FRIEND_KEEP = 10   # per vriend
FRIENDS_TOTAL = 30
NS = {"letterboxd": "https://letterboxd.com", "tmdb": "https://themoviedb.org"}


def text(item, tag):
    el = item.find(tag, NS)
    return el.text.strip() if el is not None and el.text else None


def parse(user, key, previous):
    """Alle film-logs uit de RSS van één gebruiker."""
    root = ET.fromstring(get(f"https://letterboxd.com/{user}/rss/"))
    logs = []
    for item in root.iter("item"):
        title = text(item, "letterboxd:filmTitle")
        if not title:  # lijsten en andere berichten overslaan
            continue
        link = text(item, "link")
        movie_id, tv_id = text(item, "tmdb:movieId"), text(item, "tmdb:tvId")
        kind, tmdb_id = ("movie", movie_id) if movie_id else ("tv", tv_id)
        rating = text(item, "letterboxd:memberRating")
        rss_poster = re.search(r'<img src="([^"]+)"', text(item, "description") or "")
        slug = re.search(r"/film/([^/]+)/", link or "")

        # Poster van vorige keer hergebruiken, dan hoeft TMDB niet elk uur opnieuw
        old = previous.get(link) or {}
        poster = old.get("poster") if old.get("tmdbId") == tmdb_id and old.get("poster") else None
        poster = poster or tmdb_poster(key, kind, tmdb_id) or (rss_poster.group(1) if rss_poster else None)

        logs.append({
            "title": title,
            "year": int(text(item, "letterboxd:filmYear")) if text(item, "letterboxd:filmYear") else None,
            "rating": float(rating) if rating else None,
            "watched": text(item, "letterboxd:watchedDate"),
            "rewatch": text(item, "letterboxd:rewatch") == "Yes",
            "liked": text(item, "letterboxd:memberLike") == "Yes",
            "link": link,
            "slug": slug.group(1) if slug else None,
            "tmdbId": tmdb_id,
            "poster": poster,
        })
    # Nieuwste eerst (op kijkdatum; de RSS staat op publicatiedatum)
    logs.sort(key=lambda x: x["watched"] or "", reverse=True)
    return logs


def previous_logs(rel):
    data = read_json(rel) or {}
    return {x["link"]: x for x in data.get("logs", []) if x.get("link")}


def main():
    key = os.environ.get("TMDB_API_KEY", "").strip()

    own = parse(USER, key, previous_logs("data/letterboxd.json"))
    for x in own:
        x.pop("slug", None)  # niet nodig voor Laatst gekeken; zo blijft het bestand gelijk aan vroeger
    if write_json("data/letterboxd.json", {"user": USER, "logs": own[:KEEP]}):
        log(f"letterboxd.json: {len(own[:KEEP])} logs")

    # Vrienden: één mislukte feed (typfout, privéprofiel) laat de rest gewoon doorgaan
    previous = previous_logs("data/friends.json")
    friends, logs = [], []
    for f in config_items("vrienden"):
        user, name = f.get("user", ""), f.get("name") or f.get("user", "")
        if is_placeholder(user):
            log(f"Vriend {name}: nog geen gebruikersnaam ingevuld, overgeslagen")
            continue
        try:
            items = parse(user, key, previous)[:FRIEND_KEEP]
        except Exception as e:
            log(f"Vriend {name} ({user}) mislukt: {e}")
            items = [x for x in previous.values() if x.get("user") == user]
        friends.append({"user": user, "name": name})
        logs += [{**x, "user": user, "name": name} for x in items]
    logs.sort(key=lambda x: (x["watched"] or "", x["link"] or ""), reverse=True)
    if write_json("data/friends.json", {"friends": friends, "logs": logs[:FRIENDS_TOTAL]}):
        log(f"friends.json: {len(logs[:FRIENDS_TOTAL])} logs van {len(friends)} vrienden")


if __name__ == "__main__":
    main()
