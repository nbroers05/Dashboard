"""Fetches the Letterboxd RSS of nbroers05 and of friends.

- data/letterboxd.json: Noah's own logs (Last watched)
- data/friends.json: the newest logs of the friends from config.js (`friends`), with the name Noah wants to see

Runs in the GitHub Action (.github/workflows/letterboxd.yml). Posters via TMDB with the
API key from the environment variable TMDB_API_KEY (a repository secret, never in the code).
Without a key or when TMDB fails: the poster from the RSS itself.
The files contain no timestamp, so they only change when there really is something new.
"""

import os
import re
import xml.etree.ElementTree as ET

from common import config_items, get, is_placeholder, log, read_json, tmdb_poster, write_json

USER = "nbroers05"
KEEP = 20
FRIEND_KEEP = 10   # per friend
FRIENDS_TOTAL = 30
NS = {"letterboxd": "https://letterboxd.com", "tmdb": "https://themoviedb.org"}


def text(item, tag):
    el = item.find(tag, NS)
    return el.text.strip() if el is not None and el.text else None


def parse(user, key, previous):
    """All film logs from the RSS of one user."""
    root = ET.fromstring(get(f"https://letterboxd.com/{user}/rss/"))
    logs = []
    for item in root.iter("item"):
        title = text(item, "letterboxd:filmTitle")
        if not title:  # skip lists and other posts
            continue
        link = text(item, "link")
        movie_id, tv_id = text(item, "tmdb:movieId"), text(item, "tmdb:tvId")
        kind, tmdb_id = ("movie", movie_id) if movie_id else ("tv", tv_id)
        rating = text(item, "letterboxd:memberRating")
        rss_poster = re.search(r'<img src="([^"]+)"', text(item, "description") or "")
        slug = re.search(r"/film/([^/]+)/", link or "")

        # Reuse the poster from last time, so TMDB isn't needed again every hour
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
    # Newest first (by watch date; the RSS is ordered by publication date)
    logs.sort(key=lambda x: x["watched"] or "", reverse=True)
    return logs


def previous_logs(rel):
    data = read_json(rel) or {}
    return {x["link"]: x for x in data.get("logs", []) if x.get("link")}


def main():
    key = os.environ.get("TMDB_API_KEY", "").strip()

    own = parse(USER, key, previous_logs("data/letterboxd.json"))
    for x in own:
        x.pop("slug", None)  # not needed for Last watched; this keeps the file the same as before
    if write_json("data/letterboxd.json", {"user": USER, "logs": own[:KEEP]}):
        log(f"letterboxd.json: {len(own[:KEEP])} logs")

    # Friends: one failed feed (typo, private profile) lets the rest carry on
    previous = previous_logs("data/friends.json")
    friends, logs = [], []
    for f in config_items("friends"):
        user, name = f.get("user", ""), f.get("name") or f.get("user", "")
        if is_placeholder(user):
            log(f"Friend {name}: no username filled in yet, skipped")
            continue
        try:
            items = parse(user, key, previous)[:FRIEND_KEEP]
        except Exception as e:
            log(f"Friend {name} ({user}) failed: {e}")
            items = [x for x in previous.values() if x.get("user") == user]
        friends.append({"user": user, "name": name})
        logs += [{**x, "user": user, "name": name} for x in items]
    logs.sort(key=lambda x: (x["watched"] or "", x["link"] or ""), reverse=True)
    if write_json("data/friends.json", {"friends": friends, "logs": logs[:FRIENDS_TOTAL]}):
        log(f"friends.json: {len(logs[:FRIENDS_TOTAL])} logs from {len(friends)} friends")


if __name__ == "__main__":
    main()
