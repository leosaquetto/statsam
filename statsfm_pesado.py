# statsfm_pesado.py
import requests
import json
from datetime import datetime, timedelta

USERS = {
  "leo": "000997.3647cff9cc2b42359d6ca7f79a0f2c91.0428",
  "gab": "000859.740385afd8284174a94c84e9bcc9bdea.1440",
  "savio": "12151123201",
  "benny": "benante.m",
  "peter": "12182998998"
}

def fetch(url):
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        return r.json() if r.ok else None
    except:
        return None

def get_user_profile(user_id):
    return fetch(f"https://api.stats.fm/api/v1/users/{user_id}")

def get_top(user_id, type, period_ms):
    return fetch(f"https://api.stats.fm/api/v1/users/{user_id}/top/{type}?after={period_ms}&limit=20")

def get_artist_image(artist_id):
    artist = fetch(f"https://api.stats.fm/api/v1/artists/{artist_id}")
    return artist.get("item", {}).get("image") if artist else None

def main():
    master = {
        "lastUpdate": datetime.now().isoformat(),
        "profiles": {},
        "tops": {},
        "rankings": {},
        "stats": {},      # ✅ NOVO: estatísticas completas
        "diffs": {}       # ✅ NOVO: diferenças percentuais
    }
    
    week_ago = int((datetime.now() - timedelta(days=7)).timestamp() * 1000)
    prev_week_start = int((datetime.now() - timedelta(days=14)).timestamp() * 1000)
    prev_week_end = week_ago
    month_ago = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
    year_ago = int((datetime.now() - timedelta(days=365)).timestamp() * 1000)
    
    # Lista para ranking
    rankings = []
    
    # Coleta dados de cada usuário
    for name, user_id in USERS.items():
        print(f"Coletando dados pesados de {name}...")
        
        # Perfil
        profile = get_user_profile(user_id)
        master["profiles"][name] = {
            "displayName": profile.get("item", {}).get("displayName") if profile else name,
            "image": profile.get("item", {}).get("image") if profile else None
        }
        
        # ✅ ESTATÍSTICAS DA SEMANA ATUAL
        week_stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={week_ago}")
        week_streams = 0
        week_duration_ms = 0
        if week_stats:
            week_streams = week_stats.get("items", {}).get("count", 0)
            week_duration_ms = week_stats.get("items", {}).get("durationMs", 0)
        
        # ✅ ESTATÍSTICAS DA SEMANA PASSADA (para diferença)
        prev_stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={prev_week_start}&before={prev_week_end}")
        prev_streams = 0
        if prev_stats:
            prev_streams = prev_stats.get("items", {}).get("count", 0)
        
        # ✅ CALCULA DIFERENÇA PERCENTUAL
        diff_pct = 0
        if prev_streams > 0:
            diff_pct = round(((week_streams - prev_streams) / prev_streams) * 100)
        elif week_streams > 0:
            diff_pct = 100
        
        # ✅ SALVA STATS COMPLETOS
        master["stats"][name] = {
            "streams": week_streams,
            "durationMs": week_duration_ms,
            "minutes": week_duration_ms // 60000,        # Minutos totais
            "hours": week_duration_ms // 3600000,        # Horas totais
            "avgPerDay": round(week_streams / 7, 1)      # Média por dia
        }
        
        # ✅ SALVA DIFERENÇA
        master["diffs"][name] = diff_pct
        
        # Adiciona ao ranking
        rankings.append({
            "name": name,
            "streams": week_streams
        })
        
        # Tops semanais (seu código original)
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
                # Tenta pegar imagem do artista
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
    
    with open("statsfm_pesado.json", "w") as f:
        json.dump(master, f, indent=2)
    print("✅ Dados pesados atualizados!")

if __name__ == "__main__":
    main()
