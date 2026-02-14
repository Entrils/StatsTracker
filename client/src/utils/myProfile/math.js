export function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

export function sign(x) {
  return x >= 0 ? "+" : "";
}

export function diffAccent(delta, preferHigher = true) {
  if (delta === 0) return "";
  const good = preferHigher ? delta > 0 : delta < 0;
  return good ? "good" : "bad";
}

export function perfColor(ratio) {
  if (!Number.isFinite(ratio)) return "rgba(255,255,255,0.3)";
  const clamped = Math.max(0, Math.min(2, ratio));
  const t = clamped / 2;
  const hue = Math.round(120 * t);
  return `hsl(${hue} 85% 55%)`;
}

export function perfWidth(ratio) {
  if (!Number.isFinite(ratio)) return "0%";
  const clamped = Math.max(0, Math.min(2, ratio));
  return `${Math.round((clamped / 2) * 100)}%`;
}
