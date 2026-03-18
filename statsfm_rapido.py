# statsfm_rapido.py
import requests
import json
from datetime import datetime, timedelta, timezone

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
    
    # ✅ AGORA: usa horário de Brasília para calcular início do dia
    now_br = datetime.now(BR_TIMEZONE)
    start_of_day_br = datetime(now_br.year, now_br.month, now_br.day, tzinfo=BR_TIMEZONE)
    start_of_day_ms = int(start_of_day_br.timestamp() * 1000)
    
    master = {
        "lastUpdate": datetime.now(timezone.utc).isoformat(),
        "lastUpdateBR": now_br.isoformat(),  # Hora BR para referência
        "nowPlaying": {},
        "recent": {},
        "daily": {}
    }
    
    for name, user_id in USERS.items():
        print(f"  Coletando {name}...")
        
        # ... (resto do código igual)
        
        # ✅ USA start_of_day_ms com horário BR
        stats = fetch(f"https://api.stats.fm/api/v1/users/{user_id}/streams/stats?after={start_of_day_ms}")
        if stats:
            master["daily"][name] = stats.get("items", {}).get("count", 0)
    
    # ... (resto do código)
