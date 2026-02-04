export function createBanHelpers({ db, logger, BAN_CACHE_TTL_MS = 30000 }) {
  let cache = {
    updatedAt: 0,
    set: new Set(),
  };

  async function getActiveBansSet(force = false) {
    const now = Date.now();
    if (!force && now - cache.updatedAt < BAN_CACHE_TTL_MS) {
      return cache.set;
    }

    try {
      const snap = await db.collection("bans").where("active", "==", true).get();
      const nextSet = new Set();
      snap.docs.forEach((doc) => nextSet.add(doc.id));
      cache = { updatedAt: now, set: nextSet };
      return nextSet;
    } catch (err) {
      logger?.warn?.("BANS FETCH FAILED:", err);
      return cache.set;
    }
  }

  return { getActiveBansSet };
}
