export function formatTeamMatchDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Date(n).toLocaleDateString();
}

export function buildFriendAvatarUrl(friend = {}) {
  const direct = String(friend.avatarUrl || "").trim();
  if (direct) return direct;
  const avatar = String(friend.avatar || "").trim();
  const provider = String(friend.provider || "").trim();
  const uid = String(friend.uid || "").trim();
  if (avatar && avatar.startsWith("http")) return avatar;
  if (provider === "discord" && uid.startsWith("discord:") && avatar) {
    const discordId = uid.replace("discord:", "");
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
  }
  return "";
}
