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
            # heurística: segundos vs milissegundos
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
    """
    Busca páginas do recent até encontrar item fora de hoje (horário de brasília).
    Isso evita truncar a contagem quando o usuário ouviu mais de 200 músicas no dia.
    """
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
        print(f"    ↳ paginação encerrou ao encontrar item fora de hoje")
    else:
        print(f"    ↳ paginação encerrou por fim de resultados ou limite de páginas")

    return all_items


def build_recent_preview(recent_items, limit=10):
    preview = []
    for i in recent_items[:limit]:
        track = i.get("track", {})
        preview.append({
            "track": track.get("name"),
            "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
            "playedAt": i.get("endTime") or i.get("playedAt"),
            "image": track.get("albums", [{}])[0].get("image")
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
        is_now = diff_ms < 300000  # 5 minutos

    return {
        "track": track.get("name"),
        "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
        "image": track.get("albums", [{}])[0].get("image"),
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

    for name, user_id in USERS.items():
        print(f"  coletando {name}...")

        # busca o suficiente para cobrir todo o dia atual em br
        recent_items = fetch_recent_items_for_today(user_id, now_br)

        # now playing / última tocada
        now_playing_data = build_now_playing(recent_items, now_utc)
        if now_playing_data:
            master["nowPlaying"][name] = now_playing_data
        else:
            master["nowPlaying"][name] = {
                "track": None,
                "artists": [],
                "image": None,
                "isNow": False,
                "timestamp": None
            }

        # últimas 10 músicas para exibição
        master["recent"][name] = build_recent_preview(recent_items, limit=10)

        # contagem real do dia
        today_count = count_today_items(recent_items, now_br)
        master["daily"][name] = today_count

        print(f"    → {name}: {today_count} streams hoje")
        print(f"    → lote total analisado: {len(recent_items)}")

    # salva arquivo
    with open("statsfm_rapido.json", "w", encoding="utf-8") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)

    print(f"✅ dados rápidos atualizados! {len(master['recent'])} usuários")

    # mostra now playing
    now_playing = [n for n, d in master["nowPlaying"].items() if d.get("isNow")]
    if now_playing:
        print(f"🎧 now playing: {', '.join(now_playing)}")

    # mostra totais do dia
    print("📊 streams hoje:")
    for name, count in master["daily"].items():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
