const UID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const MAX_OCR_BASE64_LEN = 2_000_000;

export function cleanText(value, max = 1000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseIntParam(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function isValidUid(uid) {
  return typeof uid === "string" && UID_PATTERN.test(uid);
}

export function isValidBase64Image(value) {
  if (typeof value !== "string") return false;
  if (!value.startsWith("data:image/")) return false;
  const parts = value.split(";base64,");
  if (parts.length !== 2) return false;
  const payload = parts[1];
  if (!payload || payload.length > MAX_OCR_BASE64_LEN) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(payload);
}

export function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
