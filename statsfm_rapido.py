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

# 🕐 Fuso horário de Brasília (UTC-3)
BR_TIMEZONE = timezone(timedelta(hours=-3))

def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            if r.ok:
                return r.json()
            else:
                print(f"⚠️ Tentativa {i+1}/{retries} falhou: {r.status_code}")
        except Exception as e:
            print(f"⚠️ Tentativa {i+1}/{retries} erro: {e}")
        
        if i < retries - 1:
            time.sleep(2)
    
    return None

def main():
    print(f"🔄 Iniciando coleta rápida em {datetime.now().isoformat()}")
    
    # ✅ USA horário de Brasília para calcular início do dia
    now_br = datetime.now(BR_TIMEZONE)
    start_of_day_br = datetime(now_br.year, now_br.month, now_br.day, tzinfo=BR_TIMEZONE)
    start_of_day_ms = int(start_of_day_br.timestamp() * 1000)
    
    print(f"📅 Horário BR: {now_br.isoformat()}")
    print(f"⏱️  Início do dia BR (ms): {start_of_day_ms}")
    
    master = {
        "lastUpdate": datetime.now(timezone.utc).isoformat(),
        "lastUpdateBR": now_br.isoformat(),
        "nowPlaying": {},
        "recent": {},
        "daily": {}
    }
    
    for name, user_id in USERS.items():
        print(f"  Coletando {name}...")
        
        # Música atual (última tocada)
        recent = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/recent?limit=1")
        if recent and recent.get("items") and len(recent["items"]) > 0:
            item = recent["items"][0]
            track = item["track"]
            played_at = item.get("endTime") or item.get("playedAt")
            
            # Verifica se é "now playing" (últimos 5 minutos)
            is_now = False
            if played_at:
                try:
                    if isinstance(played_at, int):
                        played_ms = played_at * 1000
                    else:
                        played_ms = datetime.fromisoformat(played_at.replace('Z', '+00:00')).timestamp() * 1000
                    
                    is_now = (datetime.now().timestamp() * 1000 - played_ms) < 300000  # 5 minutos
                except Exception as e:
                    print(f"    Erro ao processar timestamp: {e}")
            
            master["nowPlaying"][name] = {
                "track": track["name"],
                "artists": [a["name"] for a in track.get("artists", [])],
                "image": track.get("albums", [{}])[0].get("image"),
                "isNow": is_now,
                "timestamp": played_at
            }
        
        # Últimas 10 músicas
        recent10 = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/recent?limit=10")
        if recent10 and recent10.get("items"):
            master["recent"][name] = []
            for i in recent10["items"]:
                track = i["track"]
                master["recent"][name].append({
                    "track": track["name"],
                    "artists": [a["name"] for a in track.get("artists", [])],
                    "playedAt": i.get("endTime") or i.get("playedAt"),
                    "image": track.get("albums", [{}])[0].get("image")
                })
        
        # ✅ Contagem do dia (com horário BR corrigido)
        stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={start_of_day_ms}")
        if stats:
            count = stats.get("items", {}).get("count", 0)
            master["daily"][name] = count
            print(f"    → {name}: {count} streams hoje")
        else:
            master["daily"][name] = 0
            print(f"    → {name}: sem dados")
    
    # Salva arquivo
    with open("statsfm_rapido.json", "w") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Dados rápidos atualizados! {len(master['recent'])} usuários")
    
    # Mostra now playing
    now_playing = [n for n, d in master["nowPlaying"].items() if d.get("isNow")]
    if now_playing:
        print(f"🎧 Now playing: {', '.join(now_playing)}")
    
    # Mostra totais do dia
    print("📊 Streams hoje:")
    for name, count in master["daily"].items():
        print(f"  {name}: {count}")

if __name__ == "__main__":
    main()
