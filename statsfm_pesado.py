# statsfm_pesado.py
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

BR_TIMEZONE = timezone(timedelta(hours=-3))


def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(
                url,
                timeout=15,
                headers={"User-Agent": "Mozilla/5.0"}
            )
            if r.ok:
                return r.json()
            else:
                print(f"⚠️ tentativa {i+1}/{retries} falhou: {r.status_code}")
        except Exception as e:
            print(f"⚠️ tentativa {i+1}/{retries} erro: {e}")

        if i < retries - 1:
            time.sleep(3)

    return None


def get_user_profile(user_id):
    return fetch(f"https://api.stats.fm/api/v1/users/{user_id}")


def get_top(user_id, top_type, period_ms, limit=20):
    return fetch(
        f"https://api.stats.fm/api/v1/users/{user_id}/top/{top_type}?after={period_ms}&limit={limit}"
    )


def get_stats(user_id, after_ms, before_ms=None):
    url = f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={after_ms}"
    if before_ms is not None:
        url += f"&before={before_ms}"
    return fetch(url)


def get_artist_image(artist_id):
    artist = fetch(f"https://api.stats.fm/api/v1/artists/{artist_id}")
    return artist.get("item", {}).get("image") if artist else None


def empty_top_block():
    return {
        "artists": [],
        "tracks": [],
        "albums": [],
        "artistsIndex": {},
        "albumsIndex": {}
    }


def build_artist_items(items):
    result = []
    for a in items[:15]:
        artist_obj = a.get("artist", {})
        artist_id = artist_obj.get("id")
        artist_data = {
            "name": artist_obj.get("name"),
            "streams": a.get("streams", 0),
            "id": artist_id
        }
        if artist_id:
            img = get_artist_image(artist_id)
            if img:
                artist_data["image"] = img
        result.append(artist_data)
    return result


def build_track_items(items):
    result = []
    for t in items[:15]:
        track = t.get("track", {})
        album_obj = (track.get("albums") or [{}])[0] or {}
        album_artists = album_obj.get("artists") or []
        album_artist_name = (
            (album_obj.get("artist") or {}).get("name")
            or (album_artists[0].get("name") if album_artists else None)
        )
        track_artists = []
        artist_ids = []
        for artist in track.get("artists", []) or []:
            artist_name = artist.get("name")
            artist_id = artist.get("id")
            if artist_name:
                track_artists.append({
                    "id": artist_id,
                    "name": artist_name
                })
            if artist_id:
                artist_ids.append(artist_id)

        result.append({
            "id": track.get("id"),
            "name": track.get("name"),
            "artists": track_artists,
            "artistIds": artist_ids,
            "albumId": album_obj.get("id"),
            "albumName": album_obj.get("name"),
            "albumArtist": album_artist_name,
            "albumImage": album_obj.get("image"),
            "spotifyId": track.get("spotifyId"),
            "appleMusicId": pickNonEmpty(
                track.get("appleMusicId"),
                ((track.get("externalIds") or {}).get("appleMusic") or [None])[0]
            ),
            "streams": t.get("streams", 0),
            "image": album_obj.get("image")
        })
    return result


def build_album_items(items):
    result = []
    for a in items[:15]:
        album = a.get("album", {})
        artist_name = (
            album.get("artist", {}).get("name")
            or (album.get("artists")[0].get("name") if album.get("artists") else "Unknown")
        )
        result.append({
            "id": album.get("id"),
            "name": album.get("name"),
            "artist": artist_name,
            "artistId": (
                (album.get("artist") or {}).get("id")
                or (album.get("artists")[0].get("id") if album.get("artists") else None)
            ),
            "streams": a.get("streams", 0),
            "image": album.get("image")
        })
    return result


def get_period_tops(user_id, after_ms):
    block = empty_top_block()

    artists = get_top(user_id, "artists", after_ms)
    if artists and artists.get("items"):
        block["artists"] = build_artist_items(artists["items"])

    tracks = get_top(user_id, "tracks", after_ms)
    if tracks and tracks.get("items"):
        block["tracks"] = build_track_items(tracks["items"])

    albums = get_top(user_id, "albums", after_ms)
    if albums and albums.get("items"):
        block["albums"] = build_album_items(albums["items"])

    for artist in block.get("artists", []):
        artist_id = artist.get("id")
        if not artist_id:
            continue
        artist_entry = block["artistsIndex"].setdefault(artist_id, {"id": artist_id})
        if not artist_entry.get("name") and artist.get("name"):
            artist_entry["name"] = artist.get("name")
        if not artist_entry.get("image") and artist.get("image"):
            artist_entry["image"] = artist.get("image")

    for album in block.get("albums", []):
        album_id = album.get("id")
        if not album_id:
            continue
        album_entry = block["albumsIndex"].setdefault(album_id, {"id": album_id})
        if not album_entry.get("name") and album.get("name"):
            album_entry["name"] = album.get("name")
        if not album_entry.get("artistId") and album.get("artistId"):
            album_entry["artistId"] = album.get("artistId")
        if not album_entry.get("artistName") and album.get("artist"):
            album_entry["artistName"] = album.get("artist")
        if not album_entry.get("image") and album.get("image"):
            album_entry["image"] = album.get("image")

    for track in block.get("tracks", []):
        for artist in track.get("artists", []):
            artist_id = artist.get("id")
            if not artist_id:
                continue
            artist_entry = block["artistsIndex"].setdefault(artist_id, {"id": artist_id})
            if not artist_entry.get("name") and artist.get("name"):
                artist_entry["name"] = artist.get("name")
        album_id = track.get("albumId")
        if not album_id:
            continue
        album_entry = block["albumsIndex"].setdefault(album_id, {"id": album_id})
        if not album_entry.get("name") and track.get("albumName"):
            album_entry["name"] = track.get("albumName")
        if not album_entry.get("artistName") and track.get("albumArtist"):
            album_entry["artistName"] = track.get("albumArtist")
        if not album_entry.get("image") and track.get("albumImage"):
            album_entry["image"] = track.get("albumImage")
        if not album_entry.get("artistId"):
            for artist_id in track.get("artistIds", []):
                if artist_id:
                    album_entry["artistId"] = artist_id
                    break

    return block


def extract_stats_payload(stats_resp):
    items = stats_resp.get("items", {}) if stats_resp else {}
    streams = items.get("count", 0)
    duration_ms = items.get("durationMs", 0)

    return {
        "streams": streams,
        "durationMs": duration_ms,
        "minutes": duration_ms // 60000,
        "hours": duration_ms // 3600000
    }



def pickNonEmpty(newValue, oldValue):
    if newValue is None:
        return oldValue
    if isinstance(newValue, str) and newValue.strip() == "":
        return oldValue
    if isinstance(newValue, list) and len(newValue) == 0:
        return oldValue
    if isinstance(newValue, dict) and len(newValue) == 0:
        return oldValue
    return newValue


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


def mergeTrackMeta(newTrack, oldTrack):
    newTrack = newTrack or {}
    oldTrack = oldTrack or {}
    merged = dict(oldTrack)

    fields = [
        "id", "name", "albumId", "albumName", "albumArtist",
        "albumImage", "spotifyId", "appleMusicId"
    ]
    for field in fields:
        merged[field] = pickNonEmpty(newTrack.get(field), oldTrack.get(field))

    merged["artists"] = pickNonEmpty(newTrack.get("artists"), oldTrack.get("artists"))
    merged["artistIds"] = merge_stable_dedup_array(newTrack.get("artistIds"), oldTrack.get("artistIds"))
    return merged


def mergeAlbumMeta(newAlbum, oldAlbum):
    newAlbum = newAlbum or {}
    oldAlbum = oldAlbum or {}
    merged = dict(oldAlbum)

    for field in ["id", "name", "artistId", "artistName", "image"]:
        merged[field] = pickNonEmpty(newAlbum.get(field), oldAlbum.get(field))

    return merged


def mergeArtistMeta(newArtist, oldArtist):
    newArtist = newArtist or {}
    oldArtist = oldArtist or {}
    merged = dict(oldArtist)

    for field in ["id", "name", "image"]:
        merged[field] = pickNonEmpty(newArtist.get(field), oldArtist.get(field))

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

    merged["lastUpdate"] = pickNonEmpty(new_runtime.get("lastUpdate"), old_runtime.get("lastUpdate") if old_runtime else None)
    merged["lastUpdateBR"] = pickNonEmpty(new_runtime.get("lastUpdateBR"), old_runtime.get("lastUpdateBR") if old_runtime else None)

    merged_tracks = dict((old_runtime or {}).get("tracks", {}))
    for track_id, new_track in (new_runtime.get("tracks") or {}).items():
        merged_tracks[track_id] = mergeTrackMeta(new_track, merged_tracks.get(track_id))
    merged["tracks"] = merged_tracks

    merged_albums = dict((old_runtime or {}).get("albums", {}))
    for album_id, new_album in (new_runtime.get("albums") or {}).items():
        merged_albums[album_id] = mergeAlbumMeta(new_album, merged_albums.get(album_id))
    merged["albums"] = merged_albums

    merged_artists = dict((old_runtime or {}).get("artists", {}))
    for artist_id, new_artist in (new_runtime.get("artists") or {}).items():
        merged_artists[artist_id] = mergeArtistMeta(new_artist, merged_artists.get(artist_id))
    merged["artists"] = merged_artists

    return merged

def main():
    print(f"🔄 iniciando coleta pesada em {datetime.now().isoformat()}")

    now_utc = datetime.now(timezone.utc)
    now_br = datetime.now(BR_TIMEZONE)

    week_start_br = now_br - timedelta(days=7)
    prev_week_start_br = now_br - timedelta(days=14)
    prev_week_end_br = week_start_br
    month_start_br = datetime(now_br.year, now_br.month, 1, 0, 0, 0, tzinfo=BR_TIMEZONE)

    week_start_ms = int(week_start_br.timestamp() * 1000)
    prev_week_start_ms = int(prev_week_start_br.timestamp() * 1000)
    prev_week_end_ms = int(prev_week_end_br.timestamp() * 1000)
    month_start_ms = int(month_start_br.timestamp() * 1000)

    print(f"📅 horário br: {now_br.isoformat()}")
    print(f"📆 semana atual desde: {week_start_br.isoformat()}")
    print(f"📆 semana passada desde: {prev_week_start_br.isoformat()}")
    print(f"🗓️ mês atual desde: {month_start_br.isoformat()}")

    master = {
        "lastUpdate": now_utc.isoformat(),
        "lastUpdateBR": now_br.isoformat(),
        "profiles": {},
        "tops": {},
        "rankings": {
            "week": [],
            "month": []
        },
        "stats": {},
        "diffs": {}
    }

    rankings_week = []
    rankings_month = []
    runtime_tracks = {}
    runtime_albums = {}
    runtime_artists = {}

    for name, user_id in USERS.items():
        print(f"  coletando {name}...")

        profile = get_user_profile(user_id)
        master["profiles"][name] = {
            "displayName": profile.get("item", {}).get("displayName") if profile else name,
            "image": profile.get("item", {}).get("image") if profile else None
        }

        week_stats_resp = get_stats(user_id, week_start_ms)
        week_stats = extract_stats_payload(week_stats_resp)
        print(f"    → semana atual: {week_stats['streams']} streams, {week_stats['minutes']} minutos")

        prev_stats_resp = get_stats(user_id, prev_week_start_ms, prev_week_end_ms)
        prev_stats = extract_stats_payload(prev_stats_resp)
        prev_streams = prev_stats["streams"]
        print(f"    → semana passada: {prev_streams} streams")

        month_stats_resp = get_stats(user_id, month_start_ms)
        month_stats = extract_stats_payload(month_stats_resp)
        print(f"    → mês atual: {month_stats['streams']} streams, {month_stats['minutes']} minutos")

        diff_pct = 0
        if prev_streams > 0:
            diff_pct = round(((week_stats["streams"] - prev_streams) / prev_streams) * 100)
        elif week_stats["streams"] > 0:
            diff_pct = 100

        print(f"    → diferença semanal: {diff_pct}%")

        week_tops = get_period_tops(user_id, week_start_ms)
        month_tops = get_period_tops(user_id, month_start_ms)

        for period_tops in (week_tops, month_tops):
            for track in period_tops.get("tracks", []):
                track_id = track.get("id")
                if not track_id:
                    continue
                key = str(track_id)
                runtime_tracks[key] = mergeTrackMeta(track, runtime_tracks.get(key))

            for album_id, album in period_tops.get("albumsIndex", {}).items():
                if not album_id:
                    continue
                key = str(album_id)
                runtime_albums[key] = mergeAlbumMeta(album, runtime_albums.get(key))

            for artist_id, artist in period_tops.get("artistsIndex", {}).items():
                if not artist_id:
                    continue
                key = str(artist_id)
                runtime_artists[key] = mergeArtistMeta(artist, runtime_artists.get(key))

        master["tops"][name] = {
            "week": week_tops,
            "month": month_tops
        }

        master["stats"][name] = {
            "week": {
                **week_stats,
                "avgPerDay": round(week_stats["streams"] / 7, 1) if week_stats["streams"] > 0 else 0
            },
            "month": {
                **month_stats,
                "avgPerDay": round(month_stats["streams"] / max(now_br.day, 1), 1) if month_stats["streams"] > 0 else 0
            }
        }

        master["diffs"][name] = diff_pct

        rankings_week.append({
            "name": name,
            "streams": week_stats["streams"]
        })

        rankings_month.append({
            "name": name,
            "streams": month_stats["streams"]
        })

    master["rankings"]["week"] = sorted(rankings_week, key=lambda x: x["streams"], reverse=True)
    master["rankings"]["month"] = sorted(rankings_month, key=lambda x: x["streams"], reverse=True)

    with open("statsfm_pesado.json", "w", encoding="utf-8") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)

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

    print(f"✅ dados pesados atualizados! {len(master['profiles'])} usuários")

    if master["rankings"]["week"]:
        top3_week = ", ".join(
            [f"{t['name']} ({t['streams']})" for t in master["rankings"]["week"][:3]]
        )
        print(f"🏆 top 3 semana: {top3_week}")

    if master["rankings"]["month"]:
        top3_month = ", ".join(
            [f"{t['name']} ({t['streams']})" for t in master["rankings"]["month"][:3]]
        )
        print(f"🗓️ top 3 mês: {top3_month}")

    print("📊 streams por usuário:")
    for name, stats in master["stats"].items():
        print(
            f"  {name}: "
            f"semana {stats['week']['streams']} streams "
            f"({stats['week']['minutes']} min, {master['diffs'][name]}%) | "
            f"mês {stats['month']['streams']} streams "
            f"({stats['month']['minutes']} min)"
        )


if __name__ == "__main__":
    main()
