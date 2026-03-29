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
        "albums": []
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
        result.append({
            "name": track.get("name"),
            "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
            "streams": t.get("streams", 0),
            "image": track.get("albums", [{}])[0].get("image")
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
            "name": album.get("name"),
            "artist": artist_name,
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


def has_meaningful_month_data(top_block, stats_block):
    if stats_block.get("streams", 0) > 0:
        return True

    return bool(
        top_block.get("artists") or
        top_block.get("tracks") or
        top_block.get("albums")
    )


def main():
    print(f"🔄 iniciando coleta pesada em {datetime.now().isoformat()}")

    now_utc = datetime.now(timezone.utc)
    now_br = datetime.now(BR_TIMEZONE)

    # períodos em br
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

    for name, user_id in USERS.items():
        print(f"  coletando {name}...")

        # perfil
        profile = get_user_profile(user_id)
        master["profiles"][name] = {
            "displayName": profile.get("item", {}).get("displayName") if profile else name,
            "image": profile.get("item", {}).get("image") if profile else None
        }

        # stats semana atual
        week_stats_resp = get_stats(user_id, week_start_ms)
        week_stats = extract_stats_payload(week_stats_resp)
        print(f"    → semana atual: {week_stats['streams']} streams, {week_stats['minutes']} minutos")

        # stats semana passada
        prev_stats_resp = get_stats(user_id, prev_week_start_ms, prev_week_end_ms)
        prev_stats = extract_stats_payload(prev_stats_resp)
        prev_streams = prev_stats["streams"]
        print(f"    → semana passada: {prev_streams} streams")

        # stats mês atual
        month_stats_resp = get_stats(user_id, month_start_ms)
        month_stats = extract_stats_payload(month_stats_resp)
        print(f"    → mês atual: {month_stats['streams']} streams, {month_stats['minutes']} minutos")

        # diff semanal
        diff_pct = 0
        if prev_streams > 0:
            diff_pct = round(((week_stats["streams"] - prev_streams) / prev_streams) * 100)
        elif week_stats["streams"] > 0:
            diff_pct = 100

        print(f"    → diferença semanal: {diff_pct}%")

        # tops
        week_tops = get_period_tops(user_id, week_start_ms)
        month_tops = get_period_tops(user_id, month_start_ms)

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
                "avgPerDay": round(
                    month_stats["streams"] / max(now_br.day, 1), 1
                ) if month_stats["streams"] > 0 else 0
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
    main()def get_top(user_id, type, period_ms):
    return fetch(f"https://api.stats.fm/api/v1/users/{user_id}/top/{type}?after={period_ms}&limit=20")

def get_artist_image(artist_id):
    artist = fetch(f"https://api.stats.fm/api/v1/artists/{artist_id}")
    return artist.get("item", {}).get("image") if artist else None

def main():
    print(f"🔄 Iniciando coleta pesada em {datetime.now().isoformat()}")
    
    # ✅ Tudo em horário BR
    now_br = datetime.now(BR_TIMEZONE)
    
    # Períodos em BR
    week_ago_br = int((now_br - timedelta(days=7)).timestamp() * 1000)
    prev_week_start_br = int((now_br - timedelta(days=14)).timestamp() * 1000)
    prev_week_end_br = week_ago_br
    
    print(f"📅 Horário BR: {now_br.isoformat()}")
    print(f"📆 Semana atual: {datetime.fromtimestamp(week_ago_br/1000, BR_TIMEZONE).isoformat()}")
    print(f"📆 Semana passada: {datetime.fromtimestamp(prev_week_start_br/1000, BR_TIMEZONE).isoformat()}")
    
    master = {
        "lastUpdate": datetime.now(timezone.utc).isoformat(),
        "lastUpdateBR": now_br.isoformat(),
        "profiles": {},
        "tops": {},
        "rankings": {},
        "stats": {},
        "diffs": {}
    }
    
    # Lista para ranking
    rankings = []
    
    # Coleta dados de cada usuário
    for name, user_id in USERS.items():
        print(f"  Coletando {name}...")
        
        # Perfil
        profile = get_user_profile(user_id)
        master["profiles"][name] = {
            "displayName": profile.get("item", {}).get("displayName") if profile else name,
            "image": profile.get("item", {}).get("image") if profile else None
        }
        
        # ✅ Estatísticas da semana atual (com período BR)
        week_stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={week_ago_br}")
        week_streams = 0
        week_duration_ms = 0
        if week_stats:
            week_streams = week_stats.get("items", {}).get("count", 0)
            week_duration_ms = week_stats.get("items", {}).get("durationMs", 0)
            print(f"    → Semana atual: {week_streams} streams, {week_duration_ms//60000} minutos")
        
        # ✅ Estatísticas da semana passada (com período BR)
        prev_stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={prev_week_start_br}&before={prev_week_end_br}")
        prev_streams = 0
        if prev_stats:
            prev_streams = prev_stats.get("items", {}).get("count", 0)
            print(f"    → Semana passada: {prev_streams} streams")
        
        # Calcula diferença percentual
        diff_pct = 0
        if prev_streams > 0:
            diff_pct = round(((week_streams - prev_streams) / prev_streams) * 100)
        elif week_streams > 0:
            diff_pct = 100
        
        print(f"    → Diferença: {diff_pct}%")
        
        # Salva stats completos
        master["stats"][name] = {
            "streams": week_streams,
            "durationMs": week_duration_ms,
            "minutes": week_duration_ms // 60000,
            "hours": week_duration_ms // 3600000,
            "avgPerDay": round(week_streams / 7, 1) if week_streams > 0 else 0
        }
        
        # Salva diferença
        master["diffs"][name] = diff_pct
        
        # Adiciona ao ranking
        rankings.append({
            "name": name,
            "streams": week_streams
        })
        
        # Tops semanais
        master["tops"][name] = {
            "week": {
                "artists": [],
                "tracks": [],
                "albums": []
            }
        }
        
        # Artistas (com imagens)
        artists = get_top(user_id, "artists", week_ago_br)
        if artists and artists.get("items"):
            for a in artists["items"][:15]:
                artist_data = {
                    "name": a["artist"]["name"],
                    "streams": a["streams"],
                    "id": a["artist"]["id"]
                }
                img = get_artist_image(a["artist"]["id"])
                if img:
                    artist_data["image"] = img
                master["tops"][name]["week"]["artists"].append(artist_data)
        
        # Músicas
        tracks = get_top(user_id, "tracks", week_ago_br)
        if tracks and tracks.get("items"):
            master["tops"][name]["week"]["tracks"] = [{
                "name": t["track"]["name"],
                "artists": [a["name"] for a in t["track"].get("artists", [])],
                "streams": t["streams"],
                "image": t["track"].get("albums", [{}])[0].get("image")
            } for t in tracks["items"][:15]]
        
        # Álbuns
        albums = get_top(user_id, "albums", week_ago_br)
        if albums and albums.get("items"):
            master["tops"][name]["week"]["albums"] = [{
                "name": a["album"]["name"],
                "artist": a["album"].get("artist", {}).get("name") or (a["album"].get("artists")[0]["name"] if a["album"].get("artists") else "Unknown"),
                "streams": a["streams"],
                "image": a["album"].get("image")
            } for a in albums["items"][:15]]
    
    # Rankings globais
    master["rankings"]["week"] = sorted(rankings, key=lambda x: x["streams"], reverse=True)
    
    # Salva arquivo
    with open("statsfm_pesado.json", "w") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Dados pesados atualizados! {len(master['profiles'])} usuários")
    
    # Mostra top 3
    if master["rankings"]["week"]:
        top3 = master["rankings"]["week"][:3]
        top3_str = ", ".join([f"{t['name']} ({t['streams']})" for t in top3])
        print(f"🏆 Top 3: {top3_str}")
    
    # Mostra resumo
    print("📊 Streams por usuário:")
    for name, stats in master["stats"].items():
        print(f"  {name}: {stats['streams']} streams ({stats['minutes']} min, {master['diffs'][name]}%)")

if __name__ == "__main__":
    main()
