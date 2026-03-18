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

def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            if r.ok:
                return r.json()
            else:
                print(f"⚠️ Tentativa {i+1}/{retries} falhou: {r.status_code}")
        except Exception as e:
            print(f"⚠️ Tentativa {i+1}/{retries} erro: {e}")
        
        if i < retries - 1:
            time.sleep(3)
    
    return None

def get_user_profile(user_id):
    return fetch(f"https://api.stats.fm/api/v1/users/{user_id}")

def get_top(user_id, type, period_ms):
    return fetch(f"https://api.stats.fm/api/v1/users/{user_id}/top/{type}?after={period_ms}&limit=20")

def get_artist_image(artist_id):
    artist = fetch(f"https://api.stats.fm/api/v1/artists/{artist_id}")
    return artist.get("item", {}).get("image") if artist else None

def main():
    print(f"🔄 Iniciando coleta pesada em {datetime.now().isoformat()}")
    
    master = {
        "lastUpdate": datetime.now(timezone.utc).isoformat(),
        "profiles": {},
        "tops": {},
        "rankings": {},
        "stats": {},      # Estatísticas completas
        "diffs": {}       # Diferenças percentuais
    }
    
    week_ago = int((datetime.now() - timedelta(days=7)).timestamp() * 1000)
    prev_week_start = int((datetime.now() - timedelta(days=14)).timestamp() * 1000)
    prev_week_end = week_ago
    
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
        
        # Estatísticas da semana atual
        week_stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={week_ago}")
        week_streams = 0
        week_duration_ms = 0
        if week_stats:
            week_streams = week_stats.get("items", {}).get("count", 0)
            week_duration_ms = week_stats.get("items", {}).get("durationMs", 0)
        
        # Estatísticas da semana passada (para diferença)
        prev_stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={prev_week_start}&before={prev_week_end}")
        prev_streams = 0
        if prev_stats:
            prev_streams = prev_stats.get("items", {}).get("count", 0)
        
        # Calcula diferença percentual
        diff_pct = 0
        if prev_streams > 0:
            diff_pct = round(((week_streams - prev_streams) / prev_streams) * 100)
        elif week_streams > 0:
            diff_pct = 100
        
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
        artists = get_top(user_id, "artists", week_ago)
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
        tracks = get_top(user_id, "tracks", week_ago)
        if tracks and tracks.get("items"):
            master["tops"][name]["week"]["tracks"] = [{
                "name": t["track"]["name"],
                "artists": [a["name"] for a in t["track"].get("artists", [])],
                "streams": t["streams"],
                "image": t["track"].get("albums", [{}])[0].get("image")
            } for t in tracks["items"][:15]]
        
        # Álbuns
        albums = get_top(user_id, "albums", week_ago)
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
        # ✅ Corrigido: usando uma variável intermediária para evitar problemas de aninhamento de aspas
        top3_str = ", ".join([f"{t['name']} ({t['streams']})" for t in top3])
        print(f"🏆 Top 3: {top3_str}")
      
if __name__ == "__main__":
    main()
