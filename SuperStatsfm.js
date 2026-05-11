// ========================================================================
// STATS.FM UNIFIED MEGA - V5.3 (IN-APP NAVIGATION & REFINEMENTS)
// ========================================================================
// Arquitetura de "Namespaces Isolados" - garante 100% de estabilidade
// e zero conflito de variáveis ou timeouts entre os 5 widgets.
// ========================================================================

// ========================================================================
// 0. SHARED CORE (STATSCORE)
// ========================================================================
const StatsCore = (() => {
  const BASE_URL = "https://raw.githubusercontent.com/leosaquetto/statsam/main";
  const API_BASE = "https://api.stats.fm/api/v1";
  const LOGO_URL = "https://i.imgur.com/OFCufao.png";
  const USER_AVATAR_FALLBACK = "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp";
  const PETER_AVATAR_FALLBACK = "https://i.imgur.com/4iOIFkx.jpeg";

  const USERS = {
    leo: { id: "000997.3647cff9cc2b42359d6ca7f79a0f2c91.0428", label: "Leo", emoji: "🧔🏻‍♂️" },
    gab: { id: "000859.740385afd8284174a94c84e9bcc9bdea.1440", label: "Gab", emoji: "👦🏼" },
    savio: { id: "12151123201", label: "Sávio", emoji: "🦊" },
    benny: { id: "benante.m", label: "Benny", emoji: "🫃🏻" },
    peter: { id: "12182998998", label: "Peter", emoji: "🍭" }
  };

  const fm = FileManager.local();
  const cacheRoot = fm.joinPath(fm.documentsDirectory(), "statsfm_unified_cache");
  const jsonDir = fm.joinPath(cacheRoot, "json");
  const imgDir = fm.joinPath(cacheRoot, "img");
  const cacheDir = imgDir;

  [cacheRoot, jsonDir, imgDir].forEach(dir => {
    if (!fm.fileExists(dir)) fm.createDirectory(dir);
  });

  const memory = {};
  const placeholders = {};
  const pendingRequests = {};

  function keyHash(input) {
    let hash = 0;
    const str = String(input || "");
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function safeParse(str, fallback = null) {
    try { return JSON.parse(str); } catch (_) { return fallback; }
  }

  function fileAgeMs(path) {
    if (!fm.fileExists(path)) return Infinity;
    return Date.now() - fm.modificationDate(path).getTime();
  }

  async function fetchJSON(url, timeout = 10) {
    try {
      const req = new Request(url);
      req.headers = { "User-Agent": "Mozilla/5.0" };
      req.timeoutInterval = timeout;
      return await req.loadJSON();
    } catch (_) {
      return null;
    }
  }

  async function cachedText(key, fetcher, maxAgeMs, options = {}) {
    const path = fm.joinPath(jsonDir, `${keyHash(key)}.txt`);
    const mem = memory[key];
    if (mem && Date.now() - mem.time < maxAgeMs) return mem.data;
    if (fm.fileExists(path)) {
      const age = fileAgeMs(path);
      const cached = fm.readString(path);
      if (cached && age < maxAgeMs) {
        memory[key] = { data: cached, time: Date.now() };
        return cached;
      }
      if (options.staleWhileRevalidate && cached) return cached;
    }
    const fresh = await fetcher();
    if (fresh) {
      fm.writeString(path, fresh);
      memory[key] = { data: fresh, time: Date.now() };
      return fresh;
    }
    if (fm.fileExists(path)) return fm.readString(path);
    return null;
  }

  async function fetchText(url, timeout = 10) {
    try {
      const req = new Request(url);
      req.headers = { "User-Agent": "Mozilla/5.0" };
      req.timeoutInterval = timeout;
      return await req.loadString();
    } catch (_) {
      return null;
    }
  }

  async function cachedJSON(key, fetcher, maxAgeMs, options = {}) {
    const path = fm.joinPath(jsonDir, `${keyHash(key)}.json`);
    const mem = memory[key];

    if (mem && Date.now() - mem.time < maxAgeMs) return mem.data;

    if (fm.fileExists(path)) {
      const cached = safeParse(fm.readString(path), null);
      const age = fileAgeMs(path);

      if (cached && age < maxAgeMs) {
        memory[key] = { data: cached, time: Date.now() };
        return cached;
      }

      if (options.staleWhileRevalidate && cached) {
        return cached;
      }
    }

    const fresh = await fetcher();

    if (fresh) {
      fm.writeString(path, JSON.stringify(fresh));
      memory[key] = { data: fresh, time: Date.now() };
      return fresh;
    }

    if (fm.fileExists(path)) return safeParse(fm.readString(path), null);
    return null;
  }

  async function cachedImage(url, size = 44, emoji = "🎵") {
    if (!url) return placeholder(size, emoji);

    const path = fm.joinPath(imgDir, `img_${keyHash(url)}.jpg`);

    if (fm.fileExists(path)) {
      try { return fm.readImage(path); } catch (_) {}
    }

    try {
      const req = new Request(url);
      req.timeoutInterval = 6;
      const img = await req.loadImage();
      if (img) fm.writeImage(path, img);
      return img;
    } catch (_) {
      return placeholder(size, emoji);
    }
  }

  function placeholder(size, emoji) {
    const key = `${size}_${emoji}`;
    if (placeholders[key]) return placeholders[key];

    const draw = new DrawContext();
    draw.size = new Size(size, size);
    draw.setFillColor(new Color("#333333"));
    draw.fillEllipse(new Rect(0, 0, size, size));
    draw.setTextAlignedCenter();
    draw.setFont(Font.systemFont(size * 0.42));
    draw.setFillColor(Color.white());
    draw.drawTextInRect(emoji, new Rect(0, size * 0.18, size, size));

    const img = draw.getImage();
    placeholders[key] = img;
    return img;
  }

  function cleanupOldCache(dir, maxAgeDays = 30) {
    if (!fm.fileExists(dir)) return;
    const files = fm.listContents(dir);
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    files.forEach(file => {
      const path = fm.joinPath(dir, file);
      try {
        if (Date.now() - fm.modificationDate(path).getTime() > maxAge) fm.remove(path);
      } catch (_) {}
    });
  }

  if (Math.random() < 0.05) cleanupOldCache(cacheDir, 30);

  async function fetchOnce(key, fetcher) {
    if (pendingRequests[key]) return pendingRequests[key];
    pendingRequests[key] = fetcher().finally(() => { delete pendingRequests[key]; });
    return pendingRequests[key];
  }

  function isStatsFmPlaceholderAvatarUrl(url) {
    const u = String(url || "");
    if (!u) return true;
    if (u.includes("placeholders/users/private.webp")) return true;
    if (u.includes("stats.fm/api/image?")) {
      const m = u.match(/[?&]url=([^&]+)/i);
      if (!m) return true;
      let target = "";
      try { target = decodeURIComponent(m[1]); } catch (_) { target = m[1]; }
      if (!target) return true;
      if (target.includes("placeholders/users/private.webp")) return true;
      return false;
    }
    return false;
  }

  function withPeterFallback(userId, url) {
    const id = String(userId || "").toLowerCase().trim();
    if (id === "peter" || id === "12182998998" || id === "pedro") return PETER_AVATAR_FALLBACK;
    return String(url || "").trim() || null;
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function reorderArtistNamesByOwner(artistNames, ownerName) {
    if (!Array.isArray(artistNames) || !ownerName) return artistNames || [];
    const ownerNorm = normalizeText(ownerName);
    const primary = [];
    const secondary = [];
    artistNames.forEach(name => {
      if (normalizeText(name) === ownerNorm) primary.push(name);
      else secondary.push(name);
    });
    return primary.length ? [...primary, ...secondary] : artistNames;
  }

  function findAlbumOwnerForTopTrack(track, albums = []) {
    if (!track || !Array.isArray(albums)) return null;
    const trackImage = String(track.image || "");
    const trackAlbumName = normalizeText(track.album || track.albumName || "");
    let match = null;
    if (trackAlbumName) {
      match = albums.find(album => normalizeText(album?.name) === trackAlbumName && album?.artist && album.artist !== "Unknown");
    }
    if (!match && trackImage) {
      match = albums.find(album => String(album?.image || "") === trackImage && album?.artist && album.artist !== "Unknown");
    }
    return match?.artist || null;
  }

  function formatTopTrackArtists(track, albums = [], fallback = "Artista") {
    const artists = Array.isArray(track?.artists) ? track.artists.filter(Boolean) : [];
    if (!artists.length) return fallback;
    const owner = findAlbumOwnerForTopTrack(track, albums);
    const ordered = reorderArtistNamesByOwner(artists, owner);
    return ordered.length ? ordered.join(", ") : fallback;
  }

  function normalizeArtistName(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function getTrackArtists(track) {
    return Array.isArray(track?.artists) ? track.artists.filter(Boolean) : [];
  }

  function getAlbumArtists(track) {
    const album = track?.albums?.[0] || track?.album || null;
    const rawArtists = album?.artists || [];
    let artists = [];
    if (Array.isArray(rawArtists)) artists = rawArtists;
    else if (rawArtists) artists = [rawArtists];
    if (album?.artist) artists.push(album.artist);
    return artists.filter(Boolean);
  }

  function getDisplayArtists(track) {
    const trackArtists = getTrackArtists(track);
    if (trackArtists.length <= 1) return trackArtists;
    const albumArtists = getAlbumArtists(track);
    if (albumArtists.length === 0) return trackArtists;
    const albumArtistNames = albumArtists.map(a => normalizeArtistName(a?.name || a)).filter(Boolean);
    const albumArtistIds = albumArtists.map(a => String(a?.id || "")).filter(Boolean);
    if (albumArtistNames.length === 0) return trackArtists;
    const primary = [];
    const secondary = [];
    trackArtists.forEach(artist => {
      const artistName = normalizeArtistName(artist?.name || artist);
      const artistId = String(artist?.id || "");
      if (albumArtistNames.includes(artistName) || (artistId && albumArtistIds.includes(artistId))) primary.push(artist);
      else secondary.push(artist);
    });
    if (primary.length > 0) return [...primary, ...secondary];
    return trackArtists;
  }

  function getTrackAlbumId(track) { return track?.albums?.[0]?.id || track?.album?.id || null; }

  function isUsefulAlbumArtistCandidate(albumArtists, trackArtists) {
    if (!albumArtists || albumArtists.length === 0) return false;
    if (!trackArtists || trackArtists.length <= 1) return true;
    const albumNames = albumArtists.map(a => normalizeArtistName(a?.name || a)).filter(Boolean);
    const trackNames = trackArtists.map(a => normalizeArtistName(a?.name || a)).filter(Boolean);
    if (albumNames.length === 0) return false;
    if (albumNames.length === 1) return true;
    const sameLength = albumNames.length === trackNames.length;
    const sameOrder = sameLength && albumNames.every((name, index) => name === trackNames[index]);
    if (sameOrder) return false;
    const allInsideTrack = albumNames.every(name => trackNames.includes(name));
    if (allInsideTrack && albumNames.length > 1) return false;
    return true;
  }

  function extractArtistsFromAlbum(album) {
    if (!album) return [];
    const source = album?.item || album;
    const rawArtists = source?.artists || [];
    let artists = [];
    if (Array.isArray(rawArtists)) artists = rawArtists;
    else if (rawArtists) artists = [rawArtists];
    if (source?.artist) artists.push(source.artist);
    if (source?.mainArtist) artists.push(source.mainArtist);
    if (source?.owner) artists.push(source.owner);
    return artists.filter(Boolean);
  }

  async function getAlbumDetails(albumId) {
    if (!albumId) return null;
    return await cachedJSON(`album_details_v2_${albumId}`, () => fetchJSON(`${API_BASE}/albums/${albumId}`, 10), 30 * 24 * 60 * 60 * 1000);
  }

  function extractAlbumOwnerFromStatsHtml(html, albumName = null) {
    if (!html) return null;
    let scoped = html;
    const h1Index = html.indexOf("<h1");
    if (h1Index > 0) scoped = html.slice(Math.max(0, h1Index - 3000), h1Index + 500);
    const matches = [...scoped.matchAll(/<a[^>]+href=["']\/artist\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (!matches.length) return null;
    const first = matches[0];
    const id = first[1];
    const name = String(first[2] || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    if (!id || !name) return null;
    return { id, name };
  }

  async function getAlbumOwnerFromStatsPage(albumId, albumName = null) {
    if (!albumId) return null;
    const html = await cachedText(`statsfm_album_page_${albumId}`, () => fetchText(`https://stats.fm/album/${albumId}`, 10), 30 * 24 * 60 * 60 * 1000, { staleWhileRevalidate: true });
    return extractAlbumOwnerFromStatsHtml(html, albumName);
  }

  async function getDisplayArtistsForMainTrack(track) {
    const trackArtists = getTrackArtists(track);
    if (trackArtists.length <= 1) return trackArtists;
    const embeddedAlbum = track?.albums?.[0] || track?.album || null;
    let albumArtists = extractArtistsFromAlbum(embeddedAlbum);
    if (!isUsefulAlbumArtistCandidate(albumArtists, trackArtists)) albumArtists = [];
    const albumId = getTrackAlbumId(track);
    if (albumArtists.length === 0 && albumId) {
      const albumDetails = await getAlbumDetails(albumId);
      const apiAlbumArtists = extractArtistsFromAlbum(albumDetails);
      if (isUsefulAlbumArtistCandidate(apiAlbumArtists, trackArtists)) albumArtists = apiAlbumArtists;
    }
    if (albumArtists.length === 0 && albumId) {
      const owner = await getAlbumOwnerFromStatsPage(albumId, embeddedAlbum?.name);
      if (owner) albumArtists = [owner];
    }
    if (albumArtists.length === 0) return trackArtists;
    const albumArtistNames = albumArtists.map(a => normalizeArtistName(a?.name || a)).filter(Boolean);
    const albumArtistIds = albumArtists.map(a => String(a?.id || "")).filter(Boolean);
    const primary = [];
    const secondary = [];
    trackArtists.forEach(artist => {
      const artistName = normalizeArtistName(artist?.name || artist);
      const artistId = String(artist?.id || "");
      if (albumArtistNames.includes(artistName) || (artistId && albumArtistIds.includes(artistId))) primary.push(artist);
      else secondary.push(artist);
    });
    if (primary.length > 0) return [...primary, ...secondary];
    return trackArtists;
  }

  function formatArtists(track, fallback = "Artista") {
    const artists = getDisplayArtists(track).map(a => a?.name || a).filter(Boolean);
    return artists.length ? artists.join(", ") : fallback;
  }

  async function formatArtistsForMainTrack(track, fallback = "Artista") {
    const artists = await getDisplayArtistsForMainTrack(track);
    const names = artists.map(a => a?.name || a).filter(Boolean);
    return names.length ? names.join(", ") : fallback;
  }

  function isLeoName(name) {
    const v = String(name || "").toLowerCase().trim();
    return v === "leo" || v.includes("leo");
  }

  function formatNumber(num) {
    return (num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function getUserId(key) { return USERS[key]?.id || key; }
  function getUserLabel(key) { return USERS[key]?.label || key; }
  function getUserEmoji(key) { return USERS[key]?.emoji || ""; }

  return {
    BASE_URL, API_BASE, LOGO_URL, USER_AVATAR_FALLBACK, PETER_AVATAR_FALLBACK, USERS, fm, cacheRoot, jsonDir, imgDir,
    fetchJSON, cachedJSON, cachedImage, placeholder, formatNumber, safeParse, fileAgeMs, fetchOnce, cleanupOldCache,
    normalizeArtistName, getTrackArtists, getAlbumArtists, getDisplayArtists, formatArtists, getTrackAlbumId,
    extractArtistsFromAlbum, getAlbumDetails, getDisplayArtistsForMainTrack, normalizeText, reorderArtistNamesByOwner,
    findAlbumOwnerForTopTrack, formatTopTrackArtists, withPeterFallback, isLeoName, formatArtistsForMainTrack,
    getUserId, getUserLabel, getUserEmoji
  };
})();

// ========================================================================
// 1. MODULE: SMALL NOW PLAYING & IN-APP DASHBOARD
// ========================================================================
const ModuleNowPlaying = (() => {
  const USER_ID = StatsCore.getUserId("leo");
  const FRIEND_KEYS = ["leo", "gab", "savio", "benny", "peter"];
  const RUNTIME_URL = `${StatsCore.BASE_URL}/statsfm_runtime.json`;

  const Theme = {
    bg: Color.dynamic(new Color("#F2F2F7"), new Color("#000000")),
    rowBg: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    headerBg: Color.dynamic(new Color("#E5E5EA"), new Color("#2C2C2E")),
    myHighlight: Color.dynamic(new Color("#FF8A00"), new Color("#FF9F0A")), // Destaque laranja vivo
    textPrimary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    textSecondary: Color.dynamic(new Color("#8E8E93"), new Color("#8E8E93")),
    accent: new Color("#FF3B30"), 
    chevron: Color.dynamic(new Color("#C7C7CC"), new Color("#5A5A5E")),
    medalColors: ["🥇", "🥈", "🥉", "🔹"]
  };
  const UI = {
    rowHeight: 52,
    compactRowHeight: 44,
    actionRowHeight: 55,
    sectionHeaderHeight: 35,
    sectionItemHeight: 50,
    titleFont: Font.boldSystemFont(13),
    subtitleFont: Font.systemFont(10),
    smallTitleFont: Font.boldSystemFont(12),
    rightFont: Font.systemFont(11),
    sectionFont: Font.boldSystemFont(11),
    chevronFont: Font.systemFont(16)
  };

  const fm = FileManager.local();
  const cacheDir = fm.joinPath(fm.documentsDirectory(), "statsfm_v43");
  if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

  let memoryCache = {}; 
  const safeJSONParse = StatsCore.safeParse;

  const SCREEN_BUNDLE_TTLS = Object.freeze({
    track: 10 * 60 * 1000,
    album: 30 * 60 * 1000,
    artist: 30 * 60 * 1000
  });

  function getTrackScreenBundleKey(trackId) { return `screen_track_v2_${trackId}`; }
  function getAlbumScreenBundleKey(albumId) { return `screen_album_v2_${albumId}`; }
  function getArtistScreenBundleKey(artistId) { return `screen_artist_v2_${artistId}`; }

  function stripImageObjects(value) {
    if (Array.isArray(value)) return value.map(stripImageObjects);

    if (value && typeof value === "object") {
      const clean = {};
      Object.keys(value).forEach(key => {
        if (key === "imageObj") return;
        clean[key] = stripImageObjects(value[key]);
      });
      return clean;
    }

    return value;
  }

  async function hydrateRankingImages(ranking = []) {
    if (!Array.isArray(ranking)) return [];

    for (const item of ranking) {
      if (!item) continue;
      if (!item.imageObj) {
        item.imageObj = await loadImage(item.img, 30, "👤") || createPlaceholder(30, "👤");
      }
    }

    return ranking;
  }

  function getMissingTrackBundleFields(bundle) {
    if (!bundle || typeof bundle !== "object") return { needsArtists: true, needsRanking: true, needsHistory: true };
    return {
      needsArtists: !Array.isArray(bundle.artists),
      needsRanking: !Array.isArray(bundle.trackRanking) || !Array.isArray(bundle.albumRanking) || !Array.isArray(bundle.artistRankings),
      needsHistory: !Array.isArray(bundle.history)
    };
  }

  function getMissingAlbumBundleFields(bundle) {
    if (!bundle || typeof bundle !== "object") return { needsAlbum: true, needsRanking: true };
    return { needsAlbum: !bundle.album, needsRanking: !Array.isArray(bundle.albumRanking) };
  }

  function getMissingArtistBundleFields(bundle) {
    if (!bundle || typeof bundle !== "object") return { needsArtist: true, needsRanking: true };
    return { needsArtist: !bundle.artist, needsRanking: !Array.isArray(bundle.artistRanking) };
  }

  function saveScreenBundle(key, payload) {
    if (!key || !payload || typeof payload !== "object") return false;
    const cachePath = fm.joinPath(cacheDir, key + '.json');
    const cleanPayload = stripImageObjects(payload);
    const bundle = { ...cleanPayload, fetchedAt: Date.now() };
    try {
      fm.writeString(cachePath, JSON.stringify(bundle));
      memoryCache[key] = { data: bundle, timestamp: Date.now() };
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadScreenBundle(key, ttlMs) {
    if (!key || !Number.isFinite(ttlMs) || ttlMs <= 0) return null;
    const now = Date.now();
    const fromMemory = memoryCache[key]?.data;
    if (fromMemory && typeof fromMemory === "object") {
      const fetchedAt = Number(fromMemory.fetchedAt);
      if (Number.isFinite(fetchedAt) && (now - fetchedAt) <= ttlMs) return fromMemory;
    }

    const cachePath = fm.joinPath(cacheDir, key + '.json');
    if (!fm.fileExists(cachePath)) return null;

    const cached = safeJSONParse(fm.readString(cachePath), null);
    if (!cached || typeof cached !== "object") return null;

    const fetchedAt = Number(cached.fetchedAt);
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
    if ((now - fetchedAt) > ttlMs) return null;

    memoryCache[key] = { data: cached, timestamp: now };
    return cached;
  }

  function createPlaceholder(size, emoji) { return StatsCore.placeholder(size, emoji); }
  async function loadImage(url, size = 44, emoji = "🎵") {
    if (!url) return null;
    return await StatsCore.cachedImage(url, size, emoji);
  }

  async function getCachedData(key, fetcher, maxAgeMinutes = 5) {
    const cachePath = fm.joinPath(cacheDir, key + '.json');
    const now = Date.now();
    if (memoryCache[key] && (now - memoryCache[key].timestamp < maxAgeMinutes * 60 * 1000)) return memoryCache[key].data;
    if (fm.fileExists(cachePath)) {
      const age = now - fm.modificationDate(cachePath).getTime();
      if (age < maxAgeMinutes * 60 * 1000) {
        try {
          const data = JSON.parse(fm.readString(cachePath));
          memoryCache[key] = { data, timestamp: now }; 
          return data;
        } catch (e) { fm.remove(cachePath); }
      }
    }
    const data = await fetcher();
    if (data) { 
        fm.writeString(cachePath, JSON.stringify(data)); 
        memoryCache[key] = { data, timestamp: now }; 
    }
    return data;
  }
  async function getRuntimeData() {
    return await getCachedData("runtime_global", () => StatsCore.fetchJSON(RUNTIME_URL), 15);
  }
  function enrichTrackFromRuntime(track, runtime) {
    if (!track || !runtime?.tracks) return track;
    const rt = runtime.tracks?.[String(track.id || "")];
    if (!rt) return track;
    return {
      ...track,
      name: track.name || rt.name,
      artists: (track.artists && track.artists.length > 0) ? track.artists : (rt.artists || []).map(a => typeof a === "string" ? { name: a } : a),
      albums: (track.albums && track.albums.length > 0) ? track.albums : (rt.albumId ? [{ id: rt.albumId, name: rt.albumName, image: rt.albumImage }] : []),
      album: track.album || (rt.albumId ? { id: rt.albumId, name: rt.albumName, image: rt.albumImage } : null),
      spotifyId: track.spotifyId || rt.spotifyId,
      externalIds: {
        ...(track.externalIds || {}),
        appleMusic: (track.externalIds?.appleMusic && track.externalIds.appleMusic.length > 0) ? track.externalIds.appleMusic : (rt.appleMusicId ? [rt.appleMusicId] : [])
      }
    };
  }

  async function getRankingsWithCache(trackId, albumId, artists) {
    const artistKey = (artists || []).map(a => a?.id).filter(Boolean).join("_");
    const cacheKey = `rankings_${trackId}_${albumId || 'noalbum'}_${artistKey || 'noartists'}`;
    const now = Date.now();
    if (memoryCache[cacheKey] && (now - memoryCache[cacheKey].timestamp < 60 * 60 * 1000)) return memoryCache[cacheKey].data;
    const rankings = await calculateRankings(trackId, albumId, artists);
    memoryCache[cacheKey] = { data: rankings, timestamp: now }; return rankings;
  }

  async function calculateRankings(trackId, albumId, artists) {
    let rankingPromises = FRIEND_KEYS.map(async (key) => {
      const id = StatsCore.getUserId(key);
      const name = StatsCore.getUserLabel(key);
      const infoReq = StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}`, 12);
      const trackReq = StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/tracks/${trackId}/stats`, 12);
      const albumReq = albumId ? StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/albums/${albumId}/stats`, 12) : Promise.resolve(null);
      const safeArtists = (artists || []).filter(a => a?.id);
      let artistReqs = safeArtists.map(a => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/artists/${a.id}/stats`, 12));
      
      const [info, trackStats, albumStats, ...artistStats] = await Promise.all([infoReq, trackReq, albumReq, ...artistReqs]);
      return { 
        name, id,
        img: StatsCore.withPeterFallback(id, info?.item?.image) || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp",
        trackCount: trackStats?.items?.count ?? trackStats?.item?.count ?? trackStats?.count ?? 0,
        albumCount: albumStats?.items?.count ?? albumStats?.item?.count ?? albumStats?.count ?? 0,
        artistCounts: artistStats.map(s => s?.items?.count ?? s?.item?.count ?? s?.count ?? 0)
      };
    });
    
    const settled = await Promise.allSettled(rankingPromises);
    const friendsData = settled.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
    
    for (let f of friendsData) { f.imageObj = await loadImage(f.img, 30, "👤") || createPlaceholder(30, "👤"); }
    return friendsData;
  }

  async function getArtistImage(artistId) {
    const cacheKey = `artist_${artistId}`;
    if (memoryCache[cacheKey]) return memoryCache[cacheKey];
    const artistData = await getCachedData(`artist_data_${artistId}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/artists/${artistId}`, 6), 24 * 60);
    let imgUrl = artistData?.item?.image || artistData?.item?.images?.[0]?.url;
    let img = await loadImage(imgUrl, 30, "🎤") || createPlaceholder(30, "🎤");
    memoryCache[cacheKey] = img; 
    return img;
  }

  async function fetchFriendsRecents() {
    const recentReqs = FRIEND_KEYS.map(async (key) => {
         const id = StatsCore.getUserId(key);
         const name = StatsCore.getUserLabel(key);
         const res = await getCachedData(`recent_50_${id}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/recent?limit=50`), 2);
         return { name, id, items: res?.items || [] };
    });
    return await Promise.all(recentReqs);
  }

  async function prewarmNowPlayingPostLoad(current, recentStreams = []) {
    if (!current?.id) return;

    const albumId = current.albums?.[0]?.id || current.album?.id;
    const artists = (current.artists || []).filter(a => a?.id);
    const recentTrackIds = [];
    for (const item of (recentStreams || []).slice(0, 5)) {
      const id = item?.track?.id;
      if (!id || id === current.id || recentTrackIds.includes(id)) continue;
      recentTrackIds.push(id);
      if (recentTrackIds.length >= 5) break;
    }

    const tasks = [
      () => getCachedData(`track_focus_${current.id}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/tracks/${current.id}`), 30),
      () => albumId ? getCachedData(`album_focus_${albumId}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/albums/${albumId}`), 60) : null,
      () => Promise.allSettled(artists.map(a => getCachedData(`artist_data_${a.id}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/artists/${a.id}`, 6), 24 * 60))),
      () => Promise.allSettled(recentTrackIds.map(id => getCachedData(`track_focus_${id}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/tracks/${id}`), 30))),
      () => getRankingsWithCache(current.id, albumId, artists)
    ];

    await Promise.allSettled(tasks.map(async (task) => {
      try { return await task(); } catch (_) { return null; }
    }));
  }

  async function renderProfileAndMenuRows(table, userData, customTrack, preloadedAvatarImg = null) {
    let profileRow = new UITableRow(); profileRow.height = 60; profileRow.backgroundColor = Theme.bg;
    let userImg = StatsCore.withPeterFallback(USER_ID, userData?.item?.image);
    let avatarImg = preloadedAvatarImg || (userImg ? await loadImage(userImg, 50, "👤") : null);
    let avCell = UITableCell.image(avatarImg || createPlaceholder(50, "👤"));
    avCell.widthWeight = 15; profileRow.addCell(avCell);
    let nameCell = UITableCell.text(userData?.item?.displayName || "Stats.fm User", "Seu Perfil");
    nameCell.titleColor = Theme.textPrimary; nameCell.subtitleColor = Theme.textSecondary; nameCell.widthWeight = 85; profileRow.addCell(nameCell);
    table.addRow(profileRow);

    addSectionHeader(table, "🌟 MULTI-USER & RANKINGS");
    addActionRow(table, {
      title: "ABRIR CENTRAL DE ESTATÍSTICAS",
      subtitle: "Hoje/agora, histórico, rankings e comparativos",
      icon: "📊",
      onSelect: async () => { await ModuleMediumDashboard.showStatsHub(); },
      height: UI.actionRowHeight
    });
    addActionRow(table, customTrack ? {
      title: "IR PARA NOW PLAYING ATUAL",
      subtitle: "Ver o que estou ouvindo agora",
      icon: "▶️",
      onSelect: async () => await showDashboard(null),
      height: UI.compactRowHeight
    } : {
      title: "ATUALIZAR",
      subtitle: "Recarregar dados atuais",
      icon: "🔄",
      onSelect: async () => await showDashboard(null),
      height: UI.compactRowHeight
    });
  }

  async function showDashboard(customTrack = null) {
    try {
      const [userDataRaw, recentStreamsRaw, runtimeData] = await Promise.all([
        getCachedData('user_global', () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${USER_ID}`), 5),
        getCachedData('recent_global', () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${USER_ID}/streams/recent?limit=50`), 5),
        getRuntimeData()
      ]);
      
      let userData = userDataRaw;
      let recentStreams = recentStreamsRaw?.items || [];
      let current = customTrack ? customTrack : recentStreams[0]?.track;
      current = enrichTrackFromRuntime(current, runtimeData);

      if (!current) { 
        let alert = new Alert(); alert.title = "Dados Indisponíveis"; alert.message = "A conexão falhou."; alert.addCancelAction("Voltar"); 
        await alert.presentAlert(); return; 
      }

      const trackBundleKey = getTrackScreenBundleKey(current.id);
      const trackBundle = loadScreenBundle(trackBundleKey, SCREEN_BUNDLE_TTLS.track);
      const trackBundleMissing = getMissingTrackBundleFields(trackBundle);

      const albumId = current.albums?.[0]?.id || current.album?.id;
      const albumName = current.albums?.[0]?.name || current.album?.name || "Álbum Desconhecido";

      prewarmNowPlayingPostLoad(current, recentStreams).catch(_ => {});
      const albumImgUrl = current.albums?.[0]?.image || current.album?.image;
      const userImgUrl = StatsCore.withPeterFallback(USER_ID, userData?.item?.image);
      const displayArtistsPromise = trackBundleMissing.needsArtists
        ? StatsCore.getDisplayArtistsForMainTrack(current)
        : Promise.resolve(trackBundle.artists);
      const historyPromise = trackBundleMissing.needsHistory
        ? getCachedData(`history_${current.id}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${USER_ID}/streams/tracks/${current.id}`, 10), 60)
        : Promise.resolve({ items: trackBundle.history });
      const [coverImg, avatarImg] = await Promise.all([
        loadImage(albumImgUrl, 200, "🎵"),
        loadImage(userImgUrl, 50, "👤")
      ]);
      const displayArtists = await displayArtistsPromise;

      let artistImagesMap = {};
      for (let artist of (current.artists || [])) {
          if(artist && artist.id) artistImagesMap[artist.id] = await getArtistImage(artist.id);
      }

      const friendsData = trackBundleMissing.needsRanking
        ? await getRankingsWithCache(current.id, albumId, current.artists || [])
        : trackBundle.trackRanking;
      const trackRanking = Array.isArray(trackBundle?.trackRanking)
        ? trackBundle.trackRanking
        : friendsData.map(f => ({...f, count: f.trackCount})).filter(r => r.count > 0).sort((a, b) => b.count - a.count);
      const albumRanking = Array.isArray(trackBundle?.albumRanking)
        ? trackBundle.albumRanking
        : friendsData.map(f => ({...f, count: f.albumCount})).filter(r => r.count > 0).sort((a, b) => b.count - a.count);
      const artistRankings = Array.isArray(trackBundle?.artistRankings)
        ? trackBundle.artistRankings
        : displayArtists.map((artist) => {
            const originalIdx = (current.artists || []).findIndex(a => a?.id && artist?.id && a.id === artist.id);
            if (!artist?.id || originalIdx < 0) return null;
            return { artistId: artist.id, artistName: artist.name || "Desconhecido", ranking: friendsData.map(f => ({...f, count: f.artistCounts[originalIdx]})).filter(r => r.count > 0).sort((a, b) => b.count - a.count) };
        }).filter(Boolean);

      await hydrateRankingImages(trackRanking);
      await hydrateRankingImages(albumRanking);
      for (const ar of artistRankings) {
        if (!ar) continue;
        ar.ranking = await hydrateRankingImages(ar.ranking);
      }

      const historyData = Array.isArray(trackBundle?.history)
        ? { items: trackBundle.history }
        : await historyPromise;

      if (!trackBundle || trackBundleMissing.needsArtists || trackBundleMissing.needsRanking || trackBundleMissing.needsHistory) {
        saveScreenBundle(trackBundleKey, {
          track: current,
          album: albumId ? { id: albumId, name: albumName, image: albumImgUrl } : null,
          artists: displayArtists,
          trackRanking,
          albumRanking,
          artistRankings,
          history: Array.isArray(historyData?.items) ? historyData.items : []
        });
      }

      let table = new UITable(); table.showSeparators = true;
      
      await renderProfileAndMenuRows(table, userData, customTrack, avatarImg);

      let headerRow = new UITableRow(); headerRow.height = 220; headerRow.backgroundColor = Theme.bg;
      let imgCell = UITableCell.image(coverImg || createPlaceholder(200, "🎵"));
      imgCell.centerAligned(); headerRow.addCell(imgCell); table.addRow(headerRow);

      addSectionHeader(table, "📊 DETALHES DA FAIXA");
      addInfoRow(table, "🎵 Faixa", current.name || "Desconhecido", `statsfm://track/${current.id}`);
      if (albumId) addInfoRow(table, "💿 Álbum", albumName, `statsfm://album/${albumId}`);
      displayArtists.forEach(a => { if(a && a.id) addInfoRow(table, "🎤 Artista", a.name || "Desconhecido", `statsfm://artist/${a.id}`) });

      async function renderRankingSection(title, ranking, headerImg, options = {}) {
        const { showEmptyState = false, summary = null } = options;
        if (ranking.length === 0 && !showEmptyState) return;
        addSectionHeader(table, title, headerImg);
        if (summary) {
          let summaryRow = new UITableRow(); summaryRow.height = UI.compactRowHeight; summaryRow.backgroundColor = Theme.rowBg;
          let summaryCell = UITableCell.text(summary.title, summary.subtitle || "");
          summaryCell.titleColor = Theme.textPrimary; summaryCell.subtitleColor = Theme.textSecondary;
          summaryCell.titleFont = Font.boldSystemFont(11); summaryCell.subtitleFont = Font.systemFont(9);
          summaryRow.addCell(summaryCell);
          table.addRow(summaryRow);
        }
        if (ranking.length === 0) {
          let emptyRow = new UITableRow(); emptyRow.height = UI.compactRowHeight; emptyRow.backgroundColor = Theme.rowBg;
          let emptyCell = UITableCell.text("Sem streams registrados entre amigos");
          emptyCell.titleColor = Theme.textSecondary; emptyCell.titleFont = Font.italicSystemFont(10);
          emptyRow.addCell(emptyCell);
          table.addRow(emptyRow);
          return;
        }
        for (let i = 0; i < ranking.length; i++) {
          let item = ranking[i];
          let rRow = new UITableRow(); rRow.height = UI.sectionItemHeight; rRow.backgroundColor = Theme.rowBg;
          rRow.onSelect = () => Safari.open(`statsfm://user/${item.id}`); 
          const rankingImg = item.imageObj && typeof item.imageObj === "object" && typeof item.imageObj.size === "object"
            ? item.imageObj
            : (await loadImage(item.img, 30, "👤") || createPlaceholder(30, "👤"));
          let fCell = UITableCell.image(rankingImg); fCell.widthWeight = 12; rRow.addCell(fCell);
          let mCell = UITableCell.text(Theme.medalColors[i] || "🔹"); mCell.widthWeight = 8; mCell.centerAligned(); rRow.addCell(mCell);
          let safeName = item.name ? String(item.name).toUpperCase() : "DESCONHECIDO";
          const isLeo = StatsCore.isLeoName(item.name);
          let nCell = UITableCell.text(safeName); nCell.titleColor = Theme.textPrimary; 
          if (isLeo) nCell.titleColor = Theme.myHighlight; 
          nCell.titleFont = UI.smallTitleFont; nCell.widthWeight = 42; rRow.addCell(nCell);
          let sCell = UITableCell.text(`${item.count.toLocaleString('pt-BR')} STREAMS`); sCell.titleColor = isLeo ? Theme.myHighlight : Theme.textSecondary; sCell.rightAligned(); sCell.titleFont = UI.rightFont; sCell.widthWeight = 33; rRow.addCell(sCell);
          let chev = UITableCell.text("↗"); chev.titleColor = isLeo ? Theme.myHighlight : Theme.chevron; chev.rightAligned(); chev.widthWeight = 5; rRow.addCell(chev);
          table.addRow(rRow);
        }
      }

      await renderRankingSection(`RANKING ${current.name || ""}`, trackRanking, coverImg);
      if (albumId) await renderRankingSection(`RANKING ${albumName}`, albumRanking, coverImg);
      for (const ar of artistRankings) {
        const leader = ar.ranking[0];
        const summary = leader ? {
          title: `${leader.name} lidera com ${leader.count.toLocaleString('pt-BR')} streams`,
          subtitle: `${ar.ranking.length} amigos têm streams deste artista`
        } : {
          title: "Sem streams registrados entre amigos",
          subtitle: "Ranking calculado para este artista"
        };
        await renderRankingSection(`🎤 ARTISTA: ${(ar.artistName || "Desconhecido").toUpperCase()}`, ar.ranking, artistImagesMap[ar.artistId], {
          showEmptyState: true,
          summary
        });
      }

      addSectionHeader(table, "🎧 DISPONÍVEL EM");
      const amId = current.externalIds?.appleMusic?.[0];
      if (amId) { const amUrl = `https://music.apple.com/br/song/${amId}`; addLinkRow(table, "🍎 ABRIR NO APPLE MUSIC", amUrl, false); }
      const spotId = current.spotifyId || current.externalIds?.spotify?.[0];
      if (spotId) { const spotUrl = `spotify:track:${spotId}`; addLinkRow(table, "🎧 ABRIR NO SPOTIFY", spotUrl, false); }

      addSectionHeader(table, "🕒 ÚLTIMAS VEZES QUE OUVI ESTA FAIXA");
      let history = historyData?.items || [];
      if (history.length === 0) {
          let emptyRow = new UITableRow(); emptyRow.height = 40; emptyRow.backgroundColor = Theme.rowBg;
          let emptyCell = UITableCell.text("Nenhum histórico recente encontrado."); emptyCell.titleColor = Theme.textSecondary; emptyCell.titleFont = Font.italicSystemFont(12); emptyRow.addCell(emptyCell); table.addRow(emptyRow);
      } else {
          history.slice(0, 5).forEach(item => {
            let rawDate = item.endTime || item.playedAt;
            if(!rawDate) return; 
            let d = new Date(rawDate);
            let dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} às ${d.getHours().toString().padStart(2, '0')}h${d.getMinutes().toString().padStart(2, '0')}`;
            let hRow = new UITableRow(); hRow.height = 44; hRow.backgroundColor = Theme.rowBg;
            let iconCell = UITableCell.text("🎧"); iconCell.widthWeight = 10; hRow.addCell(iconCell);
            let hCell = UITableCell.text(dateStr); hCell.titleColor = Theme.textPrimary; hCell.titleFont = Font.systemFont(13); hCell.widthWeight = 80; hRow.addCell(hCell);
            let chev = UITableCell.text("›"); chev.titleColor = Theme.chevron; chev.rightAligned(); chev.widthWeight = 10; hRow.addCell(chev);
            hRow.onSelect = async () => {
                let dur = item.durationMs || item.msPlayed || 0;
                let durStr = dur > 0 ? `${Math.floor(dur / 60000)}m ${Math.floor((dur % 60000) / 1000)}s` : "Tempo não registrado";
                let platStr = item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : (item.source || "Apple Music");
                let alert = new Alert(); alert.title = "Detalhes da Sessão"; alert.message = `Ouviu esta faixa em:\n${dateStr}\n\n⏱️ Tempo ouvido: ${durStr}\n📱 Origem: ${platStr}`; alert.addCancelAction("Fechar"); await alert.presentAlert(); 
            };
            table.addRow(hRow);
          });
      }

      addSectionHeader(table, "🔄 REPRODUÇÕES RECENTES");
      for (let item of recentStreams.slice(0, 50)) {
        if(!item.track) continue; 
        let trackItem = item.track;
        let rRow = new UITableRow(); rRow.height = 55; rRow.backgroundColor = Theme.rowBg;
        let trackArt = await loadImage(trackItem.albums?.[0]?.image || trackItem.album?.image);
        let cCell = UITableCell.image(trackArt || createPlaceholder(40, "🎵")); cCell.widthWeight = 12; rRow.addCell(cCell);
        let spacer = UITableCell.text(""); spacer.widthWeight = 3; rRow.addCell(spacer);
        let artistsStr = await StatsCore.formatArtistsForMainTrack(trackItem, "Desconhecido");
        let tCell = UITableCell.text(trackItem.name || "Faixa Desconhecida", artistsStr); 
        tCell.titleColor = Theme.textPrimary; tCell.subtitleColor = Theme.textSecondary; tCell.titleFont = Font.boldSystemFont(12); tCell.subtitleFont = Font.systemFont(10); tCell.widthWeight = 55; rRow.addCell(tCell);
        let rawDate = item.endTime || item.playedAt;
        let timeCell = UITableCell.text(rawDate ? getTimeAgoSmart(new Date(rawDate)) : "Tempo instável"); 
        timeCell.titleColor = Theme.textSecondary; timeCell.rightAligned(); timeCell.titleFont = Font.systemFont(10); timeCell.widthWeight = 25; rRow.addCell(timeCell);
        let chevCell = UITableCell.text("›"); chevCell.titleColor = Theme.chevron; chevCell.rightAligned(); chevCell.widthWeight = 5; rRow.addCell(chevCell);

        rRow.onSelect = async () => { await showDashboard(trackItem); };
        table.addRow(rRow);
      }
      
      await table.present();
    } catch (criticalError) {
      let alert = new Alert(); alert.title = "Erro Crítico no App 🚨"; alert.message = `Algo deu errado.\n\n${String(criticalError)}`; alert.addCancelAction("OK"); await alert.presentAlert();
    }
  }

  function addSectionHeader(table, title, img = null) {
    let row = new UITableRow(); row.backgroundColor = Theme.headerBg; row.height = UI.sectionHeaderHeight;
    if (img) { let ic = UITableCell.image(img); ic.widthWeight = 10; row.addCell(ic); }
    let cell = UITableCell.text(String(title).toUpperCase()); cell.titleFont = UI.sectionFont; cell.titleColor = Theme.textSecondary; cell.widthWeight = img ? 90 : 100;
    row.addCell(cell); table.addRow(row);
  }

  function addInfoRow(table, label, value, url) {
    addActionRow(table, {
      title: String(label),
      subtitle: String(value),
      onSelect: () => Safari.open(url),
      height: UI.actionRowHeight,
      titleColor: Theme.textSecondary,
      subtitleColor: Theme.textPrimary,
      titleFont: Font.systemFont(10),
      subtitleFont: Font.boldSystemFont(14)
    });
  }

  function addLinkRow(table, label, url, isCopy) {
    addActionRow(table, {
      title: String(label).toUpperCase(),
      onSelect: () => { if (isCopy) { Pasteboard.copyString(url); } else { Safari.open(url); } },
      height: 40,
      titleFont: Font.systemFont(11)
    });
  }
  function addActionRow(table, { title, subtitle = "", icon = "", onSelect, height = UI.actionRowHeight, titleColor = Theme.textPrimary, subtitleColor = Theme.textSecondary, titleFont = UI.titleFont, subtitleFont = UI.subtitleFont }) {
    let row = new UITableRow();
    row.backgroundColor = Theme.rowBg;
    row.height = height;
    let cell = UITableCell.text(`${icon ? icon + " " : ""}${title}`, subtitle);
    cell.titleColor = titleColor;
    cell.subtitleColor = subtitleColor;
    cell.titleFont = titleFont;
    cell.subtitleFont = subtitleFont;
    cell.widthWeight = 90;
    row.addCell(cell);
    let chev = UITableCell.text("↗");
    chev.titleColor = Theme.chevron;
    chev.titleFont = UI.chevronFont;
    chev.rightAligned();
    chev.widthWeight = 10;
    row.addCell(chev);
    row.onSelect = onSelect;
    table.addRow(row);
  }

  function getTimeAgoSmart(date) {
    if (isNaN(date)) return "Recente";
    const now = new Date(); const diffMins = Math.floor((now - date) / 60000); const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 3) return "ouvindo agora";
    const hours = date.getHours().toString().padStart(2, '0'); const minutes = date.getMinutes().toString().padStart(2, '0'); const timeStr = `${hours}h${minutes}`;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (dateDay.getTime() === today.getTime()) return diffMins < 60 ? `${diffMins}min atrás, ${timeStr}` : `${diffHours}h atrás, ${timeStr}`;
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (dateDay.getTime() === yesterday.getTime()) return `ontem ${timeStr}`;
    const day = date.getDate().toString().padStart(2, '0'); const month = (date.getMonth() + 1).toString().padStart(2, '0'); return `${day}/${month} ${timeStr}`;
  }

  async function createSmall() {
    const userURL = `https://api.stats.fm/api/v1/users/${USER_ID}`;
    const recentURL = `https://api.stats.fm/api/v1/users/${USER_ID}/streams/recent`;
    
    const [user, recent] = await Promise.all([
      getCachedData('widget_user', () => StatsCore.fetchJSON(userURL), 60),
      getCachedData('widget_recent', () => StatsCore.fetchJSON(recentURL), 5)
    ]);
    
    const stream = recent?.items?.[0];
    if (!stream || !stream.track) return new ListWidget();
    
    const track = stream.track;
    const artistList = track.artists?.map(a => a.name || "Desconhecido").join(", ") ?? "Artista";
    const title = track.name ?? "Faixa";
    const coverUrl = track.albums?.[0]?.image || track.album?.image;
    
    const [coverImg, logoImgRaw, avatarImg] = await Promise.all([
      loadImage(coverUrl),
      loadImage("https://i.imgur.com/OFCufao.png"),
      loadImage(StatsCore.withPeterFallback(USER_ID, user?.item?.image) || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp")
    ]);
    
    let w = new ListWidget(); w.setPadding(12, 12, 10, 12);
    let bg = new LinearGradient(); bg.colors = [new Color("#2d2d2d"), new Color("#141414")]; w.backgroundGradient = bg;
    
    let main = w.addStack(); main.layoutVertically();
    let top = main.addStack(); let cimg = top.addImage(coverImg ?? createPlaceholder(80, "🎵")); cimg.imageSize = new Size(80, 80); cimg.cornerRadius = 12;
    top.addSpacer(20);
    
    let side = top.addStack(); side.layoutVertically();
    let logoImg = side.addImage(logoImgRaw ?? createPlaceholder(30, "🎶")); logoImg.imageSize = new Size(30, 30); logoImg.cornerRadius = 8; side.addSpacer(10);
    let av = side.addImage(avatarImg ?? createPlaceholder(30, "👤")); av.imageSize = new Size(30, 30); av.cornerRadius = 15;
    
    main.addSpacer(8);
    let art = main.addText(artistList); art.font = Font.boldSystemFont(11); art.textColor = Color.white(); art.lineLimit = 2;
    main.addSpacer(1);
    let tit = main.addText(title); tit.font = Font.mediumSystemFont(10); tit.textColor = Color.white(); tit.lineLimit = 2;
    
    const playedAtRaw = stream.endTime || stream.playedAt;
    let playedAt = playedAtRaw ? (typeof playedAtRaw === "number" ? playedAtRaw * 1000 : Date.parse(playedAtRaw)) : Date.now();
    
    main.addSpacer(3);
    let rel = main.addText(getTimeAgoSmart(new Date(playedAt))); rel.font = Font.regularSystemFont(8); rel.textColor = Color.white(); rel.textOpacity = 0.5;
    
    return w;
  }

  async function showTrackFocus(trackId) {
    return await showTrackById(trackId);
  }

  async function showTrackById(trackId) {
    const trackData = await getCachedData(`track_focus_${trackId}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/tracks/${trackId}`), 30);
    const trackObj = trackData?.item || trackData;
    if (!trackObj) {
        let alert = new Alert();
        alert.title = "Faixa indisponível";
        alert.message = "Não foi possível carregar esta música.";
        alert.addCancelAction("OK");
        await alert.presentAlert();
        return;
    }
    await showDashboard(trackObj);
  }

  async function showAlbumFocus(albumId) {
    const userData = await getCachedData('user_global', () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${USER_ID}`), 5);
    const albumBundleKey = getAlbumScreenBundleKey(albumId);
    const albumBundle = loadScreenBundle(albumBundleKey, SCREEN_BUNDLE_TTLS.album);
    const albumBundleMissing = getMissingAlbumBundleFields(albumBundle);
    const albumData = albumBundleMissing.needsAlbum ? await getCachedData(`album_focus_${albumId}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/albums/${albumId}`), 60) : { item: albumBundle.album };
    const album = albumData?.item;
    if (!album) return await showDashboard(null);
    const albumName = album?.name || "Álbum";
    const albumImg = await loadImage(album?.image) || createPlaceholder(180, "💿");
    const artists = Array.isArray(album?.artists) ? album.artists : [];
    
    let ranking = Array.isArray(albumBundle?.albumRanking) ? albumBundle.albumRanking : null;
    if (!ranking) {
      let rankingPromises = FRIEND_KEYS.map(async (key) => {
        const id = StatsCore.getUserId(key);
        const name = StatsCore.getUserLabel(key);
        const infoReq = StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}`);
        const albumReq = StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/albums/${albumId}/stats`);
        const [info, albumStats] = await Promise.all([infoReq, albumReq]);
        return { name, id, img: StatsCore.withPeterFallback(id, info?.item?.image) || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp", albumCount: albumStats?.items?.count ?? albumStats?.item?.count ?? albumStats?.count ?? 0 };
      });
      const settled = await Promise.allSettled(rankingPromises);
      ranking = settled.filter(r => r.status === "fulfilled" && r.value).map(r => r.value).sort((a,b)=>b.albumCount-a.albumCount);
    }
    if (!albumBundle || albumBundleMissing.needsAlbum || albumBundleMissing.needsRanking) {
      saveScreenBundle(albumBundleKey, { album, albumRanking: ranking || [] });
    }
    ranking = await hydrateRankingImages(ranking);

    const recents = await fetchFriendsRecents();

    let table = new UITable(); table.showSeparators = true;
    await renderProfileAndMenuRows(table, userData, true);

    let cover = new UITableRow(); cover.height = 220; cover.backgroundColor = Theme.bg; let cimg = UITableCell.image(albumImg); cimg.centerAligned(); cover.addCell(cimg); table.addRow(cover);
    
    addSectionHeader(table, `📊 DETALHES DO ÁLBUM`);
    addInfoRow(table, "💿 Álbum", albumName, `statsfm://album/${albumId}`);
    artists.forEach(a => { if(a && a.id) addInfoRow(table, "🎤 Artista", a.name || "Desconhecido", `statsfm://artist/${a.id}`) });

    addSectionHeader(table, `RANKING ${albumName}`, albumImg);
    ranking.forEach((item, i) => { 
        if(item.albumCount === 0) return;
        let row = new UITableRow(); row.height = 50; row.backgroundColor = Theme.rowBg; row.onSelect = () => Safari.open(`statsfm://user/${item.id}`); 
        let f = UITableCell.image(item.imageObj); f.widthWeight = 12; row.addCell(f); 
        let m = UITableCell.text(Theme.medalColors[i]||"🔹"); m.widthWeight = 8; m.centerAligned(); row.addCell(m); 
        const isLeoA = StatsCore.isLeoName(item.name); 
        let n = UITableCell.text(item.name.toUpperCase(), `${item.albumCount.toLocaleString('pt-BR')} STREAMS`); n.titleColor = Theme.textPrimary; 
        if (isLeoA) row.backgroundColor = Theme.myHighlight; 
        n.subtitleColor = Theme.textSecondary; n.widthWeight = 80; row.addCell(n); table.addRow(row); 
    });

    addSectionHeader(table, "🔄 REPRODUÇÕES RECENTES DO ÁLBUM (AMIGOS)");
    let foundAny = false;
    for (let userRecent of recents) {
         const filtered = userRecent.items.filter(i => i.track?.albums?.[0]?.id === albumId || i.track?.album?.id === albumId).slice(0, 5);
         if (filtered.length > 0) {
             foundAny = true;
             let headerR = new UITableRow(); headerR.backgroundColor = Theme.headerBg;
             let userTxt = headerR.addText(`👤 ${userRecent.name}`); userTxt.titleColor = Theme.textSecondary; userTxt.titleFont = Font.boldSystemFont(11);
             table.addRow(headerR);
             for (let item of filtered) {
                 let row = new UITableRow(); row.height = 45; row.backgroundColor = Theme.rowBg;
                 const timeStr = item.endTime || item.playedAt ? getTimeAgoSmart(new Date(item.endTime || item.playedAt)) : "";
                 let tCell = UITableCell.text(item.track.name, timeStr);
                 tCell.titleColor = Theme.textPrimary; tCell.subtitleColor = Theme.textSecondary; tCell.titleFont = Font.boldSystemFont(11); tCell.subtitleFont = Font.systemFont(9);
                 row.addCell(tCell);
                 row.onSelect = async () => await showDashboard(item.track);
                 table.addRow(row);
             }
         }
    }
    if (!foundAny) {
        let empty = new UITableRow(); empty.backgroundColor = Theme.rowBg; empty.height = 40;
        let cell = empty.addText("Nenhuma reprodução recente nas últimas 50 faixas."); cell.titleColor = Theme.textSecondary; cell.titleFont = Font.italicSystemFont(10);
        table.addRow(empty);
    }
    
    await table.present();
  }
  async function getAlbumRankingOnly(albumId) {
    const rankingPromises = FRIEND_KEYS.map(async key => {
      const id = StatsCore.getUserId(key);
      const name = StatsCore.getUserLabel(key);
      const [info, albumStats] = await Promise.all([
        StatsCore.fetchJSON(`${StatsCore.API_BASE}/users/${id}`),
        StatsCore.fetchJSON(`${StatsCore.API_BASE}/users/${id}/streams/albums/${albumId}/stats`)
      ]);
      return {
        name,
        id,
        img: StatsCore.withPeterFallback(id, info?.item?.image) || StatsCore.USER_AVATAR_FALLBACK,
        albumCount: albumStats?.items?.count ?? albumStats?.item?.count ?? albumStats?.count ?? 0
      };
    });
    const settled = await Promise.allSettled(rankingPromises);
    const friends = settled.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
    for (let f of friends) f.imageObj = await loadImage(f.img) || createPlaceholder(30, "👤");
    return friends;
  }

  async function showAlbumRanking(albumId, albumName = "") {
    const friendsData = await getAlbumRankingOnly(albumId);
    const ranking = friendsData.map(f => ({ ...f, count: f.albumCount })).filter(r => r.count > 0).sort((a, b) => b.count - a.count);
    let table = new UITable(); table.showSeparators = true;
    addSectionHeader(table, `💿 RANKING DO ÁLBUM`);
    let titleRow = new UITableRow(); titleRow.height = UI.compactRowHeight; titleRow.backgroundColor = Theme.rowBg;
    let titleCell = UITableCell.text(albumName || `Álbum ${albumId}`);
    titleCell.titleColor = Theme.textPrimary; titleCell.titleFont = UI.titleFont; titleRow.addCell(titleCell); table.addRow(titleRow);
    if (ranking.length === 0) {
      let emptyRow = new UITableRow(); emptyRow.height = UI.compactRowHeight; emptyRow.backgroundColor = Theme.rowBg;
      let emptyCell = UITableCell.text("Sem streams registrados entre amigos");
      emptyCell.titleColor = Theme.textSecondary; emptyCell.titleFont = Font.italicSystemFont(10); emptyRow.addCell(emptyCell); table.addRow(emptyRow);
    } else {
      ranking.forEach((item, i) => {
        let row = new UITableRow(); row.height = UI.sectionItemHeight; row.backgroundColor = Theme.rowBg; row.onSelect = () => Safari.open(`statsfm://user/${item.id}`);
        let f = UITableCell.image(item.imageObj); f.widthWeight = 12; row.addCell(f);
        let m = UITableCell.text(Theme.medalColors[i] || "🔹"); m.widthWeight = 8; m.centerAligned(); row.addCell(m);
        let n = UITableCell.text((item.name || "DESCONHECIDO").toUpperCase()); n.titleColor = Theme.textPrimary; n.titleFont = UI.smallTitleFont; n.widthWeight = 42; row.addCell(n);
        let s = UITableCell.text(`${item.count.toLocaleString('pt-BR')} STREAMS`); s.titleColor = Theme.textSecondary; s.rightAligned(); s.titleFont = UI.rightFont; s.widthWeight = 33; row.addCell(s);
        let chev = UITableCell.text("↗"); chev.titleColor = Theme.chevron; chev.rightAligned(); chev.widthWeight = 5; row.addCell(chev);
        table.addRow(row);
      });
    }
    await table.present();
  }

  async function showArtistFocus(artistId) {
    const userData = await getCachedData('user_global', () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${USER_ID}`), 5);
    const artistBundleKey = getArtistScreenBundleKey(artistId);
    const artistBundle = loadScreenBundle(artistBundleKey, SCREEN_BUNDLE_TTLS.artist);
    const artistBundleMissing = getMissingArtistBundleFields(artistBundle);
    const artistData = artistBundleMissing.needsArtist ? await getCachedData(`artist_focus_${artistId}`, () => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/artists/${artistId}`), 60) : { item: artistBundle.artist };
    const artistName = artistData?.item?.name || "Artista";
    const artistImg = await loadImage(artistData?.item?.image || artistData?.item?.images?.[0]?.url) || createPlaceholder(120, "🎤");

    let ranking = Array.isArray(artistBundle?.artistRanking) ? artistBundle.artistRanking : null;
    if (!ranking) {
      const rankingPromises = FRIEND_KEYS.map(async (key) => {
        const id = StatsCore.getUserId(key);
        const name = StatsCore.getUserLabel(key);
        const infoReq = StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}`);
        const artistReq = StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/artists/${artistId}/stats`);
        const [info, artistStats] = await Promise.all([infoReq, artistReq]);
        return {
          name, id,
          img: StatsCore.withPeterFallback(id, info?.item?.image) || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp",
          count: artistStats?.items?.count ?? artistStats?.item?.count ?? artistStats?.count ?? 0
        };
      });
      const settled = await Promise.allSettled(rankingPromises);
      ranking = settled.filter(r => r.status === "fulfilled" && r.value).map(r => r.value).filter(r => r.count > 0).sort((a,b) => b.count - a.count);
    }
    if (!artistBundle || artistBundleMissing.needsArtist || artistBundleMissing.needsRanking) {
      saveScreenBundle(artistBundleKey, { artist: artistData?.item || null, artistRanking: ranking || [] });
    }
    ranking = await hydrateRankingImages(ranking);

    const recents = await fetchFriendsRecents();

    let table = new UITable(); table.showSeparators = true;
    await renderProfileAndMenuRows(table, userData, true);
    
    let cover = new UITableRow(); cover.height = 220; cover.backgroundColor = Theme.bg; let cimg = UITableCell.image(artistImg); cimg.centerAligned(); cover.addCell(cimg); table.addRow(cover);
    
    addSectionHeader(table, `🎤 RANKING: ${artistName}`, artistImg);
    ranking.forEach((item, i) => {
      let row = new UITableRow(); row.height = UI.sectionItemHeight; row.backgroundColor = Theme.rowBg;
      row.onSelect = () => Safari.open(`statsfm://user/${item.id}`);
      let fCell = UITableCell.image(item.imageObj); fCell.widthWeight = 12; row.addCell(fCell);
      let mCell = UITableCell.text(Theme.medalColors[i] || "🔹"); mCell.widthWeight = 8; mCell.centerAligned(); row.addCell(mCell);
      const isLeo = StatsCore.isLeoName(item.name);
      let n = UITableCell.text(item.name.toUpperCase()); n.titleColor = isLeo ? Theme.myHighlight : Theme.textPrimary; n.titleFont = UI.smallTitleFont; n.widthWeight = 42; row.addCell(n);
      let s = UITableCell.text(`${item.count.toLocaleString('pt-BR')} STREAMS`); s.titleColor = isLeo ? Theme.myHighlight : Theme.textSecondary; s.rightAligned(); s.titleFont = UI.rightFont; s.widthWeight = 33; row.addCell(s);
      let chev = UITableCell.text("↗"); chev.titleColor = Theme.chevron; chev.rightAligned(); chev.widthWeight = 5; row.addCell(chev);
      table.addRow(row);
    });

    addSectionHeader(table, "🔄 REPRODUÇÕES RECENTES DO ARTISTA (AMIGOS)");
    let foundAny = false;
    for (let userRecent of recents) {
         const filtered = userRecent.items.filter(i => i.track?.artists?.some(a => String(a.id) === String(artistId))).slice(0, 5);
         if (filtered.length > 0) {
             foundAny = true;
             let headerR = new UITableRow(); headerR.backgroundColor = Theme.headerBg;
             let userTxt = headerR.addText(`👤 ${userRecent.name}`); userTxt.titleColor = Theme.textSecondary; userTxt.titleFont = Font.boldSystemFont(11);
             table.addRow(headerR);
             for (let item of filtered) {
                 let row = new UITableRow(); row.height = 45; row.backgroundColor = Theme.rowBg;
                 const timeStr = item.endTime || item.playedAt ? getTimeAgoSmart(new Date(item.endTime || item.playedAt)) : "";
                 let artistsStr = await StatsCore.formatArtistsForMainTrack(item.track, "Desconhecido");
                 let tCell = UITableCell.text(item.track.name, `${artistsStr} • ${timeStr}`);
                 tCell.titleColor = Theme.textPrimary; tCell.subtitleColor = Theme.textSecondary; tCell.titleFont = Font.boldSystemFont(11); tCell.subtitleFont = Font.systemFont(9);
                 row.addCell(tCell);
                 row.onSelect = async () => await showDashboard(item.track);
                 table.addRow(row);
             }
         }
    }
    if (!foundAny) {
        let empty = new UITableRow(); empty.backgroundColor = Theme.rowBg; empty.height = 40;
        let cell = empty.addText("Nenhuma reprodução recente nas últimas 50 faixas."); cell.titleColor = Theme.textSecondary; cell.titleFont = Font.italicSystemFont(10);
        table.addRow(empty);
    }
    
    await table.present();
  }

  return { createSmall, showDashboard, showArtistFocus, showTrackFocus, showTrackById, showAlbumFocus, showAlbumRanking };
})();

// ========================================================================
// 2. MODULE: SMALL TODAY STATS
// ========================================================================
const ModuleTodayStats = (() => {
  const MY_ID = "leo";
  const FRIENDS_IDS = ["gab", "savio", "peter"];
  const LOGO_URL = "https://i.imgur.com/OFCufao.png";

  const BASE_URL = "https://raw.githubusercontent.com/leosaquetto/statsam/main";
  const RAPIDO_URL = `${BASE_URL}/statsfm_rapido.json`;
  const PESADO_URL = `${BASE_URL}/statsfm_pesado.json`;

  const fm = FileManager.local();
  const cacheDir = fm.joinPath(fm.documentsDirectory(), "statsfm_small");
  if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

  const safeJSONParse = StatsCore.safeParse;

  function getRealId(userId) { return StatsCore.getUserId(userId); }
  function getFileAgeMs(path) { if (!fm.fileExists(path)) return Infinity; return Date.now() - fm.modificationDate(path).getTime(); }

  function getPlaceholder(size, emoji) { return StatsCore.placeholder(size, emoji); }

  function parseDateSafe(value) { if (!value) return null; const d = new Date(value); return isNaN(d.getTime()) ? null : d; }
  function getRapidoAgeMs(rapido) { const d = parseDateSafe(rapido?.lastUpdateBR || rapido?.lastUpdate); if (!d) return Infinity; return Date.now() - d.getTime(); }

  function formatUpdateTime(lastUpdateBR) {
    if (!lastUpdateBR) return "sem atualização";
    try {
      const updateDate = new Date(lastUpdateBR);
      if (isNaN(updateDate.getTime())) return "sem atualização";
      const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const updateDay = new Date(updateDate.getFullYear(), updateDate.getMonth(), updateDate.getDate());
      const hours = updateDate.getHours().toString().padStart(2, "0"); const minutes = updateDate.getMinutes().toString().padStart(2, "0");
      const timeStr = `${hours}h${minutes}`;
      if (updateDay.getTime() === today.getTime()) return `dados de ${timeStr}`;
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      if (updateDay.getTime() === yesterday.getTime()) return `dados de ontem ${timeStr}`;
      const day = updateDate.getDate().toString().padStart(2, "0"); const month = (updateDate.getMonth() + 1).toString().padStart(2, "0");
      return `dados de ${day}/${month} ${timeStr}`;
    } catch (e) { return "sem atualização"; }
  }

  function formatFooterWithFreshness(rapido) { const sourceDate = rapido?.lastUpdateBR || rapido?.lastUpdate; return formatUpdateTime(sourceDate); }

  async function fetchWithCache(url, cacheFile, maxAge = 5 * 60 * 1000, validator = null) {
    const cachePath = fm.joinPath(cacheDir, cacheFile);
    if (fm.fileExists(cachePath)) {
      const age = getFileAgeMs(cachePath);
      if (age < maxAge) {
        const cached = safeJSONParse(fm.readString(cachePath), null);
        if (cached && (!validator || validator(cached))) return cached;
      }
    }
    try {
      const req = new Request(`${url}?t=${Date.now()}`); req.timeoutInterval = 2; req.headers = { "User-Agent": "Mozilla/5.0" };
      const data = await req.loadJSON();
      if (data && (!validator || validator(data))) { fm.writeString(cachePath, JSON.stringify(data)); return data; }
      throw new Error("dados inválidos");
    } catch (e) {
      if (fm.fileExists(cachePath)) return safeJSONParse(fm.readString(cachePath), null);
      return null;
    }
  }

  async function loadImage(url) { if (!url) return null; return await StatsCore.cachedImage(url, 44, "🎵"); }

  async function fetchMyTodayCountFallback(maxAge = 15 * 60 * 1000) {
    const cachePath = fm.joinPath(cacheDir, "my_today_count_api.json");
    if (fm.fileExists(cachePath)) {
      const age = getFileAgeMs(cachePath);
      if (age < maxAge) {
        const cached = safeJSONParse(fm.readString(cachePath), null);
        if (cached && typeof cached.count === "number") return cached.count;
      }
    }
    try {
      const realId = getRealId(MY_ID); const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const req = new Request(`https://api.stats.fm/api/v1/users/${realId}/streams/stats?after=${startOfToday}`);
      req.headers = { "User-Agent": "Mozilla/5.0" }; req.timeoutInterval = 8;
      const stats = await req.loadJSON(); const count = stats?.items?.count ?? stats?.count ?? 0;
      fm.writeString(cachePath, JSON.stringify({ count, fetchedAt: new Date().toISOString() }));
      return count;
    } catch (e) {
      if (fm.fileExists(cachePath)) {
        const cached = safeJSONParse(fm.readString(cachePath), null);
        if (cached && typeof cached.count === "number") return cached.count;
      }
      return null;
    }
  }

  async function createWidget() {
    const widget = new ListWidget();
    widget.refreshAfterDate = new Date(Date.now() + 1000 * 60 * 8);
    const bg = new LinearGradient(); bg.colors = [new Color("#2d2d2d"), new Color("#141414")]; bg.locations = [0, 1];
    widget.backgroundGradient = bg; widget.setPadding(15, 15, 13, 17);

    const [rapido, pesado] = await Promise.all([
      fetchWithCache(RAPIDO_URL, "rapido.json", 8 * 60 * 1000, data => !!(data && data.daily && data.lastUpdateBR)),
      fetchWithCache(PESADO_URL, "pesado.json", 60 * 60 * 1000, data => !!(data && data.profiles))
    ]);

    if (!rapido || !pesado) { widget.addText("aguardando dados..."); return widget; }

    const rapidoAgeMs = getRapidoAgeMs(rapido);
    let myPlays = rapido?.daily?.[MY_ID] ?? 0;
    if (rapidoAgeMs > 30 * 60 * 1000) {
      const fallbackMyCount = await fetchMyTodayCountFallback(15 * 60 * 1000);
      if (typeof fallbackMyCount === "number") { myPlays = fallbackMyCount; }
    }

    let friendsData = [];
    for (const friendId of FRIENDS_IDS) {
      const plays = rapido?.daily?.[friendId] ?? 0;
      const profile = pesado?.profiles?.[friendId] || { displayName: friendId, image: null };
      friendsData.push({ id: friendId, name: profile.displayName || friendId, image: StatsCore.withPeterFallback(friendId, profile.image), plays: plays });
    }
    friendsData.sort((a, b) => b.plays - a.plays);
    const myProfile = pesado?.profiles?.[MY_ID] || { image: null };

    const imagePromises = [loadImage(LOGO_URL), loadImage(myProfile.image)];
    friendsData.forEach(f => imagePromises.push(loadImage(f.image)));
    const resolvedImages = await Promise.all(imagePromises);
    const logoImg = resolvedImages[0]; const myAvatarImg = resolvedImages[1]; const friendImages = resolvedImages.slice(2);

    const mainStack = widget.addStack(); mainStack.layoutHorizontally();
    const leftCol = mainStack.addStack(); leftCol.layoutVertically(); mainStack.addSpacer();
    const rightCol = mainStack.addStack(); rightCol.layoutVertically();

    const logoView = rightCol.addImage(logoImg || getPlaceholder(24, "📊"));
    logoView.imageSize = new Size(28, 28); logoView.cornerRadius = 6; logoView.rightAlignImage();
    rightCol.addSpacer(8);
    const myAvatarView = rightCol.addImage(myAvatarImg || getPlaceholder(24, "👤"));
    myAvatarView.imageSize = new Size(28, 28); myAvatarView.cornerRadius = 12; myAvatarView.rightAlignImage();
    rightCol.addSpacer();

    const myStatsStack = leftCol.addStack(); myStatsStack.layoutVertically(); myStatsStack.spacing = -6;
    const bigNumber = myStatsStack.addText(String(myPlays)); bigNumber.font = Font.boldSystemFont(48); bigNumber.textColor = Color.white(); bigNumber.leftAlignText();
    const labelText = myStatsStack.addText("streams"); labelText.font = Font.mediumSystemFont(9); labelText.textColor = new Color("#AAAAAA"); labelText.textOpacity = 0.5; labelText.leftAlignText();
    leftCol.addSpacer(30);

    const friendsRow = leftCol.addStack(); friendsRow.layoutHorizontally(); friendsRow.spacing = 7; friendsRow.centerAlignContent();
    for (let i = 0; i < friendsData.length; i++) {
      const friend = friendsData[i]; const friendImg = friendImages[i] || getPlaceholder(18, "👤");
      const friendStack = friendsRow.addStack(); friendStack.layoutVertically(); friendStack.spacing = 3;
      const fImgView = friendStack.addImage(friendImg); fImgView.imageSize = new Size(18, 18); fImgView.cornerRadius = 9;
      const fCount = friendStack.addText(String(friend.plays)); fCount.font = Font.regularSystemFont(8); fCount.textColor = Color.white(); fCount.centerAlignText();
    }
    leftCol.addSpacer();

    const footerText = leftCol.addText(formatFooterWithFreshness(rapido));
    footerText.font = Font.regularSystemFont(7); footerText.textColor = new Color("#666666"); footerText.textOpacity = 0.5; footerText.leftAlignText();

    return widget;
  }

  return { createWidget };
})();

// ========================================================================
// 3. MODULE: MEDIUM TOTAL MONTH
// ========================================================================
const ModuleTotalMonth = (() => {
  const MY_ID = "leo";
  const FRIENDS_IDS = ["gab", "savio", "benny", "peter"];
  const LOGO_STATS = "https://i.imgur.com/OFCufao.png";

  const BASE_URL = "https://raw.githubusercontent.com/leosaquetto/statsam/main";
  const RAPIDO_URL = `${BASE_URL}/statsfm_rapido.json`;
  const PESADO_URL = `${BASE_URL}/statsfm_pesado.json`;

  const fm = FileManager.local();
  const cacheDir = fm.joinPath(fm.documentsDirectory(), "statsfm_leaderboard");
  if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const safeJSONParse = StatsCore.safeParse;
  const formatNumber = StatsCore.formatNumber;

  function getFileAgeMs(path) { if (!fm.fileExists(path)) return Infinity; return Date.now() - fm.modificationDate(path).getTime(); }

  async function fetchWithCache(url, cacheFile, maxAge = 30 * 60 * 1000, validator = null) {
    const cachePath = fm.joinPath(cacheDir, cacheFile);
    if (fm.fileExists(cachePath)) {
      const age = getFileAgeMs(cachePath);
      if (age < maxAge) {
        const cached = safeJSONParse(fm.readString(cachePath), null);
        if (cached && (!validator || validator(cached))) return cached;
      }
    }
    try {
      const req = new Request(`${url}?t=${Date.now()}`); req.timeoutInterval = 10; req.headers = { "User-Agent": "Mozilla/5.0" };
      const data = await req.loadJSON();
      if (data && (!validator || validator(data))) { fm.writeString(cachePath, JSON.stringify(data)); return data; }
      throw new Error("dados inválidos");
    } catch (e) { return fm.fileExists(cachePath) ? safeJSONParse(fm.readString(cachePath), null) : null; }
  }

  async function fetchTodayCountsFallback(userIds, maxAge = 10 * 60 * 1000) {
    const cachePath = fm.joinPath(cacheDir, "today_counts_api_fallback.json");
    if (fm.fileExists(cachePath)) {
      const age = getFileAgeMs(cachePath);
      if (age < maxAge) { const cached = safeJSONParse(fm.readString(cachePath), null); if (cached && typeof cached === "object") return cached; }
    }
    const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const entries = await Promise.all(userIds.map(async (userId) => {
      const realId = StatsCore.getUserId(userId); if (!realId) return [userId, 0];
      try { const stats = await StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${realId}/streams/stats?after=${startOfToday}`); return [userId, stats?.items?.count ?? stats?.count ?? 0]; } catch (e) { return [userId, 0]; }
    }));
    const counts = Object.fromEntries(entries); fm.writeString(cachePath, JSON.stringify(counts)); return counts;
  }

  async function loadImage(url) { if (!url) return null; return await StatsCore.cachedImage(url, 44, "🎵"); }
  function getPlaceholder(size, emoji) { return StatsCore.placeholder(size, emoji); }

  function hasMonthDataForUser(pesado, userId) { const stats = pesado.stats?.[userId]?.month; return !!((stats?.streams || 0) > 0 || (stats?.durationMs || 0) > 0); }
  function getHeaderTimeText(rapido) {
    const source = rapido?.lastUpdateBR || rapido?.lastUpdate; const d = source ? new Date(source) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d; return `${validDate.getHours()}h${validDate.getMinutes().toString().padStart(2, "0")}`;
  }

  async function createWidget() {
    const w = new ListWidget(); w.refreshAfterDate = new Date(Date.now() + 1000 * 60 * 10);
    const bg = new LinearGradient(); bg.colors = [new Color("#2d2d2d"), new Color("#141414")]; bg.locations = [0, 1];
    w.backgroundGradient = bg; w.setPadding(10, 20, 12, 12);

    const allUsers = [MY_ID, ...FRIENDS_IDS];
    const [pesado, rapido] = await Promise.all([
      fetchWithCache(PESADO_URL, "pesado.json", 30 * 60 * 1000, d => !!(d?.profiles && d?.stats)),
      fetchWithCache(RAPIDO_URL, "rapido.json", 8 * 60 * 1000, d => !!(d?.daily && (d?.lastUpdateBR || d?.lastUpdate)))
    ]);

    if (!pesado) { w.addText("Aguardando dados..."); return w; }

    let todayCounts = rapido?.daily || await fetchTodayCountsFallback(allUsers, 10 * 60 * 1000);
    const useMonth = hasMonthDataForUser(pesado, MY_ID);
    const periodKey = useMonth ? "month" : "week";
    const titleLabel = useMonth ? `Total de ${MONTH_NAMES[new Date().getMonth()]}` : "Total de 7 dias";

    let usersData = allUsers.map(userId => {
      const profile = pesado.profiles?.[userId]; const stats = pesado.stats?.[userId]?.[periodKey] || { streams: 0 };
      return { id: userId, avatar: profile?.image, displayName: profile?.displayName || userId, streams: stats.streams || 0, todayStreams: todayCounts?.[userId] ?? 0 };
    }).sort((a, b) => b.streams - a.streams);

    const imagePromises = [loadImage(LOGO_STATS)];
    usersData.forEach(u => imagePromises.push(loadImage(StatsCore.withPeterFallback(u.id, u.avatar))));
    const resolvedImages = await Promise.all(imagePromises);
    const logo = resolvedImages[0]; const userImages = resolvedImages.slice(1);

    const header = w.addStack(); header.centerAlignContent();
    const titleStack = header.addStack(); titleStack.bottomAlignContent();
    const title = titleStack.addText(titleLabel); title.font = Font.boldSystemFont(12); title.textColor = Color.white();
    titleStack.addSpacer(6);
    const timeLabel = titleStack.addText(getHeaderTimeText(rapido)); timeLabel.font = Font.systemFont(10); timeLabel.textColor = Color.white(); timeLabel.textOpacity = 0.4;
    header.addSpacer();
    if (logo) { const l = header.addImage(logo); l.imageSize = new Size(18, 18); l.cornerRadius = 4; }

    w.addSpacer(9);
    const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent();

    for (let i = 0; i < usersData.length; i++) {
      const data = usersData[i]; const isMe = data.id === MY_ID;
      const col = row.addStack(); col.layoutVertically();
      const imgSize = isMe ? 50 : 44;
      const avatarImg = userImages[i] || getPlaceholder(imgSize, "👤");
      const img = col.addImage(avatarImg); img.imageSize = new Size(imgSize, imgSize); img.cornerRadius = imgSize / 2; img.leftAlignImage();
      col.addSpacer(7.5);
      const mesLabel = col.addText("TOTAL"); mesLabel.font = Font.boldSystemFont(5); mesLabel.textColor = Color.white(); mesLabel.textOpacity = 0.6;
      const sText = col.addText(formatNumber(data.streams)); sText.font = isMe ? Font.blackSystemFont(11.1) : Font.heavySystemFont(10.5); sText.textColor = Color.white();
      const traconLabel = col.addText("———"); traconLabel.font = Font.systemFont(6); traconLabel.textColor = Color.white(); traconLabel.textOpacity = 0.2;
      const tracoLabel = col.addText("HOJE"); tracoLabel.font = Font.boldSystemFont(5); tracoLabel.textColor = Color.white(); tracoLabel.textOpacity = 0.6;
      const todaytextLabel = col.addText(formatNumber(data.todayStreams)); todaytextLabel.font = isMe ? Font.blackSystemFont(9) : Font.boldSystemFont(9); todaytextLabel.textColor = Color.white(); todaytextLabel.textOpacity = 0.75;
      if (i < usersData.length - 1) row.addSpacer(20);
    }
    return w;
  }

  return { createWidget };
})();

// ========================================================================
// 4. MODULE: MEDIUM DASHBOARD & IN-APP MENU
// ========================================================================
const ModuleMediumDashboard = (() => {
  const WIDGET_USERS = [ { id: "leo", name: "🧔🏻‍♂️ Leo" }, { id: "gab", name: "👦🏼 Gab" }, { id: "savio", name: "🦊 Sávio" }, { id: "peter", name: "🍭 Peter" } ];
  const APP_USERS = [ { id: "000997.3647cff9cc2b42359d6ca7f79a0f2c91.0428", name: "🧔🏻‍♂️ Leo" }, { id: "000859.740385afd8284174a94c84e9bcc9bdea.1440", name: "👦🏼 Gab" }, { id: "12151123201", name: "🦊 Sávio" }, { id: "12182998998", name: "🍭 Peter" }, { id: "benante.m", name: "🫃🏻 Benny" } ];
  const LIMIT_WIDGET = 4; const LOGO_STATS = "https://i.imgur.com/OFCufao.png"; const ORANGE_COLOR = new Color("#ff8000"); const LIGHT_GRAY = new Color("#cccccc");
  const BASE_URL = "https://raw.githubusercontent.com/leosaquetto/statsam/main";
  const RAPIDO_URL = `${BASE_URL}/statsfm_rapido.json`; const PESADO_URL = `${BASE_URL}/statsfm_pesado.json`;

  const fm = FileManager.local();
  const cacheDir = fm.joinPath(fm.documentsDirectory(), "statsfm_v61_widget");
  if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

  const safeJSONParse = StatsCore.safeParse;
  const formatNumber = StatsCore.formatNumber;

  function getMonthName(date) { const nome = date.toLocaleDateString('pt-BR', { month: 'long' }); return nome.charAt(0).toUpperCase() + nome.slice(1); }
  
  async function fetchWithCache(url, cacheFile, maxAge = 5 * 60 * 1000) {
    const cachePath = fm.joinPath(cacheDir, cacheFile);
    if (fm.fileExists(cachePath)) {
      const age = Date.now() - fm.modificationDate(cachePath).getTime();
      if (age < maxAge) { const cached = safeJSONParse(fm.readString(cachePath), null); if (cached) return cached; }
    }
    try {
      const req = new Request(`${url}?t=${Date.now()}`); req.headers = { "User-Agent": "Mozilla/5.0" }; req.timeoutInterval = 10;
      const data = await req.loadJSON(); fm.writeString(cachePath, JSON.stringify(data)); return data;
    } catch (e) { if (fm.fileExists(cachePath)) { return safeJSONParse(fm.readString(cachePath), null); } return null; }
  }

  async function loadImage(url) { if (!url) return null; return await StatsCore.cachedImage(url, 44, "🎵"); }
  function getPlaceholder(size, emoji) { return StatsCore.placeholder(size, emoji); }

  function formatDate(date) { return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function formatRelative(ms) { const min = Math.floor(ms / 60000); if (min < 1) return "agora"; if (min < 60) return `${min}m`; const hr = Math.floor(min / 60); if (hr < 24) return `${hr}h`; return `${Math.floor(hr / 24)}d`; }
  function formatDuration(ms) { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h > 0 ? `${formatNumber(h)}h${m}m` : `${m}m`; }

  function getPeriodInfo(range) {
    const now = new Date(); let start, end = now;
    switch (range) {
      case "today": start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return { start, end, label: formatDate(start) };
      case "weeks": start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); return { start, end, label: `${formatDate(start)} a ${formatDate(end)}` };
      case "months": start = new Date(now.getFullYear(), now.getMonth(), 1); return { start, end, label: `${formatDate(start)} a ${formatDate(end)}` };
      case "lastMonth": start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); return { start, end, label: `${formatDate(start)} a ${formatDate(end)}` };
      case "years": start = new Date(now.getFullYear(), 0, 1); return { start, end, label: `${formatDate(start)} a ${formatDate(end)}` };
      default: start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); return { start, end, label: `${formatDate(start)} a ${formatDate(end)}` };
    }
  }

  async function openStatsApp(type, id, itemName = "") {
    const alert = new Alert(); alert.title = "Stats.fm"; alert.message = `Deseja abrir "${itemName}" no aplicativo?`;
    alert.addAction("🚀 Abrir App"); alert.addCancelAction("Cancelar");
    const res = await alert.presentAlert(); if (res === 0) Safari.open(`statsfm://${type}/${id}`);
  }

  async function showTrackOptions(trackObj) {
    const alert = new Alert(); alert.title = `"${trackObj.name}"`; alert.message = "O que deseja visualizar?";
    alert.addAction(`🎵 Ver Música`);
    const artists = trackObj.artists || [];
    if (artists.length > 1) { alert.addAction(`🎤 Escolher Artista...`); } else { alert.addAction(`🎤 Ver "${artists[0]?.name || "Artista"}"`); }
    alert.addAction(`💿 Ver "${trackObj.albums?.[0]?.name || "Álbum"}"`); alert.addCancelAction("Voltar");
    const res = await alert.presentAlert();
    if (res === 0) Safari.open(`statsfm://track/${trackObj.id}`);
    if (res === 1) {
      if (artists.length > 1) { const artAlert = new Alert(); artAlert.title = "Artistas da Faixa"; artists.forEach(a => artAlert.addAction(`"${a.name}"`)); artAlert.addCancelAction("Voltar"); const artRes = await artAlert.presentSheet(); if (artRes !== -1) Safari.open(`statsfm://artist/${artists[artRes].id}`); } else { if (artists.length === 0) {
      const alert = new Alert();
      alert.title = "Artista indisponível";
      alert.message = "Esta faixa não trouxe dados de artista.";
      alert.addCancelAction("Fechar");
      await alert.presentAlert();
      return;
    }
    Safari.open(`statsfm://artist/${artists[0].id}`); }
    }
    if (res === 2) {
      const album = trackObj.albums?.[0] || trackObj.album;
      if (album?.id) Safari.open(`statsfm://album/${album.id}`);
    }
  }

  async function showUserSelector() {
    let active = true;
    while(active) {
        const alert = new Alert(); alert.title = "Stats.fm Shortcut"; alert.message = "Selecione uma opção:";
        APP_USERS.forEach(u => alert.addAction(u.name)); alert.addAction("🔢 Comparar"); alert.addAction("🕒 Histórico Recente"); alert.addCancelAction("⬅️ Voltar ao Hub");
        const response = await alert.presentSheet();
        if (response === -1) return; 
        if (response === APP_USERS.length) { await showCompareSelector(); continue; }
        if (response === APP_USERS.length + 1) { await showGlobalHistory(); continue; }
        const user = APP_USERS[response]; const period = await selectPeriod();
        if (period === "back" || !period) continue;
        await showUserDashboard(user, period);
    }
  }

  async function selectPeriod() {
    const now = new Date(); const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pAlert = new Alert(); pAlert.title = "Período";
    const periods = [ { name: "🕙 Hoje", range: "today" }, { name: "📆 Últimos 7 dias", range: "weeks" }, { name: `📅 ${getMonthName(now)}/${now.getFullYear()}`, range: "months" }, { name: `🔙 ${getMonthName(lastMonthDate)}/${lastMonthDate.getFullYear()}`, range: "lastMonth" }, { name: `🗓️ ${now.getFullYear()}`, range: "years" } ];
    periods.forEach(p => pAlert.addAction(p.name)); pAlert.addAction("⬅️ Voltar"); pAlert.addCancelAction("❌ Fechar App");
    const res = await pAlert.presentSheet();
    if (res === -1 || res === periods.length + 1) return null;
    if (res === periods.length) return "back";
    return periods[res];
  }

  async function showCompareSelector() {
    let active = true;
    while(active) {
        const compAlert = new Alert(); compAlert.title = "Comparar com:";
        const others = APP_USERS.filter(u => !u.name.includes("Leo")); others.forEach(u => compAlert.addAction(u.name));
        compAlert.addCancelAction("⬅️ Voltar"); 
        const res = await compAlert.presentSheet();
        if (res === -1) return;
        const userA = APP_USERS.find(u => u.name.includes("Leo")); const userB = others[res];
        const period = await selectPeriod(); 
        if (period === "back" || !period) continue; 
        await showComparisonDashboard(userA, userB, period);
    }
  }

  async function showGlobalHistory() {
    let table = new UITable(); table.showSeparators = true;
    let hRow = new UITableRow(); hRow.backgroundColor = new Color("#1a1a1a"); hRow.height = 60;
    let hTxt = hRow.addText("ÚLTIMAS 5 REPRODUÇÕES"); hTxt.centerAligned(); hTxt.titleFont = Font.boldSystemFont(16); table.addRow(hRow);
    const results = await Promise.all(APP_USERS.map(u => StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${u.id}/streams/recent?limit=5`)));
    
    for (let idx = 0; idx < APP_USERS.length; idx++) {
      const user = APP_USERS[idx];
      addSectionTitle(table, user.name); const history = (results[idx]?.items || []).slice(0, 5); 
      if (history.length === 0) { addRow(table, "Sem dados recentes", ""); } else {
        for (let item of history) {
          const rawDate = item.endTime ?? item.startTime ?? item.playedAt; const ms = typeof rawDate === "number" ? rawDate * 1000 : Date.parse(rawDate); const timeAgo = formatRelative(Date.now() - ms);
          let row = new UITableRow(); row.height = 45; row.dismissOnSelect = false; if (!item?.track) continue;
          row.addImageAtURL(item.track.albums?.[0]?.image).widthWeight = 10;
          let artistStr = await StatsCore.formatArtistsForMainTrack(item.track, "Desconhecido");
          let t = row.addText(item.track.name, artistStr); t.titleFont = Font.boldSystemFont(11); t.subtitleFont = Font.systemFont(9); t.widthWeight = 70;
          let r = row.addText(timeAgo); r.rightAligned(); r.titleFont = Font.systemFont(10); r.titleColor = ORANGE_COLOR; r.widthWeight = 20;
          row.onSelect = () => showTrackOptions(item.track); table.addRow(row);
        }
      }
    }
    await table.present(); 
  }

  async function showComparisonDashboard(uA, uB, period) {
    const table = new UITable(); table.showSeparators = true;
    const info = getPeriodInfo(period.range); const after = info.start.getTime(); const before = (period.range === "lastMonth" || period.range === "today") ? `&before=${info.end.getTime() + 86399999}` : "";
    const [dataA, dataB] = await Promise.all([ fetchFullData(uA.id, after, before, 6), fetchFullData(uB.id, after, before, 6) ]);
    let head = new UITableRow(); head.height = 100; head.backgroundColor = new Color("#1a1a1a"); head.addImageAtURL(StatsCore.withPeterFallback(uA.id, dataA.user?.item?.image)).widthWeight = 15;
    let headTxt = head.addText(uA.name.toUpperCase() + "   vs   " + uB.name.toUpperCase()); headTxt.centerAligned(); headTxt.widthWeight = 70; headTxt.titleFont = Font.boldSystemFont(22); head.addImageAtURL(StatsCore.withPeterFallback(uB.id, dataB.user?.item?.image)).widthWeight = 15; table.addRow(head);
    let periodRow = new UITableRow(); periodRow.backgroundColor = new Color("#1a1a1a"); let pTxt = periodRow.addText(period.name + " (" + info.label + ")"); pTxt.centerAligned(); pTxt.titleFont = Font.systemFont(12); pTxt.titleColor = new Color("#aaa"); table.addRow(periodRow);
    addCompareSection(table, "STREAMS TOTAIS", formatNumber(dataA.stats.count), formatNumber(dataB.stats.count)); addCompareSection(table, "TEMPO TOTAL", formatDuration(dataA.stats.durationMs), formatDuration(dataB.stats.durationMs));
    const sections = [ { title: "ARTISTAS MAIS REPRODUZIDOS", type: "artist", dataA: dataA.topA, dataB: dataB.topA }, { title: "MÚSICAS MAIS REPRODUZIDAS", type: "track", dataA: dataA.topT, dataB: dataB.topT }, { title: "ÁLBUNS MAIS REPRODUZIDOS", type: "album", dataA: dataA.topAl, dataB: dataB.topAl } ];
    sections.forEach(s => { addSectionTitle(table, s.title); for(let i=0; i<6; i++) { addVisualCompareRow(table, s.dataA[i], s.dataB[i], s.type, i+1, uA.name, uB.name); } });
    await table.present(); 
  }

  async function fetchFullData(id, after, before, limit) {
    const fetchLimit = limit > 5 ? limit + 4 : 10;
    const [user, stats, topA, topT, topAl] = await Promise.all([ StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/streams/stats?after=${after}${before}`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/top/artists?after=${after}${before}&limit=${fetchLimit}`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/top/tracks?after=${after}${before}&limit=${fetchLimit}`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${id}/top/albums?after=${after}${before}&limit=${fetchLimit}`) ]);
    return { user, stats: stats?.items || stats || { count: 0, durationMs: 0 }, topA: (topA?.items || []).filter(i => i.artist), topT: (topT?.items || []).filter(i => i.track), topAl: (topAl?.items || []).filter(i => i.album) };
  }

  function addVisualCompareRow(table, itemA, itemB, type, rank, nameA, nameB) {
    let row = new UITableRow(); row.height = 110; row.dismissOnSelect = false;
    if (itemA && itemA[type]) {
      let imgA = itemA[type]?.image || itemA[type]?.albums?.[0]?.image; row.addImageAtURL(imgA || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp").widthWeight = 16; row.addText("").widthWeight = 2; 
      let artistA = ""; if (type === "track") artistA = itemA[type].artists?.map(a => a.name).join(", ") || ""; if (type === "album") artistA = itemA[type].artists?.[0]?.name || itemA[type].artist?.name || "";
      let txt = row.addText(itemA[type].name, (artistA ? artistA + "\n" : "") + formatNumber(itemA.streams)); txt.widthWeight = 27; txt.titleFont = Font.boldSystemFont(13); txt.subtitleFont = Font.mediumSystemFont(11); txt.subtitleColor = LIGHT_GRAY;
    } else { row.addText("---").widthWeight = 45; }
    let rTxt = row.addText(`#${rank}`); rTxt.widthWeight = 10; rTxt.centerAligned(); rTxt.titleFont = Font.blackSystemFont(18); rTxt.titleColor = ORANGE_COLOR;
    if (itemB && itemB[type]) {
      let artistB = ""; if (type === "track") artistB = itemB[type].artists?.map(a => a.name).join(", ") || ""; if (type === "album") artistB = itemB[type].artists?.[0]?.name || itemB[type].artist?.name || "";
      let txt = row.addText(itemB[type].name, (artistB ? artistB + "\n" : "") + formatNumber(itemB.streams)); txt.widthWeight = 27; txt.rightAligned(); txt.titleFont = Font.boldSystemFont(13); txt.subtitleFont = Font.mediumSystemFont(11); txt.subtitleColor = LIGHT_GRAY;
      row.addText("").widthWeight = 2; let imgB = itemB[type]?.image || itemB[type]?.albums?.[0]?.image; row.addImageAtURL(imgB || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp").widthWeight = 16;
    } else { row.addText("---").widthWeight = 45; }
    row.onSelect = async () => {
      const sel = new Alert(); sel.title = "Ver no Stats.fm"; sel.message = "Escolha qual item deseja abrir:";
      if (itemA) sel.addAction(`${nameA}: ${itemA[type].name}`); if (itemB) sel.addAction(`${nameB}: ${itemB[type].name}`); sel.addCancelAction("Voltar"); const choice = await sel.presentAlert();
      let target = null; if (choice === 0 && itemA) target = itemA[type]; if (choice === 1 && itemB) target = itemB[type];
      if (target) { if (type === "track") await showTrackOptions(target); else Safari.open(`statsfm://${type}/${target.id}`); }
    };
    table.addRow(row);
  }

  function addCompareSection(table, title, valA, valB) { addSectionTitle(table, title); let row = new UITableRow(); let a = row.addText(valA); a.widthWeight = 40; a.rightAligned(); a.titleFont = Font.boldSystemFont(18); let mid = row.addText("VS"); mid.widthWeight = 20; mid.centerAligned(); mid.titleFont = Font.blackSystemFont(14); mid.titleColor = ORANGE_COLOR; let b = row.addText(valB); b.widthWeight = 40; b.leftAligned(); b.titleFont = Font.boldSystemFont(18); table.addRow(row); }

  async function showUserDashboard(userObj, periodChoice) {
    let table = new UITable(); table.showSeparators = true;
    const info = getPeriodInfo(periodChoice.range); const after = info.start.getTime(); const before = (periodChoice.range === "lastMonth" || periodChoice.range === "today") ? `&before=${info.end.getTime() + 86399999}` : "";
    const [u, stats, topA, topT, topAl, history] = await Promise.all([ StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${userObj.id}`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${userObj.id}/streams/stats?after=${after}${before}`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${userObj.id}/top/artists?after=${after}${before}&limit=12`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${userObj.id}/top/tracks?after=${after}${before}&limit=12`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${userObj.id}/top/albums?after=${after}${before}&limit=12`), StatsCore.fetchJSON(`https://api.stats.fm/api/v1/users/${userObj.id}/streams/recent?limit=10`) ]);
    let headerRow = new UITableRow(); headerRow.backgroundColor = new Color("#1a1a1a"); headerRow.height = 100; headerRow.addImageAtURL(StatsCore.withPeterFallback(userObj.id, u?.item?.image)).widthWeight = 22; 
    let nameCell = headerRow.addText("  " + (u?.item?.displayName?.toUpperCase() || userObj.name), `  Resumo: ${periodChoice.name} (${info.label})`); nameCell.titleFont = Font.boldSystemFont(20); nameCell.subtitleFont = Font.systemFont(12); nameCell.widthWeight = 78; table.addRow(headerRow);
    addSectionTitle(table, "ESTATÍSTICAS GERAIS"); addRow(table, "Total de streams", formatNumber(stats?.items?.count ?? stats?.count ?? 0)); addRow(table, "Tempo em reprodução", formatDuration(stats?.items?.durationMs ?? stats?.durationMs ?? 0));
    addSectionTitle(table, "ARTISTAS MAIS REPRODUZIDOS"); (topA?.items || []).filter(i => i.artist).slice(0, 8).forEach((item, i) => { let row = addVisualRow(table, `${i+1}. ${item.artist.name}`, "", item.artist.image, `${formatNumber(item.streams)}`); row.onSelect = () => openStatsApp("artist", item.artist.id, item.artist.name); });
    addSectionTitle(table, "MÚSICAS MAIS REPRODUZIDAS"); (topT?.items || []).filter(i => i.track).slice(0, 8).forEach((item, i) => { const artists = item.track.artists?.map(a => a.name).join(", ") || ""; let row = addVisualRow(table, `${i+1}. ${item.track.name}`, artists, item.track.albums?.[0]?.image, `${formatNumber(item.streams)}`); row.onSelect = () => showTrackOptions(item.track); });
    addSectionTitle(table, "ÁLBUNS MAIS REPRODUZIDOS"); (topAl?.items || []).filter(i => i.album).slice(0, 8).forEach((item, i) => { const albumArtist = item.album.artists?.map(a => a.name).join(", ") || item.album.artist?.name || "---"; let row = addVisualRow(table, `${i+1}. ${item.album.name}`, albumArtist, item.album.image, `${formatNumber(item.streams)}`); row.onSelect = () => openStatsApp("album", item.album.id, item.album.name); });
    addSectionTitle(table, "HISTÓRICO RECENTE"); (history?.items || []).forEach(item => { const rawDate = item.endTime ?? item.startTime ?? item.playedAt; const ms = typeof rawDate === "number" ? rawDate * 1000 : Date.parse(rawDate); const timeAgo = formatRelative(Date.now() - ms); const artists = item.track.artists?.map(a => a.name).join(", ") || ""; let row = addVisualRow(table, item.track.name, artists, item.track.albums?.[0]?.image, timeAgo); row.onSelect = () => showTrackOptions(item.track); });
    await table.present(); 
  }

  function addSectionTitle(table, title) { let row = new UITableRow(); row.backgroundColor = new Color("#222"); let t = row.addText(title); t.titleFont = Font.boldSystemFont(14); t.titleColor = new Color("#999"); t.centerAligned(); table.addRow(row); }
  function addVisualRow(table, title, subtitle, imgUrl, rightText) { let row = new UITableRow(); row.height = 70; row.dismissOnSelect = false; row.addImageAtURL(imgUrl || "https://cdn.stats.fm/file/statsfm/images/placeholders/users/private.webp").widthWeight = 16; row.addText("").widthWeight = 4; let textStack = row.addText(title, subtitle); textStack.titleFont = Font.boldSystemFont(14); textStack.subtitleFont = Font.systemFont(11); textStack.widthWeight = 51; let rightStack = row.addText(rightText); rightStack.titleFont = Font.boldSystemFont(13); rightStack.titleColor = ORANGE_COLOR; rightStack.rightAligned(); rightStack.widthWeight = 29; table.addRow(row); return row; }
  function addRow(table, left, right) { let row = new UITableRow(); row.addText(" " + left).titleFont = Font.systemFont(14); let r = row.addText(right); r.titleFont = Font.boldSystemFont(14); r.rightAligned(); table.addRow(row); }

  function getRealId(shortId) { return StatsCore.getUserId(shortId); }

  async function createWidget() {
    const w = new ListWidget(); w.refreshAfterDate = new Date(Date.now() + 1000 * 60 * 2);
    function extractTrackName(item) { if (!item) return null; if (item.track && typeof item.track === "object") return item.track.name || null; if (typeof item.track === "string") return item.track || null; if (item.name) return item.name || null; return null; }
    function extractArtistNames(item) { if (!item) return null; if (item.track && typeof item.track === "object") { const names = item.track.artists?.map(a => a?.name).filter(Boolean).join(", "); if (names) return names; } if (Array.isArray(item.artists)) { const names = item.artists.map(a => typeof a === "string" ? a : a?.name).filter(Boolean).join(", "); if (names) return names; } if (typeof item.artist === "string") return item.artist; if (item.artist?.name) return item.artist.name; return null; }
    function extractPlayedMs(item) { if (!item) return null; const rawDate = item.endTime ?? item.playedAt ?? item.timestamp ?? item.startTime ?? item.date ?? item.lastPlayed; if (rawDate == null) return null; if (typeof rawDate === "number") { return rawDate < 1000000000000 ? rawDate * 1000 : rawDate; } const parsed = Date.parse(rawDate); return isNaN(parsed) ? null : parsed; }
    function isValidTrackItem(item) { return !!(extractTrackName(item) || extractArtistNames(item)); }
    function normalizeRecentArray(arr) { if (!Array.isArray(arr)) return []; return arr.filter(isValidTrackItem).slice(0, LIMIT_WIDGET); }

    function getSmartTimestampText(item, isPlaying) {
      if (!item) return null; if (isPlaying) return "agora"; const ms = extractPlayedMs(item); if (!ms) return null;
      const now = new Date(); const date = new Date(ms); const diffMs = now.getTime() - ms; if (diffMs < 0) return "agora";
      const twoHoursMs = 2 * 60 * 60 * 1000; if (diffMs <= twoHoursMs) { const totalMinutes = Math.floor(diffMs / 60000); if (totalMinutes < 1) return "agora"; const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; if (hours === 0) return `${minutes}m atrás`; if (minutes === 0) return `${hours}h atrás`; return `${hours}h${minutes}m atrás`; }
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const startYesterday = startToday - 24 * 60 * 60 * 1000; const startTomorrow = startToday + 24 * 60 * 60 * 1000;
      const hh = date.getHours().toString().padStart(2, "0"); const mm = date.getMinutes().toString().padStart(2, "0");
      if (ms >= startToday && ms < startTomorrow) { return `hoje às ${hh}:${mm}`; } if (ms >= startYesterday && ms < startToday) { return `ontem às ${hh}:${mm}`; }
      const dd = date.getDate().toString().padStart(2, "0"); const mo = (date.getMonth() + 1).toString().padStart(2, "0"); return `${dd}/${mo} às ${hh}:${mm}`;
    }

    async function fetchTodayCounts(userIds, rapidoData = null, maxAge = 3 * 60 * 1000) {
      const cachePath = fm.joinPath(cacheDir, "today_counts_dashboard.json");
      if (rapidoData?.daily && typeof rapidoData.daily === "object") { const counts = {}; for (const userId of userIds) { counts[userId] = rapidoData.daily[userId] ?? 0; } fm.writeString(cachePath, JSON.stringify(counts)); return counts; }
      if (fm.fileExists(cachePath)) { const age = Date.now() - fm.modificationDate(cachePath).getTime(); if (age < maxAge) { const cached = safeJSONParse(fm.readString(cachePath), null); if (cached && typeof cached === "object") return cached; } }
      const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const entries = await Promise.all(userIds.map(async (userId) => {
        const realId = getRealId(userId); if (!realId) return [userId, 0];
        try { const req = new Request(`https://api.stats.fm/api/v1/users/${realId}/streams/stats?after=${startOfToday}`); req.headers = { "User-Agent": "Mozilla/5.0" }; req.timeoutInterval = 8; const stats = await req.loadJSON(); const count = stats?.items?.count ?? stats?.count ?? 0; return [userId, count]; } catch (e) { return [userId, 0]; }
      }));
      const counts = Object.fromEntries(entries); fm.writeString(cachePath, JSON.stringify(counts)); return counts;
    }

    let apiData = {};
    try {
      const apiResults = await Promise.all(WIDGET_USERS.map(async (user) => {
        const realId = getRealId(user.id); const req = new Request(`https://api.stats.fm/api/v1/users/${realId}/streams/recent?limit=${LIMIT_WIDGET}`); req.headers = { "User-Agent": "Mozilla/5.0" }; req.timeoutInterval = 3; const data = await req.loadJSON(); return { userId: user.id, data: normalizeRecentArray(data?.items || []) };
      }));
      apiResults.forEach(r => { apiData[r.userId] = r.data; });
    } catch (e) { }

    const [rapidoData, pesado] = await Promise.all([ fetchWithCache(RAPIDO_URL, "rapido.json", 8 * 60 * 1000), fetchWithCache(PESADO_URL, "pesado.json", 60 * 60 * 1000) ]);
    const rapido = rapidoData || { recent: {}, daily: {} };
    const todayCounts = await fetchTodayCounts(WIDGET_USERS.map(u => u.id), rapido, 3 * 60 * 1000);

    const bg = new LinearGradient(); bg.colors = [new Color("#2d2d2d"), new Color("#141414")]; bg.locations = [0, 1]; w.backgroundGradient = bg; w.setPadding(10, 15, 10, 15);
    const header = w.addStack(); header.centerAlignContent();
    const titleStack = header.addStack(); titleStack.bottomAlignContent();
    const title = titleStack.addText(" Atividade recente"); title.font = Font.boldSystemFont(9.4); title.textColor = Color.white(); titleStack.addSpacer(6);
    const now = new Date(); const timeLabel = titleStack.addText(`${now.getHours()}h${now.getMinutes().toString().padStart(2, "0")}`); timeLabel.font = Font.systemFont(9); timeLabel.textColor = Color.white(); timeLabel.textOpacity = 0.4; header.addSpacer();
    
    const logoPromise = loadImage(LOGO_STATS);
    const avatarPromises = WIDGET_USERS.map(user => { const avatarUrl = StatsCore.withPeterFallback(user.id, pesado?.avatars?.[user.id] || pesado?.profiles?.[user.id]?.image); return loadImage(avatarUrl).then(img => img || getPlaceholder(14, "👤")); });
    const [logoImg, ...avatarImgs] = await Promise.all([logoPromise, ...avatarPromises]);

    if (logoImg) { const l = header.addImage(logoImg); l.imageSize = new Size(16, 16); l.cornerRadius = 4; }
    w.addSpacer(6);
    const mainRow = w.addStack();

    for (let i = 0; i < WIDGET_USERS.length; i++) {
      const user = WIDGET_USERS[i]; const col = mainRow.addStack(); col.layoutVertically(); col.size = new Size(78, 0);
      const userRow = col.addStack(); userRow.centerAlignContent();
      const imgDisp = userRow.addImage(avatarImgs[i]); imgDisp.imageSize = new Size(14, 14); imgDisp.cornerRadius = 7;

      let userRecent = []; const apiRecent = normalizeRecentArray(apiData[user.id] || []); const githubRecent = normalizeRecentArray(rapido?.recent?.[user.id] || []);
      if (apiRecent.length > 0) {
        userRecent = [...apiRecent];
        for (const ghItem of githubRecent) {
          if (userRecent.length >= LIMIT_WIDGET) break;
          const ghTrack = extractTrackName(ghItem); const alreadyExists = userRecent.some(apiItem => { return extractTrackName(apiItem) === ghTrack && extractArtistNames(apiItem) === extractArtistNames(ghItem); });
          if (!alreadyExists) userRecent.push(ghItem);
        }
      } else { userRecent = [...githubRecent]; }
      userRecent = normalizeRecentArray(userRecent);

      let isPlaying = false; const firstItem = userRecent[0]; const firstPlayedMs = extractPlayedMs(firstItem);
      if (firstItem && firstPlayedMs && (Date.now() - firstPlayedMs < 420000)) {
        isPlaying = true; userRow.addSpacer(3); const badgeStack = userRow.addStack(); badgeStack.layoutVertically();
        const nowTxt = badgeStack.addText("NOW"); nowTxt.font = Font.boldSystemFont(4); nowTxt.textColor = Color.white();
        const playTxt = badgeStack.addText("PLAYING"); playTxt.font = Font.boldSystemFont(4); playTxt.textColor = Color.white();
      }

      col.addSpacer(6);

      for (let j = 0; j < LIMIT_WIDGET; j++) {
        const item = userRecent[j]; const trackName = extractTrackName(item); const artistNames = extractArtistNames(item) || StatsCore.formatArtists(item?.track || item, "Artista");
        const isCurrentTrack = (j === 0 && isPlaying); const songOpacity = isCurrentTrack ? 1.0 : 0.65; const artistOpacity = isCurrentTrack ? 1.0 : 0.57; const prefix = isCurrentTrack ? "▶︎ " : "";
        if (trackName) { const songTxt = col.addText(prefix + trackName); songTxt.font = Font.boldSystemFont(6.8); songTxt.textColor = Color.white(); songTxt.textOpacity = songOpacity; songTxt.lineLimit = 1; } else { const emptySong = col.addText(" "); emptySong.font = Font.systemFont(6.8); emptySong.textOpacity = 0; }
        if (j === 0) {
          if (artistNames) { const artistTxt = col.addText(artistNames); artistTxt.font = isCurrentTrack ? Font.boldSystemFont(6) : Font.systemFont(6); artistTxt.textColor = Color.white(); artistTxt.textOpacity = artistOpacity; artistTxt.lineLimit = 1; } else { const emptyArtist = col.addText(" "); emptyArtist.font = Font.systemFont(6); emptyArtist.textOpacity = 0; }
          const timestamp = getSmartTimestampText(item, isCurrentTrack);
          if (timestamp) { const timeTxt = col.addText(timestamp); if (timestamp === "agora") { timeTxt.font = Font.systemFont(4.8); timeTxt.textColor = Color.white(); timeTxt.textOpacity = 1.0; } else { timeTxt.font = Font.systemFont(4.8); timeTxt.textColor = Color.white(); timeTxt.textOpacity = artistOpacity; } timeTxt.lineLimit = 1; } else { const emptyTime = col.addText(" "); emptyTime.font = Font.systemFont(4.8); emptyTime.textOpacity = 0; }
          col.addSpacer(6.0);
        } else {
          if (artistNames) { const artistTxt = col.addText(artistNames); artistTxt.font = Font.systemFont(6); artistTxt.textColor = Color.white(); artistTxt.textOpacity = 0.57; artistTxt.lineLimit = 1; } else { const emptyArtist = col.addText(" "); emptyArtist.font = Font.systemFont(6); emptyArtist.textOpacity = 0; }
          col.addSpacer(5);
        }
      }

      col.addSpacer(3);
      const todayPlays = todayCounts?.[user.id] ?? rapido?.daily?.[user.id] ?? 0; const monthPlays = pesado?.stats?.[user.id]?.month?.streams || 0;
      const statsRow = col.addStack(); statsRow.layoutHorizontally(); statsRow.centerAlignContent();
      const mesLabel = statsRow.addText("MÊS  "); mesLabel.font = Font.lightSystemFont(4.2); mesLabel.textColor = Color.white(); mesLabel.textOpacity = 0.9;
      const mesNum = statsRow.addText(formatNumber(monthPlays)); mesNum.font = Font.boldSystemFont(7.5); mesNum.textColor = Color.white(); mesNum.textOpacity = 0.9;
      statsRow.addSpacer(0);
      const hojeLabel = statsRow.addText("   HOJE  "); hojeLabel.font = Font.lightSystemFont(4.2); hojeLabel.textColor = Color.white(); hojeLabel.textOpacity = 0.9;
      const hojeNum = statsRow.addText(formatNumber(todayPlays)); hojeNum.font = Font.boldSystemFont(7.5); hojeNum.textColor = Color.white(); hojeNum.textOpacity = 0.9;
      if (i < WIDGET_USERS.length - 1) mainRow.addSpacer(4);
    }
    return w;
  }

  async function showTodayNowHub() {
    const rapido = await fetchWithCache(RAPIDO_URL, "rapido.json", 8 * 60 * 1000) || { recent: {}, daily: {} };
    const lines = WIDGET_USERS.map(user => {
      const item = (rapido.recent?.[user.id] || [])[0] || {};
      const track = extractTrackName(item) || "Sem faixa";
      const artist = extractArtistNames(item) || "Sem artista";
      const plays = rapido.daily?.[user.id] ?? 0;
      return `${user.name}: ${track} — ${artist} (${formatNumber(plays)} hoje)`;
    });
    const a = new Alert();
    a.title = "🔥 Hoje / agora";
    a.message = lines.join("\n");
    a.addCancelAction("Fechar");
    await a.presentAlert();
  }

  async function showTodayRanking() {
    const rapido = await fetchWithCache(RAPIDO_URL, "rapido.json", 8 * 60 * 1000) || { daily: {} };
    const ranking = WIDGET_USERS.map(u => ({...u, plays: rapido.daily?.[u.id] ?? 0})).sort((a,b)=>b.plays-a.plays);
    const lines = ranking.map((u, i) => `${i+1}. ${u.name}: ${formatNumber(u.plays)} streams`);
    const a = new Alert();
    a.title = "🏆 Ranking de hoje";
    a.message = lines.join("\n");
    a.addCancelAction("Fechar");
    await a.presentAlert();
  }

  async function showStatsHub() {
    let keepRunning = true;
    while(keepRunning) {
        const a = new Alert();
        a.title = "Central de Estatísticas";
        a.message = "Escolha uma opção";
        a.addAction("🔥 Hoje / agora");
        a.addAction("🕒 Histórico recente global");
        a.addAction("🏆 Ranking de hoje");
        a.addAction("📅 Ranking do mês");
        a.addAction("⚔️ Comparar usuários");
        a.addAction("👤 Perfil individual");
        a.addCancelAction("❌ Fechar App");
        
        const r = await a.presentSheet();
        if (r === -1) { keepRunning = false; break; }
        
        if (r === 0) await showTodayNowHub();
        if (r === 1) await showGlobalHistory();
        if (r === 2) await showTodayRanking();
        if (r === 3) {
            const period = await selectPeriod();
            if (period && period !== "back") {
                 let table = new UITable(); table.showSeparators = true;
                 let hRow = new UITableRow(); hRow.backgroundColor = new Color("#1a1a1a"); hRow.height = 60;
                 let hTxt = hRow.addText(`RANKING: ${period.name.toUpperCase()}`); hTxt.centerAligned(); hTxt.titleFont = Font.boldSystemFont(16); table.addRow(hRow);
                 await showUserDashboard(APP_USERS[0], period);
            }
        }
        if (r === 4) await showCompareSelector();
        if (r === 5) await showUserSelector();
    }
  }

  return { createWidget, showUserSelector, showStatsHub };
})();

// ========================================================================
// 5. MODULE: LARGE DASHBOARD
// ========================================================================
const ModuleLargeDashboard = (() => {
  const BASE_URL = "https://raw.githubusercontent.com/leosaquetto/statsam/main";
  const RAPIDO_URL = `${BASE_URL}/statsfm_rapido.json`;
  const PESADO_URL = `${BASE_URL}/statsfm_pesado.json`;

  const fm = FileManager.local();
  const cacheDir = fm.joinPath(fm.documentsDirectory(), "statsfm_cache_large");
  if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

  const PARAM_MAP = { "leo": "leo", "gab": "gab", "gabriel": "gab", "savio": "savio", "savy": "savio", "benny": "benny", "ben": "benny", "peter": "peter", "pedro": "peter" };
  const MONTH_NAMES = [ "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro" ];

  const formatNumber = StatsCore.formatNumber;

  async function fetchJSON(url, cacheFile, maxAge = 5 * 60 * 1000) {
    const cachePath = fm.joinPath(cacheDir, cacheFile);
    if (fm.fileExists(cachePath)) { const age = Date.now() - fm.modificationDate(cachePath).getTime(); if (age < maxAge) { return JSON.parse(fm.readString(cachePath)); } }
    try { const req = new Request(url); req.timeoutInterval = 10; req.headers = { "User-Agent": "Mozilla/5.0" }; const data = await req.loadJSON(); fm.writeString(cachePath, JSON.stringify(data)); return data; } catch (e) { if (fm.fileExists(cachePath)) { return JSON.parse(fm.readString(cachePath)); } return null; }
  }

  async function getCachedImage(url) { if (!url) return null; return await StatsCore.cachedImage(url, 44, "🎵"); }
  function getPlaceholder(size, emoji) { return StatsCore.placeholder(size, emoji); }

  function hasUsablePeriodData(periodObj, rankingObj) { const hasStreams = (rankingObj?.streams || 0) > 0; const hasArtists = (periodObj?.artists?.length || 0) > 0; const hasTracks = (periodObj?.tracks?.length || 0) > 0; const hasAlbums = (periodObj?.albums?.length || 0) > 0; return hasStreams || hasArtists || hasTracks || hasAlbums; }

  async function createWidget(overrideParam) {
    const w = new ListWidget(); w.refreshAfterDate = new Date(Date.now() + 1000 * 60 * 15);
    const bg = new LinearGradient(); bg.colors = [new Color("#2d2d2d"), new Color("#141414")]; w.backgroundGradient = bg; w.setPadding(16, 22, 10, 18);
    const [rapido, pesado] = await Promise.all([ fetchJSON(RAPIDO_URL, "rapido.json", 5 * 60 * 1000), fetchJSON(PESADO_URL, "pesado.json", 60 * 60 * 1000) ]);
    if (!rapido || !pesado) { w.addText("Aguardando dados..."); return w; }

    let param = overrideParam ? overrideParam.toLowerCase() : "leo"; param = PARAM_MAP[param] || "leo";
    const pKey = pesado.profiles?.[param] ? param : "leo";
    
    const userData = pesado.profiles?.[pKey]; const monthTops = pesado.tops?.[pKey]?.month; const weekTops = pesado.tops?.[pKey]?.week;
    const monthRanking = pesado.rankings?.month?.find(r => r.name === param) || pesado.rankings?.month?.find(r => r.name === "leo");
    const weekRanking = pesado.rankings?.week?.find(r => r.name === param) || pesado.rankings?.week?.find(r => r.name === "leo");

    const useMonth = hasUsablePeriodData(monthTops, monthRanking);
    const userTops = useMonth ? monthTops : weekTops; const periodStreams = useMonth ? (monthRanking?.streams || 0) : (weekRanking?.streams || 0);
    const periodLabel = useMonth ? MONTH_NAMES[new Date().getMonth()] : "7d";
    
    const now = new Date(); const timeStr = now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    const header = w.addStack(); header.centerAlignContent();
    
    const [avatarImg, logo] = await Promise.all([ getCachedImage(StatsCore.withPeterFallback(pKey, userData?.image)).then(img => img || getPlaceholder(26, "👤")), getCachedImage("https://i.imgur.com/OFCufao.png") ]);
    const av = header.addImage(avatarImg); av.imageSize = new Size(26, 26); av.cornerRadius = 13;
    header.addSpacer(10);
    const uStack = header.addStack(); uStack.layoutVertically();
    const nameT = uStack.addText(userData?.displayName || param.toUpperCase()); nameT.font = Font.boldSystemFont(11); nameT.textColor = Color.white();
    const stTxt = uStack.addText(`${formatNumber(periodStreams)} streams (${periodLabel}) • ${timeStr}`); stTxt.font = Font.systemFont(8); stTxt.textOpacity = 0.5; stTxt.textColor = Color.white();
    header.addSpacer();
    if (logo) { const l = header.addImage(logo); l.imageSize = new Size(18, 18); }

    w.addSpacer(8);
    if (userTops?.artists) { await renderSection(w, "ARTISTAS", userTops.artists.slice(0,6), "artist"); w.addSpacer(6); }
    if (userTops?.tracks) { const trackSection = w.addStack(); trackSection.__periodAlbums = userTops?.albums || []; await renderSection(trackSection, "FAIXAS", userTops.tracks.slice(0,6), "track"); w.addSpacer(6); }
    if (userTops?.albums) { await renderSection(w, "ÁLBUNS", userTops.albums.slice(0,6), "album"); }
    return w;
  }

  function getStatsItemUrl(type, item) {
    const id = item?.id || item?.albumId || item?.statsfmId;
    if (!id) return null;
    if (type === "artist") return `${URLScheme.forRunningScript()}?openArtist=${encodeURIComponent(id)}`;
    if (type === "track") return `${URLScheme.forRunningScript()}?mode=track&trackId=${encodeURIComponent(id)}`;
    if (type === "album") return `${URLScheme.forRunningScript()}?mode=albumRanking&albumId=${encodeURIComponent(id)}&albumName=${encodeURIComponent(item?.name || "")}`;
    return null;
  }

  async function renderSection(parent, title, items, type) {
    const sectionStack = parent.addStack(); sectionStack.layoutVertically();
    const t = sectionStack.addText(title); t.font = Font.regularSystemFont(6); t.textOpacity = 0.5; t.textColor = Color.white();
    const listStack = sectionStack.addStack();
    const emojiPlaceholder = type === "artist" ? "👤" : "💿";
    const imagePromises = items.map(item => getCachedImage(item.image).then(img => img || getPlaceholder(44, emojiPlaceholder)) );
    const loadedImages = await Promise.all(imagePromises);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]; const itemStack = listStack.addStack(); itemStack.layoutVertically(); itemStack.size = new Size(44, 80);
      const itemUrl = getStatsItemUrl(type, item);
      if (itemUrl) itemStack.url = itemUrl;
      let name = item.name;
      const artistText = type === "track" ? StatsCore.formatTopTrackArtists(item, parent.__periodAlbums || [], "") : null;
      const imgDisp = itemStack.addImage(loadedImages[i]); imgDisp.imageSize = new Size(44, 44); imgDisp.cornerRadius = type === "artist" ? 22 : 6;
      itemStack.addSpacer(4);
      const nRow = itemStack.addStack(); const num = nRow.addText(`${i+1}. `); num.font = Font.systemFont(6.5); num.textColor = Color.white();
      const nTxt = nRow.addText(name || "---"); nTxt.font = (i === 0) ? Font.boldSystemFont(6.5) : Font.mediumSystemFont(6.5); nTxt.lineLimit = 1; nTxt.textColor = Color.white();
      if (type === "track" && artistText) { const aTxt = itemStack.addText(artistText); aTxt.font = Font.systemFont(5.5); aTxt.textOpacity = 0.55; aTxt.textColor = Color.white(); aTxt.lineLimit = 1; }
      const countTxt = itemStack.addText(`▶︎${formatNumber(item.streams || 0)}`); countTxt.font = Font.systemFont(6); countTxt.textOpacity = 0.5; countTxt.textColor = Color.white();
      if (i < items.length - 1) { listStack.addSpacer(i === 0 ? 11 : 8); }
    }
  }

  return { createWidget };
})();

// ========================================================================
// 6. MAIN EXECUTION LOGIC 
// ========================================================================
const PARAM = (args.widgetParameter || "padrao").toLowerCase().trim();

async function main() {
  if (config.runsInApp) {
    const query = args.queryParameters || {};
    const mode = query.mode || PARAM;
    const openAlbum = args.queryParameters?.openAlbum;
    const openTrack = args.queryParameters?.openTrack;
    const openArtist = args.queryParameters?.openArtist;
    if (mode === "track" && query.trackId) await ModuleNowPlaying.showTrackById(query.trackId);
    else if (mode === "albumRanking" && query.albumId) await ModuleNowPlaying.showAlbumRanking(query.albumId, query.albumName || "");
    else if (openAlbum) await ModuleNowPlaying.showAlbumFocus(openAlbum);
    else if (openTrack) await ModuleNowPlaying.showTrackFocus(openTrack);
    else if (openArtist) await ModuleNowPlaying.showArtistFocus(openArtist);
    else await ModuleNowPlaying.showDashboard(null);
    Script.complete();
    return;
  }

  let widget;

  if (config.widgetFamily === "small") {
    if (PARAM === "todaystats") widget = await ModuleTodayStats.createWidget();
    else widget = await ModuleNowPlaying.createSmall();

  } else if (config.widgetFamily === "medium") {
    if (PARAM === "totalmonth") widget = await ModuleTotalMonth.createWidget();
    else widget = await ModuleMediumDashboard.createWidget();

  } else if (config.widgetFamily === "large") {
    widget = await ModuleLargeDashboard.createWidget(PARAM);

  } else {
    widget = await ModuleNowPlaying.createSmall();
  }

  if (widget) {
    Script.setWidget(widget);
  }
  Script.complete();
}

await main();
