"""Wat er op deze pc afspeelt (YouTube in de browser, de Spotify-app, VLC, ...), via de mediabediening van Windows.

Dezelfde lijst als achter de mediaknoppen op je toetsenbord. Het dashboard toont ze als kaarten in de mediastapel
en kan ze bedienen (afspelen/pauzeren, vorige, volgende).
"""

import hashlib

from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager
from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status
from winrt.windows.storage.streams import Buffer, DataReader, InputStreamOptions

try:
    from winrt.windows.applicationmodel import AppInfo
except ImportError:  # oudere winrt: dan alleen de bekende namen hieronder
    AppInfo = None

# Bekende apps, als Windows zelf geen naam geeft
NAMEN = {
    "308046B0AF4A39CB": "Firefox",
    "Chrome": "Chrome",
    "MSEdge": "Edge",
    "Opera": "Opera",
    "Brave": "Brave",
    "vlc": "VLC",
}

thumbs = {}  # sleutel -> (content_type, bytes)


def app_naam(aumid):
    for k, v in NAMEN.items():
        if aumid == k or aumid.lower().startswith(k.lower()):
            return v
    if "spotify" in aumid.lower():
        return "Spotify"
    if AppInfo is not None:
        try:
            return AppInfo.get_from_app_user_model_id(aumid).display_info.display_name
        except Exception:
            pass
    return aumid.split("!")[-1].split("_")[0].removesuffix(".exe") or "Media"


async def _sessions():
    mgr = await Manager.request_async()
    out = []
    seen = {}
    for s in mgr.get_sessions():
        aumid = s.source_app_user_model_id or "onbekend"
        n = seen.get(aumid, 0)
        seen[aumid] = n + 1
        out.append((f"{aumid}#{n}", s))
    return out


async def _thumb(props):
    ref = props.thumbnail
    if ref is None:
        return None
    stream = await ref.open_read_async()
    size = int(stream.size)
    if not size or size > 5_000_000:
        return None
    buf = Buffer(size)
    await stream.read_async(buf, size, InputStreamOptions.READ_AHEAD)
    reader = DataReader.from_buffer(buf)
    data = bytearray(buf.length)
    reader.read_bytes(data)
    return (stream.content_type or "image/jpeg", bytes(data))


async def lijst():
    items = []
    for sid, s in await _sessions():
        try:
            props = await s.try_get_media_properties_async()
        except Exception:
            continue
        if not props or not (props.title or props.artist):
            continue
        info = s.get_playback_info()
        tl = s.get_timeline_properties()
        pos = dur = updated = None
        if tl is not None:
            dur = tl.end_time.total_seconds() - tl.start_time.total_seconds()
            pos = tl.position.total_seconds()
            try:
                updated = int(tl.last_updated_time.timestamp() * 1000)
            except Exception:
                updated = None
        # Hoes: alleen opnieuw lezen als het nummer verandert
        key = hashlib.sha1(f"{sid}|{props.title}|{props.artist}".encode()).hexdigest()[:16]
        if key not in thumbs:
            try:
                t = await _thumb(props)
            except Exception:
                t = None
            if len(thumbs) > 40:
                thumbs.clear()
            thumbs[key] = t
        c = info.controls
        items.append({
            "id": sid,
            "app": app_naam(sid.split("#")[0]),
            "title": props.title or "",
            "artist": props.artist or props.album_artist or "",
            "album": props.album_title or "",
            "playing": info.playback_status == Status.PLAYING,
            "position": pos if dur and dur > 0 else None,
            "duration": dur if dur and dur > 0 else None,
            "updated": updated,
            "thumb": f"/media/thumb?k={key}" if thumbs.get(key) else None,
            "canNext": bool(c.is_next_enabled),
            "canPrev": bool(c.is_previous_enabled),
            "canPlayPause": bool(c.is_play_pause_toggle_enabled or c.is_play_enabled or c.is_pause_enabled),
        })
    # Wat speelt eerst
    items.sort(key=lambda x: not x["playing"])
    return items


def thumb(key):
    return thumbs.get(key)


async def bedien(sid, actie):
    for s_id, s in await _sessions():
        if s_id != sid:
            continue
        if actie == "playpause":
            return await s.try_toggle_play_pause_async()
        if actie == "next":
            return await s.try_skip_next_async()
        if actie == "prev":
            return await s.try_skip_previous_async()
        raise ValueError("onbekende actie")
    raise KeyError("sessie niet gevonden")
