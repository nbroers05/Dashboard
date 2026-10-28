"""Feeds voor de Feeds-pagina: nieuws, filmnieuws en YouTube (allemaal RSS). Schrijft data/feeds.json, elk half uur.

Waarom via de Action: deze RSS-feeds sturen geen CORS-kop mee, dus de browser mag ze niet zelf lezen.
(Reddit zat hier eerst in, maar Reddit laat sinds 2025 geen nieuwe API-apps meer toe behalve voor moderatie,
en blokkeert ophalen zonder account. Daarom is dat vak vervangen door filmnieuws.)

Alleen openbare koppen, een korte intro, plaatjes en links (geen hele artikelen). Wat er staat komt uit config.js:
nieuwsFeeds, filmFeeds, youtubeKanalen. Geen tijdstempel van het ophalen zelf in het bestand.
"""

import email.utils
import html
import re
import xml.etree.ElementTree as ET

from common import config_items, get, is_placeholder, log, write_json

NEWS_KEEP = 15
FILM_KEEP = 12
YT_KEEP = 5
INTRO_MAX = 220
ATOM = {"a": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/", "yt": "http://www.youtube.com/xml/schemas/2015"}


def iso(rfc822):
    try:
        return email.utils.parsedate_to_datetime(rfc822).isoformat()
    except (TypeError, ValueError):
        return None


def intro(desc):
    """Eerste alinea uit de RSS-beschrijving, zonder HTML en ingekort."""
    m = re.search(r"<p>(.*?)</p>", desc or "", re.S)
    text = html.unescape(re.sub(r"<[^>]+>", "", m.group(1) if m else "")).strip()
    return text if len(text) <= INTRO_MAX else text[:INTRO_MAX].rsplit(" ", 1)[0] + "…"


def rss_feeds(key, keep, with_intro=False):
    out = []
    for f in config_items(key):
        name, url = f.get("name", ""), f.get("url", "")
        if is_placeholder(url) or not url.startswith("http"):
            continue
        try:
            root = ET.fromstring(get(url))
            items = []
            for it in list(root.iter("item"))[:keep]:
                desc = it.findtext("description") or ""
                enc = it.find("enclosure")
                img = enc.get("url") if enc is not None and (enc.get("type") or "").startswith("image") else None
                if not img:
                    m = re.search(r'<img[^>]+src="([^"]+)"', desc)
                    img = html.unescape(m.group(1)) if m else None
                item = {
                    "title": html.unescape((it.findtext("title") or "").strip()),
                    "link": (it.findtext("link") or "").strip(),
                    "time": iso(it.findtext("pubDate")),
                    "img": img,
                }
                if with_intro:
                    item["intro"] = intro(desc)
                    item["category"] = (it.findtext("category") or "").strip() or None
                items.append(item)
            out.append({"name": name, "items": items})
        except Exception as e:
            log(f"{key} {name} mislukt: {e}")
            out.append({"name": name, "error": "Feed niet bereikbaar", "items": []})
    return out


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
    data = {"news": rss_feeds("nieuwsFeeds", NEWS_KEEP), "film": rss_feeds("filmFeeds", FILM_KEEP, True), "youtube": youtube()}
    if write_json("data/feeds.json", data):
        log("feeds.json bijgewerkt")


if __name__ == "__main__":
    main()
