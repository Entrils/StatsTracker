const EXTENSION_PREFIXES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "edge-extension://",
];

const DEFAULT_SAMPLE_RATE = import.meta.env.PROD ? 0.2 : 1;
const SAMPLE_RATE = Number.parseFloat(
  import.meta.env.VITE_CLIENT_ERROR_SAMPLE_RATE || `${DEFAULT_SAMPLE_RATE}`
);
const THROTTLE_WINDOW_MS = Number.parseInt(
  import.meta.env.VITE_CLIENT_ERROR_THROTTLE_MS || "60000",
  10
);
const THROTTLE_MAX_PER_WINDOW = Number.parseInt(
  import.meta.env.VITE_CLIENT_ERROR_THROTTLE_MAX || "20",
  10
);
const DEDUPE_WINDOW_MS = Number.parseInt(
  import.meta.env.VITE_CLIENT_ERROR_DEDUPE_MS || "30000",
  10
);

const recentTimestamps = [];
const recentKeys = new Map();

const trim = (value, max = 500) => String(value || "").slice(0, max);

const sanitizeText = (value, max = 500) =>
  trim(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer <token>")
    .replace(/([?&](token|access_token|id_token|code|session)=)[^&]+/gi, "$1<redacted>");

const normalizeUrl = (urlValue) => {
  if (!urlValue) return "";
  try {
    const parsed = new URL(urlValue, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return trim(urlValue, 500);
  }
};

const isExtensionUrl = (urlValue) => {
  const normalized = String(urlValue || "");
  return EXTENSION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const shouldSample = () => {
  if (!Number.isFinite(SAMPLE_RATE)) return true;
  if (SAMPLE_RATE >= 1) return true;
  if (SAMPLE_RATE <= 0) return false;
  return Math.random() <= SAMPLE_RATE;
};

const allowByThrottle = (key) => {
  const now = Date.now();
  while (recentTimestamps.length && now - recentTimestamps[0] > THROTTLE_WINDOW_MS) {
    recentTimestamps.shift();
  }
  if (recentTimestamps.length >= THROTTLE_MAX_PER_WINDOW) {
    return false;
  }
  const prevTs = recentKeys.get(key);
  if (prevTs && now - prevTs < DEDUPE_WINDOW_MS) {
    return false;
  }
  recentTimestamps.push(now);
  recentKeys.set(key, now);
  return true;
};

const shouldIgnorePayload = (payload) => {
  const message = String(payload?.message || "");
  const source = String(payload?.source || "");
  const url = String(payload?.url || "");
  if (!message.trim()) return true;
  if (isExtensionUrl(source) || isExtensionUrl(url)) return true;
  if (
    message.includes("ResizeObserver loop limit exceeded") ||
    message.includes("Non-Error promise rejection captured")
  ) {
    return true;
  }
  return false;
};

const buildKey = (payload) =>
  [
    payload.message || "",
    payload.source || "",
    payload.line || "",
    payload.col || "",
  ].join("|");

export function createClientErrorReporter({ backendUrl, getUid }) {
  const send = (payload) => {
    if (!shouldSample()) return;
    if (shouldIgnorePayload(payload)) return;

    const normalized = {
      message: sanitizeText(payload.message, 500),
      stack: sanitizeText(payload.stack, 2000),
      source: normalizeUrl(payload.source),
      url: normalizeUrl(payload.url || window.location.href),
      line: Number.isFinite(payload.line) ? payload.line : null,
      col: Number.isFinite(payload.col) ? payload.col : null,
      uid: sanitizeText(getUid?.(), 128),
    };

    const key = buildKey(normalized);
    if (!allowByThrottle(key)) return;

    fetch(`${backendUrl}/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    }).catch(() => {});
  };

  return {
    reportWindowError(event) {
      send({
        message: event?.message || "Unknown error",
        stack: event?.error?.stack || "",
        source: event?.filename || "",
        line: event?.lineno || null,
        col: event?.colno || null,
      });
    },
    reportUnhandledRejection(event) {
      const reason = event?.reason || {};
      send({
        message: reason?.message || "Unhandled promise rejection",
        stack: reason?.stack || String(reason || ""),
      });
    },
  };
}
