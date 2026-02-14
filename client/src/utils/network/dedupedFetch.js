const inflight = new Map();
const resolved = new Map();
const failed = new Map();

export function dedupedJsonRequest(key, fetcher, ttlMs = 1500) {
  const now = Date.now();
  const cached = resolved.get(key);
  if (cached && now - cached.ts < ttlMs) {
    return Promise.resolve(cached.data);
  }

  const failedCached = failed.get(key);
  if (failedCached && now - failedCached.ts < failedCached.ttlMs) {
    return Promise.reject(failedCached.error);
  }

  const active = inflight.get(key);
  if (active) return active;

  const p = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      resolved.set(key, { ts: Date.now(), data });
      failed.delete(key);
      return data;
    })
    .catch((error) => {
      if (error?.name === "AbortError") {
        throw error;
      }
      const status = Number(error?.status || 0);
      const cooldown =
        status === 429
          ? 8000
          : status >= 500
          ? 3000
          : 1500;
      failed.set(key, { ts: Date.now(), ttlMs: cooldown, error });
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}
