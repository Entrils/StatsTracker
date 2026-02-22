const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const SESSION_KEY = "ux:session-id";

function getSessionId() {
  try {
    const fromStorage = localStorage.getItem(SESSION_KEY);
    if (fromStorage) return fromStorage;
    const next = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "ephemeral-session";
  }
}

export async function trackUxEvent(event, payload = {}) {
  const name = String(event || "").trim();
  if (!name) return false;
  const body = {
    event: name,
    sessionId: getSessionId(),
    valueMs: Number.isFinite(Number(payload.valueMs)) ? Number(payload.valueMs) : undefined,
    meta:
      payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
        ? payload.meta
        : {},
  };

  try {
    await fetch(`${BACKEND_URL}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

