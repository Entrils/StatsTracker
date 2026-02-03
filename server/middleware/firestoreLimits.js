export function createFirestoreDailyLimiters({
  admin,
  db,
  logger,
  getDayKey,
  OCR_DAILY_LIMIT,
  RANK_SUBMIT_DAILY_LIMIT,
}) {
  async function ocrDailyLimiter(req, res, next) {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Missing auth token" });

    const day = getDayKey();
    const ref = db.collection("rate_limits").doc(`ocr_${uid}_${day}`);
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    );

    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
        if (count >= OCR_DAILY_LIMIT) {
          return { allowed: false, count };
        }
        tx.set(
          ref,
          {
            day,
            count: count + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt,
          },
          { merge: true }
        );
        return { allowed: true, count: count + 1 };
      });

      if (!result.allowed) {
        return res
          .status(429)
          .json({ error: "Daily OCR limit reached", remaining: 0, limit: OCR_DAILY_LIMIT });
      }
      req.ocrRemaining = Math.max(0, OCR_DAILY_LIMIT - result.count);
      return next();
    } catch (err) {
      logger.error("OCR RATE LIMIT ERROR:", err);
      return res.status(500).json({ error: "Rate limit check failed" });
    }
  }

  async function rankDailyLimiter(req, res, next) {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Missing auth token" });
    const isAdmin = req.user?.admin === true || req.user?.role === "admin";
    if (isAdmin) {
      req.rankRemaining = RANK_SUBMIT_DAILY_LIMIT;
      return next();
    }

    const day = getDayKey();
    const ref = db.collection("rate_limits").doc(`rank_${uid}_${day}`);
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    );

    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
        if (count >= RANK_SUBMIT_DAILY_LIMIT) {
          return { allowed: false, count };
        }
        tx.set(
          ref,
          {
            day,
            count: count + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt,
          },
          { merge: true }
        );
        return { allowed: true, count: count + 1 };
      });

      if (!result.allowed) {
        return res.status(429).json({
          error: "Daily rank submit limit reached",
          remaining: 0,
          limit: RANK_SUBMIT_DAILY_LIMIT,
        });
      }
      req.rankRemaining = Math.max(0, RANK_SUBMIT_DAILY_LIMIT - result.count);
      return next();
    } catch (err) {
      logger.error("RANK RATE LIMIT ERROR:", err);
      return res.status(500).json({ error: "Rate limit check failed" });
    }
  }

  return { ocrDailyLimiter, rankDailyLimiter };
}
