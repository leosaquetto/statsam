# statsfm_rapido.py
import requests
import json
from datetime import datetime, timedelta, timezone
import time

USERS = {
    "leo": "000997.3647cff9cc2b42359d6ca7f79a0f2c91.0428",
    "gab": "000859.740385afd8284174a94c84e9bcc9bdea.1440",
    "savio": "12151123201",
    "benny": "benante.m",
    "peter": "12182998998"
}

# fuso horário de brasília (utc-3)
BR_TIMEZONE = timezone(timedelta(hours=-3))

RECENT_PAGE_SIZE = 200
RECENT_MAX_PAGES = 10
RUNTIME_RETENTION_DAYS = 90


def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(
                url,
                timeout=10,
                headers={"User-Agent": "Mozilla/5.0"}
            )
            if r.ok:
                return r.json()
            else:
                print(f"⚠️ tentativa {i+1}/{retries} falhou: {r.status_code}")
        except Exception as e:
            print(f"⚠️ tentativa {i+1}/{retries} erro: {e}")

        if i < retries - 1:
            time.sleep(2)

    return None


def parse_played_at(value):
    if value is None:
        return None

    try:
        if isinstance(value, (int, float)):
            if value > 10_000_000_000:
                return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
            return datetime.fromtimestamp(value, tz=timezone.utc)

        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))

    except Exception as e:
        print(f"⚠️ erro ao converter timestamp {value}: {e}")

    return None


def to_br(dt):
    if not dt:
        return None
    return dt.astimezone(BR_TIMEZONE)


def is_today_br(dt, now_br):
    if not dt:
        return False
    dt_br = to_br(dt)
    return (
        dt_br.year == now_br.year and
        dt_br.month == now_br.month and
        dt_br.day == now_br.day
    )


def fetch_recent_page(user_id, limit=200, offset=0):
    data = fetch(
        f"https://api.stats.fm/api/v1/users/{user_id}/streams/recent?limit={limit}&offset={offset}"
    )
    if data and data.get("items"):
        return data["items"]
    return []


def fetch_recent_items_for_today(user_id, now_br, page_size=RECENT_PAGE_SIZE, max_pages=RECENT_MAX_PAGES):
    all_items = []
    found_older_than_today = False

    for page in range(max_pages):
        offset = page * page_size
        items = fetch_recent_page(user_id, limit=page_size, offset=offset)

        if not items:
            break

        all_items.extend(items)

        page_has_older_item = False
        for item in items:
            played_at_raw = item.get("endTime") or item.get("playedAt")
            played_dt = parse_played_at(played_at_raw)

            if played_dt and not is_today_br(played_dt, now_br):
                page_has_older_item = True
                found_older_than_today = True
                break

        if len(items) < page_size:
            break

        if page_has_older_item:
            break

    if found_older_than_today:
        print("    ↳ paginação encerrou ao encontrar item fora de hoje")
    else:
        print("    ↳ paginação encerrou por fim de resultados ou limite de páginas")

    return all_items





def pick_non_empty(*values):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and value.strip() == "":
            continue
        return value
    return None


def merge_stable_dedup_array(new_values, old_values):
    merged = []
    seen = set()
    for source in (new_values or [], old_values or []):
        for value in source:
            key = str(value)
            if not value or key in seen:
                continue
            seen.add(key)
            merged.append(value)
    return merged


def merge_track_meta(new_track, old_track):
    new_track = new_track or {}
    old_track = old_track or {}
    merged = dict(old_track)

    fields = [
        "id", "name", "albumId", "albumName", "albumArtist",
        "albumImage", "spotifyId", "appleMusicId"
    ]
    for field in fields:
        merged[field] = pick_non_empty(new_track.get(field), old_track.get(field))

    new_artists = new_track.get("artists")
    old_artists = old_track.get("artists")
    merged_artists = []
    seen = set()
    for source in (new_artists or [], old_artists or []):
        for artist in source:
            if not isinstance(artist, dict):
                continue
            artist_id = artist.get("id")
            artist_name = artist.get("name")
            if not artist_id and not artist_name:
                continue
            key = str(artist_id) if artist_id else f"name::{str(artist_name).strip().lower()}"
            if key in seen:
                continue
            seen.add(key)
            merged_artists.append({"id": artist_id, "name": artist_name})
    merged["artists"] = merged_artists if merged_artists else (old_artists or [])

    merged["artistIds"] = merge_stable_dedup_array(new_track.get("artistIds"), old_track.get("artistIds"))
    merged["lastSeenAt"] = pick_non_empty(new_track.get("lastSeenAt"), old_track.get("lastSeenAt"))
    return merged


def merge_album_meta(new_album, old_album):
    new_album = new_album or {}
    old_album = old_album or {}
    merged = dict(old_album)

    for field in ["id", "name", "artistId", "artistName", "image"]:
        merged[field] = pick_non_empty(new_album.get(field), old_album.get(field))

    merged["lastSeenAt"] = pick_non_empty(new_album.get("lastSeenAt"), old_album.get("lastSeenAt"))

    return merged


def merge_artist_meta(new_artist, old_artist):
    new_artist = new_artist or {}
    old_artist = old_artist or {}
    merged = dict(old_artist)

    for field in ["id", "name", "image"]:
        merged[field] = pick_non_empty(new_artist.get(field), old_artist.get(field))

    merged["lastSeenAt"] = pick_non_empty(new_artist.get("lastSeenAt"), old_artist.get("lastSeenAt"))

    return merged


def load_runtime(path="statsfm_runtime.json"):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        print(f"⚠️ falha ao ler runtime anterior: {e}")
        return {}


def merge_runtime(new_runtime, old_runtime):
    merged = dict(old_runtime or {})
    new_runtime = new_runtime or {}

    merged["lastUpdate"] = pick_non_empty(new_runtime.get("lastUpdate"), (old_runtime or {}).get("lastUpdate"))
    merged["lastUpdateBR"] = pick_non_empty(new_runtime.get("lastUpdateBR"), (old_runtime or {}).get("lastUpdateBR"))

    merged_tracks = dict((old_runtime or {}).get("tracks", {}))
    for track_id, new_track in (new_runtime.get("tracks") or {}).items():
        merged_tracks[track_id] = merge_track_meta(new_track, merged_tracks.get(track_id))
    merged["tracks"] = merged_tracks

    merged_albums = dict((old_runtime or {}).get("albums", {}))
    for album_id, new_album in (new_runtime.get("albums") or {}).items():
        merged_albums[album_id] = merge_album_meta(new_album, merged_albums.get(album_id))
    merged["albums"] = merged_albums

    merged_artists = dict((old_runtime or {}).get("artists", {}))
    for artist_id, new_artist in (new_runtime.get("artists") or {}).items():
        merged_artists[artist_id] = merge_artist_meta(new_artist, merged_artists.get(artist_id))
    merged["artists"] = merged_artists

    cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=RUNTIME_RETENTION_DAYS)).isoformat()
    for key in ["tracks", "albums", "artists"]:
        pruned = {}
        for item_id, item_data in (merged.get(key) or {}).items():
            if not isinstance(item_data, dict):
                continue
            last_seen = item_data.get("lastSeenAt")
            if isinstance(last_seen, str) and last_seen and last_seen < cutoff_iso:
                continue
            pruned[item_id] = item_data
        merged[key] = pruned

    return merged

def build_track_base(track):
    album_obj = (track.get("albums") or [{}])[0] or {}
    album_artists = album_obj.get("artists") or []
    album_artist_obj = (album_obj.get("artist") or {})
    album_artist_fallback = album_artists[0] if album_artists else {}
    album_artist_id = pick_non_empty(
        album_artist_obj.get("id"),
        album_artist_fallback.get("id")
    )
    album_artist_name = pick_non_empty(
        album_artist_obj.get("name"),
        album_artist_fallback.get("name")
    )
    artists = []
    artist_ids = []
    for artist in track.get("artists", []) or []:
        artist_name = artist.get("name")
        artist_id = artist.get("id")
        if artist_name:
            artists.append({"id": artist_id, "name": artist_name})
        if artist_id:
            artist_ids.append(artist_id)

    return {
        "id": track.get("id"),
        "name": track.get("name"),
        "artists": artists,
        "artistIds": artist_ids,
        "albumId": album_obj.get("id"),
        "albumName": album_obj.get("name"),
        "albumArtistId": album_artist_id,
        "albumArtistObj": {
            "id": album_artist_id,
            "name": album_artist_name
        } if album_artist_id or album_artist_name else None,
        "albumArtist": album_artist_name,
        "albumImage": album_obj.get("image"),
        "spotifyId": track.get("spotifyId"),
        "appleMusicId": pick_non_empty(
            track.get("appleMusicId"),
            ((track.get("externalIds") or {}).get("appleMusic") or [None])[0]
        ),
        "image": album_obj.get("image")
    }

def build_recent_preview(recent_items, limit=10):
    preview = []
    for i in recent_items[:limit]:
        track = i.get("track", {})
        track_base = build_track_base(track)
        preview.append({
            "track": track.get("name"),
            "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
            "playedAt": i.get("endTime") or i.get("playedAt"),
            "id": track_base.get("id"),
            "albumId": track_base.get("albumId"),
            "albumName": track_base.get("albumName"),
            "albumArtistId": track_base.get("albumArtistId"),
            "albumArtist": track_base.get("albumArtist"),
            "spotifyId": track_base.get("spotifyId"),
            "appleMusicId": track_base.get("appleMusicId"),
            "image": track_base.get("image")
        })
    return preview


def build_now_playing(recent_items, now_utc):
    if not recent_items:
        return None

    item = recent_items[0]
    track = item.get("track", {})
    played_at_raw = item.get("endTime") or item.get("playedAt")
    played_dt = parse_played_at(played_at_raw)

    is_now = False
    if played_dt:
        diff_ms = (now_utc - played_dt.astimezone(timezone.utc)).total_seconds() * 1000
        is_now = diff_ms < 300000

    track_base = build_track_base(track)
    return {
        "track": track.get("name"),
        "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
        "id": track_base.get("id"),
        "albumId": track_base.get("albumId"),
        "albumName": track_base.get("albumName"),
        "albumArtist": track_base.get("albumArtist"),
        "spotifyId": track_base.get("spotifyId"),
        "appleMusicId": track_base.get("appleMusicId"),
        "image": track_base.get("image"),
        "isNow": is_now,
        "timestamp": played_at_raw
    }


def count_today_items(recent_items, now_br):
    count = 0
    for i in recent_items:
        played_at_raw = i.get("endTime") or i.get("playedAt")
        played_dt = parse_played_at(played_at_raw)
        if is_today_br(played_dt, now_br):
            count += 1
    return count


def fetch_today_count_via_stats(user_id, now_br):
    start_of_today_br = datetime(now_br.year, now_br.month, now_br.day, tzinfo=BR_TIMEZONE)
    after_ms = int(start_of_today_br.astimezone(timezone.utc).timestamp() * 1000)

    data = fetch(
        f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={after_ms}"
    )
    if not data:
        return None

    count = data.get("items", {}).get("count")
    if count is None:
        count = data.get("count")

    if isinstance(count, int):
        return count

    return None


def main():
    print(f"🔄 iniciando coleta rápida em {datetime.now().isoformat()}")

    now_utc = datetime.now(timezone.utc)
    now_br = datetime.now(BR_TIMEZONE)

    print(f"📅 horário br: {now_br.isoformat()}")

    master = {
        "lastUpdate": now_utc.isoformat(),
        "lastUpdateBR": now_br.isoformat(),
        "nowPlaying": {},
        "recent": {},
        "daily": {}
    }
    recent_track_bases_by_user = {}

    for name, user_id in USERS.items():
        print(f"  coletando {name}...")

        recent_items = fetch_recent_items_for_today(user_id, now_br)
        recent_track_bases = []
        for item in recent_items[:10]:
            recent_track_bases.append(build_track_base(item.get("track", {})))
        recent_track_bases_by_user[name] = recent_track_bases

        now_playing_data = build_now_playing(recent_items, now_utc)
        if now_playing_data:
            master["nowPlaying"][name] = now_playing_data
        else:
            master["nowPlaying"][name] = {
                "track": None,
                "artists": [],
                "id": None,
                "albumId": None,
                "albumName": None,
                "albumArtist": None,
                "spotifyId": None,
                "appleMusicId": None,
                "image": None,
                "isNow": False,
                "timestamp": None
            }

        master["recent"][name] = build_recent_preview(recent_items, limit=10)

        count_from_recent = count_today_items(recent_items, now_br)
        count_from_stats = fetch_today_count_via_stats(user_id, now_br)
        

        today_count = count_from_stats if count_from_stats is not None else count_from_recent
        master["daily"][name] = today_count

        print(f"    → {name}: {today_count} streams hoje")
        print(f"    → lote total analisado: {len(recent_items)}")
        if count_from_stats is not None and count_from_stats != count_from_recent:
            print(f"    ↳ ajuste via stats: recent={count_from_recent} stats={count_from_stats}")

    with open("statsfm_rapido.json", "w", encoding="utf-8") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)

    runtime_tracks = {}
    runtime_albums = {}
    runtime_artists = {}

    for name in master["recent"].keys():
        for track_base in recent_track_bases_by_user.get(name, []):
            track_id = track_base.get("id")
            if track_id:
                key = str(track_id)
                track_meta = {
                    "id": track_base.get("id"),
                    "name": track_base.get("name"),
                    "artists": track_base.get("artists") or [],
                    "artistIds": track_base.get("artistIds") or [],
                    "albumId": track_base.get("albumId"),
                    "albumName": track_base.get("albumName"),
                    "albumArtist": track_base.get("albumArtist"),
                    "albumImage": track_base.get("albumImage"),
                    "spotifyId": track_base.get("spotifyId"),
                    "appleMusicId": track_base.get("appleMusicId"),
                    "lastSeenAt": now_utc.isoformat()
                }
                runtime_tracks[key] = merge_track_meta(track_meta, runtime_tracks.get(key))

            album_id = track_base.get("albumId")
            if album_id:
                album_key = str(album_id)
                runtime_albums[album_key] = merge_album_meta({
                    "id": album_id,
                    "name": track_base.get("albumName"),
                    "artistId": track_base.get("albumArtistId"),
                    "artistName": track_base.get("albumArtist"),
                    "image": track_base.get("albumImage"),
                    "lastSeenAt": now_utc.isoformat()
                }, runtime_albums.get(album_key))

            for artist in track_base.get("artists", []):
                artist_id = artist.get("id")
                artist_name = artist.get("name")
                if not artist_id and not artist_name:
                    continue
                artist_key = str(artist_id) if artist_id else f"name::{artist_name}"
                runtime_artists[artist_key] = merge_artist_meta({
                    "id": artist_id if artist_id else artist_key,
                    "name": artist_name,
                    "lastSeenAt": now_utc.isoformat()
                }, runtime_artists.get(artist_key))

    for now_item in master["nowPlaying"].values():
        for artist_name in (now_item.get("artists") or []):
            if not artist_name:
                continue
            pseudo_id = f"name::{artist_name}"
            runtime_artists[pseudo_id] = merge_artist_meta({
                "id": pseudo_id,
                "name": artist_name,
                "lastSeenAt": now_utc.isoformat()
            }, runtime_artists.get(pseudo_id))

    runtime_new = {
        "lastUpdate": now_utc.isoformat(),
        "lastUpdateBR": now_br.isoformat(),
        "tracks": runtime_tracks,
        "albums": runtime_albums,
        "artists": runtime_artists
    }
    runtime_old = load_runtime("statsfm_runtime.json")
    runtime_merged = merge_runtime(runtime_new, runtime_old)
    with open("statsfm_runtime.json", "w", encoding="utf-8") as f:
        json.dump(runtime_merged, f, indent=2, ensure_ascii=False)

    print(f"✅ dados rápidos atualizados! {len(master['recent'])} usuários")

    now_playing = [n for n, d in master["nowPlaying"].items() if d.get("isNow")]
    if now_playing:
        print(f"🎧 now playing: {', '.join(now_playing)}")

    print("📊 streams hoje:")
    for name, count in master["daily"].items():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
