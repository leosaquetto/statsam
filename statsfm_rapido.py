# statsfm_rapido.py
import requests
import json
from datetime import datetime

USERS = {
  "leo": "000997.3647cff9cc2b42359d6ca7f79a0f2c91.0428",
  "gab": "000859.740385afd8284174a94c84e9bcc9bdea.1440",
  "savio": "12151123201",
  "benny": "benante.m",
  "peter": "12182998998"
}

def fetch(url):
    try:
        r = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        return r.json() if r.ok else None
    except:
        return None

def main():
    master = {
        "lastUpdate": datetime.now().isoformat(),
        "nowPlaying": {},
        "recent": {},
        "daily": {}
    }
    
    start_of_day = int(datetime.now().replace(hour=0, minute=0).timestamp() * 1000)
    
    for name, user_id in USERS.items():
        # Música atual (última tocada)
        recent = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/recent?limit=1")
        if recent and recent.get("items"):
            track = recent["items"][0]["track"]
            played_at = recent["items"][0].get("endTime") or recent["items"][0].get("playedAt")
            
            # Verifica se é "now playing" (últimos 5 minutos)
            is_now = False
            if played_at:
                try:
                    played_ms = int(played_at) * 1000 if isinstance(played_at, int) else datetime.fromisoformat(played_at.replace('Z', '+00:00')).timestamp() * 1000
                    is_now = (datetime.now().timestamp() * 1000 - played_ms) < 300000  # 5 minutos
                except:
                    pass
            
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
            master["recent"][name] = [{
                "track": i["track"]["name"],
                "artists": [a["name"] for a in i["track"].get("artists", [])],
                "playedAt": i.get("endTime") or i.get("playedAt"),
                "image": i["track"].get("albums", [{}])[0].get("image")
            } for i in recent10["items"]]
        
        # Contagem do dia
        stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={start_of_day}")
        if stats:
            master["daily"][name] = stats.get("items", {}).get("count", 0)
    
    with open("statsfm_rapido.json", "w") as f:
        json.dump(master, f, indent=2)
    print("✅ Dados rápidos atualizados!")

if __name__ == "__main__":
    main()
