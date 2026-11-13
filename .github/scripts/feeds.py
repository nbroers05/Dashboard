"""Feeds for the Feeds page: news, film news and YouTube (all RSS). Writes data/feeds.json, every half hour.

Why via the Action: these RSS feeds send no CORS header, so the browser may not read them itself.
(Reddit was here first, but since 2025 Reddit allows no new API apps except for moderation,
and blocks fetching without an account. So that box was replaced by film news.)

Only public headlines, a short intro, images and links (no whole articles). What's in it comes from config.js:
newsFeeds, filmFeeds, youtubeChannels. No timestamp of the fetch itself in the file.
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
    """First paragraph of the RSS description, without HTML and shortened."""
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
            log(f"{key} {name} failed: {e}")
            out.append({"name": name, "error": "Feed not reachable", "items": []})
    return out


def youtube():
    videos, channels = [], []
    for c in config_items("youtubeChannels"):
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
            log(f"YouTube {name} failed: {e}")
    videos.sort(key=lambda v: v["time"] or "", reverse=True)
    return {"channels": channels, "videos": videos}


def main():
    data = {"news": rss_feeds("newsFeeds", NEWS_KEEP), "film": rss_feeds("filmFeeds", FILM_KEEP, True), "youtube": youtube()}
    if write_json("data/feeds.json", data):
        log("feeds.json updated")


if __name__ == "__main__":
    main()
