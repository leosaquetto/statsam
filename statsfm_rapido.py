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

def fetch_recent_items(user_id, limit=200):
    data = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/recent?limit={limit}")
    if data and data.get("items"):
        return data["items"]
    return []

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

        # busca um lote maior para contar corretamente os streams de hoje
        recent_items = fetch_recent_items(user_id, limit=200)

        # now playing / última tocada
        if len(recent_items) > 0:
            item = recent_items[0]
            track = item.get("track", {})
            played_at_raw = item.get("endTime") or item.get("playedAt")
            played_dt = parse_played_at(played_at_raw)

            is_now = False
            if played_dt:
                diff_ms = (now_utc - played_dt.astimezone(timezone.utc)).total_seconds() * 1000
                is_now = diff_ms < 300000  # 5 minutos

            master["nowPlaying"][name] = {
                "track": track.get("name"),
                "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
                "image": track.get("albums", [{}])[0].get("image"),
                "isNow": is_now,
                "timestamp": played_at_raw
            }

        # últimas 10 músicas para exibição
        master["recent"][name] = []
        for i in recent_items[:10]:
            track = i.get("track", {})
            master["recent"][name].append({
                "track": track.get("name"),
                "artists": [a.get("name") for a in track.get("artists", []) if a.get("name")],
                "playedAt": i.get("endTime") or i.get("playedAt"),
                "image": track.get("albums", [{}])[0].get("image")
            })

        # contagem do dia calculada manualmente por data br
        today_count = 0
        for i in recent_items:
            played_at_raw = i.get("endTime") or i.get("playedAt")
            played_dt = parse_played_at(played_at_raw)
            if is_today_br(played_dt, now_br):
                today_count += 1

        master["daily"][name] = today_count
        print(f"    → {name}: {today_count} streams hoje")

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
