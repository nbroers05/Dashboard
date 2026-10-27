"""Haalt de Letterboxd-RSS van nbroers05 op en schrijft data/letterboxd.json.

Draait in de GitHub Action (.github/workflows/letterboxd.yml). Posters via TMDB met de
API-key uit de omgevingsvariabele TMDB_API_KEY (een repository secret, nooit in de code).
Zonder key of als TMDB faalt: de poster uit de RSS zelf.
Het bestand bevat geen tijdstempel, zodat het alleen verandert als er echt iets nieuws is.
"""

import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

USER = "nbroers05"
RSS = f"https://letterboxd.com/{USER}/rss/"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "data", "letterboxd.json")
KEEP = 20
NS = {"letterboxd": "https://letterboxd.com", "tmdb": "https://themoviedb.org"}
UA = {"User-Agent": "Mozilla/5.0 (dashboard van nbroers05; GitHub Action)"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as res:
        return res.read()


def text(item, tag):
    el = item.find(tag, NS)
    return el.text.strip() if el is not None and el.text else None


def load_previous():
    try:
        with open(OUT, encoding="utf-8") as f:
            return {x["link"]: x for x in json.load(f).get("logs", [])}
    except (OSError, ValueError, KeyError):
        return {}


def tmdb_poster(key, kind, tmdb_id):
    if not key or not tmdb_id:
        return None
    try:
        data = json.loads(get(f"https://api.themoviedb.org/3/{kind}/{tmdb_id}?api_key={key}&language=nl-NL"))
        path = data.get("poster_path")
        return f"https://image.tmdb.org/t/p/w342{path}" if path else None
    except Exception as e:  # TMDB even niet bereikbaar: dan de poster uit de RSS
        print(f"TMDB {kind}/{tmdb_id} mislukt: {e}", file=sys.stderr)
        return None


def main():
    key = os.environ.get("TMDB_API_KEY", "").strip()
    previous = load_previous()
    root = ET.fromstring(get(RSS))
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
            "tmdbId": tmdb_id,
            "poster": poster,
        })

    # Nieuwste eerst (op kijkdatum; de RSS staat op publicatiedatum)
    logs.sort(key=lambda x: x["watched"] or "", reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"user": USER, "logs": logs[:KEEP]}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(logs[:KEEP])} logs geschreven")


if __name__ == "__main__":
    main()
