export function formatTournamentDate(ms, lang = "en") {
  if (!ms) return "-";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(lang, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCountdown(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "0m";
  const minutes = Math.floor(value / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatBracketTypeLabel(bracketType) {
  const key = String(bracketType || "").trim();
  if (key === "single_elimination") return "Single Elimination";
  if (key === "double_elimination") return "Double Elimination";
  if (key === "group_playoff") return "Group + Play-off";
  return key ? key.replace(/_/g, " ") : "-";
}
