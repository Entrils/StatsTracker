export function registerOcrRoutes(app, deps) {
  const {
    logger,
    ocrLimiter,
    requireAuth,
    ocrDailyLimiter,
    isValidBase64Image,
    OCR_DAILY_LIMIT,
  } = deps;

  app.post("/ocr", ocrLimiter, requireAuth, ocrDailyLimiter, async (req, res) => {
    try {
      const { base64Image, lang } = req.body || {};
      if (!base64Image) {
        return res.status(400).json({ error: "Missing base64Image" });
      }
      if (!isValidBase64Image(base64Image)) {
        return res.status(400).json({ error: "Invalid base64Image" });
      }
      if (!process.env.OCR_SPACE_API_KEY) {
        return res.status(500).json({ error: "OCR key not configured" });
      }
      const requestedLang = lang === "rus" ? "rus" : "eng";

      const runOcr = async (ocrLang) => {
        const form = new URLSearchParams();
        form.append("apikey", process.env.OCR_SPACE_API_KEY);
        form.append("language", ocrLang);
        form.append("OCREngine", "2");
        form.append("scale", "true");
        form.append("isOverlayRequired", "false");
        form.append("base64Image", base64Image);

        const r = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });

        if (!r.ok) {
          const text = await r.text();
          return { ok: false, status: r.status, errorText: text };
        }

        const data = await r.json();
        const parsedText =
          data?.ParsedResults?.[0]?.ParsedText ||
          data?.ParsedResults?.[0]?.TextOverlay?.Lines?.map((l) => l?.LineText).join("\n") ||
          "";
        const hasText = typeof parsedText === "string" && parsedText.trim().length > 0;
        const errored = Boolean(data?.IsErroredOnProcessing);
        return { ok: true, data, hasText, errored };
      };

      let result = await runOcr(requestedLang);
      if (
        requestedLang === "rus" &&
        (result.ok === false || result.errored || !result.hasText)
      ) {
        const fallback = await runOcr("eng");
        if (fallback.ok) {
          result = fallback;
          result.data.usedLanguage = "eng";
        }
      }

      if (!result.ok) {
        return res.status(502).json({
          error: "OCR request failed",
          details: result.errorText || "Unknown OCR error",
        });
      }

      result.data.remaining =
        typeof req.ocrRemaining === "number" ? req.ocrRemaining : null;
      result.data.limit = OCR_DAILY_LIMIT;
      result.data.usedLanguage = result.data.usedLanguage || requestedLang;
      return res.json(result.data);
    } catch (err) {
      logger.error("OCR ERROR:", err);
      return res.status(500).json({ error: "OCR failed" });
    }
  });
}
