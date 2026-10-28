"""Feeds voor de Feeds-pagina: nieuws (RSS), Reddit en YouTube. Schrijft data/feeds.json, elk half uur.

Waarom via de Action: NOS-RSS en YouTube-RSS sturen geen CORS-kop mee (de browser mag ze niet lezen), en Reddit
blokkeert ophalen zonder account. Reddit gaat daarom via de officiële API met een eigen Reddit-app
(repository secrets REDDIT_CLIENT_ID en REDDIT_CLIENT_SECRET, "script"-app op reddit.com/prefs/apps).
Zonder die secrets slaat dit Reddit over en zegt de pagina wat er ontbreekt.

Alleen openbare koppen, titels en links (geen hele artikelen). Wat er staat komt uit config.js:
nieuwsFeeds, subreddits, youtubeKanalen. Geen tijdstempel van het ophalen zelf in het bestand.
"""

import base64
import email.utils
import os
import re
import urllib.parse
import xml.etree.ElementTree as ET

from common import config_items, get, get_json, is_placeholder, log, read_json, write_json

NEWS_KEEP = 15
REDDIT_KEEP = 10
YT_KEEP = 5
ATOM = {"a": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/", "yt": "http://www.youtube.com/xml/schemas/2015"}


def iso(rfc822):
    try:
        return email.utils.parsedate_to_datetime(rfc822).isoformat()
    except (TypeError, ValueError):
        return None


def news():
    out = []
    for f in config_items("nieuwsFeeds"):
        name, url = f.get("name", ""), f.get("url", "")
        if is_placeholder(url) or not url.startswith("http"):
            continue
        try:
            root = ET.fromstring(get(url))
            items = []
            for it in list(root.iter("item"))[:NEWS_KEEP]:
                enc = it.find("enclosure")
                img = enc.get("url") if enc is not None and (enc.get("type") or "").startswith("image") else None
                items.append({
                    "title": (it.findtext("title") or "").strip(),
                    "link": (it.findtext("link") or "").strip(),
                    "time": iso(it.findtext("pubDate")),
                    "img": img,
                })
            out.append({"name": name, "items": items})
        except Exception as e:
            log(f"Nieuws {name} mislukt: {e}")
            out.append({"name": name, "error": "Feed niet bereikbaar", "items": []})
    return out


def reddit(previous):
    subs = [s.get("sub") or s.get("value") for s in config_items("subreddits")]
    subs = [s for s in subs if s and not is_placeholder(s)]
    cid, secret = os.environ.get("REDDIT_CLIENT_ID", "").strip(), os.environ.get("REDDIT_CLIENT_SECRET", "").strip()
    if not subs:
        return {"error": "Nog geen subreddits ingevuld in config.js (subreddits).", "subs": []}
    if not cid or not secret:
        return {"error": "Reddit staat nog uit: voeg de repository secrets REDDIT_CLIENT_ID en REDDIT_CLIENT_SECRET toe (zie CHANGELOG.md).", "subs": []}
    ua = os.environ.get("REDDIT_USER_AGENT", "").strip() or "web:nbroers05-dashboard:1.0 (persoonlijk dashboard)"
    try:
        auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
        token = get_json("https://www.reddit.com/api/v1/access_token", {"Authorization": f"Basic {auth}", "User-Agent": ua},
                         urllib.parse.urlencode({"grant_type": "client_credentials"}).encode())["access_token"]
    except Exception as e:
        log(f"Reddit-token mislukt: {e}")
        return {**(previous or {}), "error": "Reddit gaf geen toegang (klopt de app-ID en het geheim?)."}
    out = []
    for sub in subs:
        try:
            data = get_json(f"https://oauth.reddit.com/r/{urllib.parse.quote(sub)}/hot?limit={REDDIT_KEEP + 5}&raw_json=1",
                            {"Authorization": f"Bearer {token}", "User-Agent": ua})
            posts = []
            for c in data["data"]["children"]:
                p = c["data"]
                if p.get("stickied") or p.get("over_18"):
                    continue
                thumb = p.get("thumbnail") if str(p.get("thumbnail", "")).startswith("http") else None
                posts.append({
                    "title": p["title"], "score": p["score"], "comments": p["num_comments"],
                    "link": f"https://www.reddit.com{p['permalink']}", "thumb": thumb, "time": int(p["created_utc"]),
                })
            out.append({"name": sub, "posts": posts[:REDDIT_KEEP]})
        except Exception as e:
            log(f"Reddit r/{sub} mislukt: {e}")
            out.append({"name": sub, "error": "Niet bereikbaar", "posts": []})
    return {"subs": out}


def youtube():
    videos, channels = [], []
    for c in config_items("youtubeKanalen"):
        cid, name = c.get("id", ""), c.get("name", "")
        if is_placeholder(cid) or not re.fullmatch(r"UC[\w-]{22}", cid):
            continue
        try:
            root = ET.fromstring(get(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"))
            channel = root.findtext("a:title", namespaces=ATOM) or name
            channels.append(channel)
            for e in root.findall("a:entry", ATOM)[:YT_KEEP]:
                vid = e.findtext("yt:videoId", namespaces=ATOM)
                link = e.find("a:link", ATOM)
                videos.append({
                    "title": e.findtext("a:title", namespaces=ATOM),
                    "channel": channel,
                    "link": link.get("href") if link is not None else f"https://www.youtube.com/watch?v={vid}",
                    "thumb": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                    "time": e.findtext("a:published", namespaces=ATOM),
                    "short": "/shorts/" in (link.get("href") if link is not None else ""),
                })
        except Exception as e:
            log(f"YouTube {name} mislukt: {e}")
    videos.sort(key=lambda v: v["time"] or "", reverse=True)
    return {"channels": channels, "videos": videos}


def main():
    previous = read_json("data/feeds.json") or {}
    data = {"news": news(), "reddit": reddit(previous.get("reddit")), "youtube": youtube()}
    if write_json("data/feeds.json", data):
        log("feeds.json bijgewerkt")


if __name__ == "__main__":
    main()
