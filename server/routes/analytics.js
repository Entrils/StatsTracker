const ALLOWED_EVENTS = new Set([
  "activation_target_action",
  "time_to_value_insight",
  "upload_completion",
  "tournament_register_conversion",
]);

function sanitizeString(value, maxLen = 200) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  const entries = Object.entries(meta).slice(0, 16);
  for (const [keyRaw, valueRaw] of entries) {
    const key = sanitizeString(keyRaw, 64);
    if (!key) continue;
    if (typeof valueRaw === "boolean") {
      out[key] = valueRaw;
      continue;
    }
    if (typeof valueRaw === "number" && Number.isFinite(valueRaw)) {
      out[key] = valueRaw;
      continue;
    }
    if (typeof valueRaw === "string") {
      out[key] = sanitizeString(valueRaw, 200);
    }
  }
  return out;
}

function listDayKeys(fromDay, days) {
  const out = [];
  const [year, month, day] = String(fromDay).split("-").map((v) => Number(v));
  const startUtc = Date.UTC(year, (month || 1) - 1, day || 1);
  for (let i = 0; i < days; i += 1) {
    out.push(new Date(startUtc + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }
  return out;
}

export function registerAnalyticsRoutes(app, deps) {
  const { admin, db, logger, statsLimiter, authLimiter, requireAuth, parseIntParam } = deps;

  app.post("/analytics/event", statsLimiter, async (req, res) => {
    try {
      const body = req.body || {};
      const event = sanitizeString(body.event, 80);
      if (!event || !ALLOWED_EVENTS.has(event)) {
        return res.status(400).json({ error: "Invalid event" });
      }

      const valueMsRaw = Number(body.valueMs);
      const hasValueMs = Number.isFinite(valueMsRaw) && valueMsRaw >= 0 && valueMsRaw <= 86400000;
      const valueMs = hasValueMs ? valueMsRaw : null;
      const meta = sanitizeMeta(body.meta);
      const sessionId = sanitizeString(body.sessionId, 128);
      const now = Date.now();
      const dayKey = new Date(now).toISOString().slice(0, 10);
      const counterRef = db.collection("ux_event_counters").doc(`${dayKey}_${event}`);

      const counterPayload = {
        event,
        day: dayKey,
        count: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (hasValueMs) {
        counterPayload.valueMsSum = admin.firestore.FieldValue.increment(valueMs);
        counterPayload.valueMsCount = admin.firestore.FieldValue.increment(1);
      }

      await Promise.all([
        counterRef.set(counterPayload, { merge: true }),
        db.collection("ux_event_samples").add({
          event,
          ts: now,
          sessionId: sessionId || null,
          valueMs,
          meta,
        }),
      ]);

      return res.json({ ok: true });
    } catch (err) {
      logger.error("ANALYTICS EVENT ERROR:", err);
      return res.status(500).json({ error: "Failed to save analytics event" });
    }
  });

  app.get("/admin/analytics/ux", authLimiter, requireAuth, async (req, res) => {
    try {
      const isAdmin = req.user?.admin === true || req.user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const daysRaw = parseIntParam ? parseIntParam(req.query.days, 14) : Number.parseInt(req.query.days || "14", 10);
      if (daysRaw === null) {
        return res.status(400).json({ error: "Invalid days" });
      }
      const days = Math.min(Math.max(Number(daysRaw) || 14, 1), 60);
      const now = Date.now();
      const fromTs = now - (days - 1) * 24 * 60 * 60 * 1000;
      const fromDay = new Date(fromTs).toISOString().slice(0, 10);
      const toDay = new Date(now).toISOString().slice(0, 10);
      const dayKeys = listDayKeys(fromDay, days);

      const snap = await db
        .collection("ux_event_counters")
        .where("day", ">=", fromDay)
        .where("day", "<=", toDay)
        .limit(4000)
        .get();

      const buckets = new Map();
      ALLOWED_EVENTS.forEach((event) => {
        buckets.set(event, {
          event,
          count: 0,
          valueMsSum: 0,
          valueMsCount: 0,
          perDay: new Map(),
        });
      });

      for (const doc of snap.docs || []) {
        const row = doc.data() || {};
        const event = sanitizeString(row.event, 80);
        if (!ALLOWED_EVENTS.has(event)) continue;
        const bucket = buckets.get(event);
        const count = Number(row.count);
        const valueMsSum = Number(row.valueMsSum);
        const valueMsCount = Number(row.valueMsCount);
        bucket.count += Number.isFinite(count) ? count : 0;
        bucket.valueMsSum += Number.isFinite(valueMsSum) ? valueMsSum : 0;
        bucket.valueMsCount += Number.isFinite(valueMsCount) ? valueMsCount : 0;
        const day = sanitizeString(row.day, 16);
        const currentDay = bucket.perDay.get(day) || { count: 0, valueMsSum: 0, valueMsCount: 0 };
        currentDay.count += Number.isFinite(count) ? count : 0;
        currentDay.valueMsSum += Number.isFinite(valueMsSum) ? valueMsSum : 0;
        currentDay.valueMsCount += Number.isFinite(valueMsCount) ? valueMsCount : 0;
        bucket.perDay.set(day, currentDay);
      }

      const rows = [...buckets.values()].map((item) => ({
        event: item.event,
        count: item.count,
        valueMsSum: item.valueMsSum,
        valueMsCount: item.valueMsCount,
        avgMs: item.valueMsCount > 0 ? item.valueMsSum / item.valueMsCount : null,
        perDay: dayKeys.map((day) => {
          const point = item.perDay.get(day) || { count: 0, valueMsSum: 0, valueMsCount: 0 };
          return {
            day,
            count: point.count,
            avgMs: point.valueMsCount > 0 ? point.valueMsSum / point.valueMsCount : null,
          };
        }),
      }));
      return res.json({ days, fromDay, toDay, dayKeys, rows });
    } catch (err) {
      logger.error("ANALYTICS ADMIN LIST ERROR:", err);
      return res.status(500).json({ error: "Failed to load analytics metrics" });
    }
  });
}
