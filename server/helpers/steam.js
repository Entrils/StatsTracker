function toInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createSteamHelpers({
  appId,
  onlineCacheTtlMs = 60 * 1000,
  requestTimeoutMs = 4000,
  logger,
  fetchImpl = fetch,
} = {}) {
  const normalizedAppId = toInt(appId, null);
  let cache = {
    value: null,
    updatedAt: 0,
  };

  async function fetchOnlineNow() {
    if (!normalizedAppId) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const url =
        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/` +
        `?appid=${normalizedAppId}`;
      const res = await fetchImpl(url, { signal: controller.signal });
      if (!res.ok) return null;
      const payload = await res.json();
      const count = toInt(payload?.response?.player_count, null);
      return count !== null && count >= 0 ? count : null;
    } catch (err) {
      logger?.warn?.({ err }, "Steam online fetch failed");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getSteamOnline() {
    if (!normalizedAppId) return null;

    const now = Date.now();
    if (cache.updatedAt && now - cache.updatedAt < onlineCacheTtlMs) {
      return cache.value;
    }

    const value = await fetchOnlineNow();
    cache = { value, updatedAt: now };
    return value;
  }

  return {
    steamAppId: normalizedAppId,
    getSteamOnline,
  };
}
