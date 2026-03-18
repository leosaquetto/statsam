# statsfm_historico.py
import requests
import json
from datetime import datetime, timedelta, timezone
import time

# 🕐 Fuso horário de Brasília (UTC-3)
BR_TIMEZONE = timezone(timedelta(hours=-3))

USERS = {
  "leo": "000997.3647cff9cc2b42359d6ca7f79a0f2c91.0428",
  "gabriel": "000859.740385afd8284174a94c84e9bcc9bdea.1440",
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
            time.sleep(2)
    
    return None

def get_artist_image(artist_id):
    """Busca imagem do artista"""
    artist = fetch(f"https://api.stats.fm/api/v1/artists/{artist_id}")
    if artist and artist.get("item"):
        return artist["item"].get("image")
    return None

def safe_get(obj, *keys, default=None):
    """Pega valor seguro de dicionário aninhado"""
    for key in keys:
        if isinstance(obj, dict):
            obj = obj.get(key)
        else:
            return default
    return obj if obj is not None else default

def main():
    print(f"🔄 Iniciando coleta de histórico em {datetime.now().isoformat()}")
    
    now_br = datetime.now(BR_TIMEZONE)
    
    master = {
        "lastUpdate": datetime.now(timezone.utc).isoformat(),
        "lastUpdateBR": now_br.isoformat(),
        "profiles": {},
        "history": {},
        "stats": {
            "tracks": {},
            "albums": {},
            "artists": {}
        }
    }
    
    # Primeiro, coleta perfis de todos
    print("📸 Coletando perfis...")
    for name, user_id in USERS.items():
        profile = fetch(f"https://api.stats.fm/api/v1/users/{user_id}")
        if profile and profile.get("item"):
            master["profiles"][name] = {
                "displayName": profile["item"].get("displayName", name),
                "image": profile["item"].get("image")
            }
            print(f"  ✅ {name}: {master['profiles'][name]['displayName']}")
    
    # Depois, coleta histórico de cada usuário
    for name, user_id in USERS.items():
        print(f"\n📜 Coletando histórico de {name}...")
        
        all_tracks = []
        offset = 0
        limit = 50
        total_collected = 0
        
        # Cache para imagens de artistas
        artist_image_cache = {}
        
        while total_collected < 300:
            url = f"https://api.stats.fm/api/v1/users/{user_id}/streams/recent?limit={limit}&offset={offset}"
            print(f"  🔍 Buscando offset {offset}...")
            
            data = fetch(url)
            
            if not data or not data.get("items"):
                print(f"  ⚠️ Sem mais dados em offset {offset}")
                break
                
            items = data["items"]
            if not items:
                break
            
            for item in items:
                track = item.get("track", {})
                
                # Pega IDs dos artistas
                artists = track.get("artists", [])
                artist_ids = [a.get("id") for a in artists if a.get("id")]
                artist_names = [a.get("name") for a in artists if a.get("name")]
                
                # Busca imagens dos artistas (se não tiver em cache)
                artist_images = {}
                for artist_id in artist_ids:
                    if artist_id not in artist_image_cache:
                        artist_image_cache[artist_id] = get_artist_image(artist_id)
                    if artist_image_cache[artist_id]:
                        artist_images[artist_id] = artist_image_cache[artist_id]
                
                # Pega informações do álbum com segurança
                albums = track.get("albums", [])
                album = albums[0] if albums else {}
                
                # Pega external IDs com segurança
                external_ids = track.get("externalIds", {})
                apple_music_ids = external_ids.get("appleMusic", []) if external_ids else []
                spotify_ids = external_ids.get("spotify", []) if external_ids else []
                
                track_data = {
                    "track": track.get("name", "Desconhecido"),
                    "trackId": track.get("id", ""),
                    "artists": artist_names,
                    "artistIds": artist_ids,
                    "artistImages": artist_images,
                    "album": album.get("name"),
                    "albumId": album.get("id"),
                    "image": album.get("image"),
                    "playedAt": item.get("endTime") or item.get("playedAt"),
                    "appleMusicId": apple_music_ids[0] if apple_music_ids else None,
                    "spotifyId": track.get("spotifyId") or (spotify_ids[0] if spotify_ids else None)
                }
                all_tracks.append(track_data)
                total_collected += 1
                
                # Atualiza stats
                if track.get("id"):
                    track_id = f"track_{track['id']}"
                    
                    # Incrementa stats da track
                    if track_id not in master["stats"]["tracks"]:
                        master["stats"]["tracks"][track_id] = {}
                    if name not in master["stats"]["tracks"][track_id]:
                        master["stats"]["tracks"][track_id][name] = 0
                    master["stats"]["tracks"][track_id][name] += 1
                
                # Incrementa stats do álbum
                if album.get("id"):
                    album_id = f"album_{album['id']}"
                    if album_id not in master["stats"]["albums"]:
                        master["stats"]["albums"][album_id] = {}
                    if name not in master["stats"]["albums"][album_id]:
                        master["stats"]["albums"][album_id][name] = 0
                    master["stats"]["albums"][album_id][name] += 1
                
                # Incrementa stats dos artistas
                for artist_id in artist_ids:
                    if artist_id:
                        artist_key = f"artist_{artist_id}"
                        if artist_key not in master["stats"]["artists"]:
                            master["stats"]["artists"][artist_key] = {}
                        if name not in master["stats"]["artists"][artist_key]:
                            master["stats"]["artists"][artist_key][name] = 0
                        master["stats"]["artists"][artist_key][name] += 1
            
            offset += limit
            print(f"    → {total_collected} músicas coletadas...")
            
            # Pequena pausa para não sobrecarregar a API
            time.sleep(1)
        
        master["history"][name] = all_tracks[:300]
        print(f"  ✅ {len(master['history'][name])} músicas salvas para {name}")
    
    # Salva arquivo
    with open("statsfm_historico.json", "w") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Histórico atualizado!")
    print(f"📊 Total de músicas: {sum(len(h) for h in master['history'].values())}")
    print(f"📊 Total de tracks com stats: {len(master['stats']['tracks'])}")
    print(f"📊 Total de álbuns com stats: {len(master['stats']['albums'])}")
    print(f"📊 Total de artistas com stats: {len(master['stats']['artists'])}")
    
    # Mostra exemplo
    if master["history"].get("leo") and master["history"]["leo"]:
        print(f"\n🎵 Última música do Leo: {master['history']['leo'][0]['track']}")

if __name__ == "__main__":
    main()
