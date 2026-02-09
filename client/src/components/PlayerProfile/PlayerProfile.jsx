import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "@/components/PlayerProfile/PlayerProfile.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import Achievements from "@/components/Achievements/Achievements";

const backend = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function PlayerProfile() {
  const { t, lang } = useLang();
  const { id: uid } = useParams();
  const { user, claims } = useAuth();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileSocials, setProfileSocials] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [profileRanks, setProfileRanks] = useState(null);
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [banInfo, setBanInfo] = useState(null);
  const [friendStatus, setFriendStatus] = useState("none");
  const [profileFriendDates, setProfileFriendDates] = useState([]);
  const [profileFriendCount, setProfileFriendCount] = useState(null);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(
          `${backend}/player/${uid}?limit=200`
        );
        if (!res.ok) {
          throw new Error("Failed to load");
        }
        const data = await res.json();
        setMatches(Array.isArray(data?.matches) ? data.matches : []);
        setProfileSocials(data?.settings || null);
        setProfileName(data?.name || "");
        setProfileRanks(data?.ranks || null);
        setProfileAvatar(data?.avatar || null);
        setBanInfo(data?.ban || null);
        setProfileFriendDates(Array.isArray(data?.friendDates) ? data.friendDates : []);
        setProfileFriendCount(
          Number.isFinite(data?.friendCount) ? data.friendCount : null
        );
      } catch (e) {
        setError(t.profile.empty || "No match history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [uid]);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!user || !uid || user.uid === uid) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${backend}/friends/status/${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.status) {
          setFriendStatus(data.status);
        }
      } catch {
        // ignore
      }
    };
    fetchStatus();
  }, [user, uid]);

  const handleAddFriend = async () => {
    if (!user || !uid || user.uid === uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backend}/friends/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.status) {
        setFriendStatus(data.status);
      }
    } catch {
      // ignore
    }
  };

  const handleAcceptFriend = async () => {
    if (!user || !uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backend}/friends/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setFriendStatus("friend");
        window.dispatchEvent(new Event("friends-requests-refresh"));
      } else if (data?.status) {
        setFriendStatus(data.status);
      }
    } catch {
      // ignore
    }
  };

  const handleRejectFriend = async () => {
    if (!user || !uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backend}/friends/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        setFriendStatus("none");
        window.dispatchEvent(new Event("friends-requests-refresh"));
      }
    } catch {
      // ignore
    }
  };

  const handleRemoveFriend = async () => {
    if (!user || !uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backend}/friends/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        setFriendStatus("none");
      }
    } catch {
      // ignore
    }
  };

  const summary = useMemo(() => {
    if (!matches.length) return null;

    let wins = 0;
    let losses = 0;

    const total = matches.reduce(
      (acc, m) => {
        acc.score += m.score;
        acc.kills += m.kills;
        acc.deaths += m.deaths;
        acc.assists += m.assists;
        acc.damage += m.damage;
        acc.damageShare += m.damageShare;
        if (m.result === "victory") wins += 1;
        else if (m.result === "defeat") losses += 1;
        return acc;
      },
      {
        score: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        damageShare: 0,
      }
    );

    return {
      name: profileName || matches[0].name,
      matches: matches.length,
      wins,
      losses,
      winrate: ((wins / Math.max(1, wins + losses)) * 100).toFixed(1),
      avgScore: Math.round(total.score / matches.length),
      avgKills: Math.round(total.kills / matches.length),
      avgDeaths: Math.round(total.deaths / matches.length),
      avgAssists: Math.round(total.assists / matches.length),
      avgDamage: Math.round(total.damage / matches.length),
      avgDamageShare: (total.damageShare / matches.length).toFixed(1),
      kda: (
        (total.kills + total.assists) /
        Math.max(1, total.deaths)
      ).toFixed(2),
    };
  }, [matches]);

  const avatarUrl = useMemo(() => {
    if (!uid) return null;
    const isDiscord = uid.startsWith("discord:");
    const direct =
      typeof profileAvatar === "string" && profileAvatar.startsWith("http")
        ? profileAvatar
        : null;
    if (direct) return direct;

    if (profileAvatar && isDiscord) {
      const discordId = uid.replace("discord:", "");
      return `https://cdn.discordapp.com/avatars/${discordId}/${profileAvatar}.png`;
    }

    if (user?.uid === uid && claims?.avatar && isDiscord) {
      const discordId = uid.replace("discord:", "");
      return `https://cdn.discordapp.com/avatars/${discordId}/${claims.avatar}.png`;
    }

    return null;
  }, [profileAvatar, uid, user, claims]);

  const shareUrl = useMemo(() => {
    if (!uid) return "";
    const base = `${backend.replace(/\/+$/, "")}/share/player/${encodeURIComponent(uid)}`;
    return lang ? `${base}?lang=${encodeURIComponent(lang)}` : base;
  }, [uid, lang]);

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.prompt(t.profile?.sharePrompt || "Copy link:", shareUrl);
      }
      setShareStatus(t.profile?.shareCopied || "Link copied");
      window.setTimeout(() => setShareStatus(""), 2000);
    } catch {
      setShareStatus(t.profile?.shareFailed || "Copy failed");
      window.setTimeout(() => setShareStatus(""), 2000);
    }
  };

  if (loading) {
    return <p className={styles.wrapper}>{t.profile.loading}</p>;
  }

  if (!matches.length || !summary) {
    return <p className={styles.wrapper}>{error || t.profile.empty}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <Link to="/players" className={styles.backLink}>
        {t.profile.back}
      </Link>

      <div className={styles.header}>
        <div>
          <div className={styles.nameRow}>
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={summary.name}
                className={styles.avatar}
                loading="lazy"
              />
            )}
            <h1 className={styles.nickname}>{summary.name}</h1>
            {banInfo?.active && (
              <span className={styles.banBadge}>
                {t.profile?.bannedBadge || "Banned"}
              </span>
            )}
            <button
              type="button"
              className={styles.shareButton}
              onClick={handleCopyShare}
              title={t.profile?.share || "Share profile"}
              aria-label={t.profile?.share || "Share profile"}
            >
              <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                <path
                  d="M18 16a3 3 0 0 0-2.4 1.2L8.9 13a3.1 3.1 0 0 0 0-2l6.7-4.2A3 3 0 1 0 15 5a3 3 0 0 0 .1.7L8.4 9.9a3 3 0 1 0 0 4.2l6.7 4.2A3 3 0 1 0 18 16Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            {shareStatus && (
              <span className={styles.shareHint}>{shareStatus}</span>
            )}
            <div className={styles.nameSocials}>
              {renderSocial("twitch", profileSocials?.twitch)}
              {renderSocial("youtube", profileSocials?.youtube)}
              {renderSocial("tiktok", profileSocials?.tiktok)}
            </div>
            {user && user.uid !== uid && friendStatus !== "incoming" && (
              <>
                <button
                  className={`${styles.friendButton} ${
                    friendStatus === "friend"
                      ? styles.friendButtonDone
                      : friendStatus === "outgoing"
                      ? styles.friendButtonPending
                      : ""
                  }`}
                  onClick={handleAddFriend}
                  disabled={friendStatus !== "none"}
                  aria-label={t.friends?.add || "Add friend"}
                >
                  {friendStatus === "friend" && (
                    <span className={styles.friendIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="img">
                        <path
                          d="M8.2 12.1a4 4 0 1 1 3.6-6.1 4 4 0 0 1-3.6 6.1Zm7.1-1.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm-6.8 1.6c2.6 0 5.7 1.3 5.7 3.9v1H2.5v-1c0-2.6 3.1-3.9 5.9-3.9Zm12-1.4 1.1 1.1-4.3 4.3-2.2-2.2 1.1-1.1 1.1 1.1 3.2-3.2Z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                  )}
                  {friendStatus === "outgoing" && (
                    <span className={styles.friendStatusText}>
                      {t.friends?.pending || "Request sent"}
                    </span>
                  )}
                  {friendStatus === "none" && (
                    <span className={styles.friendIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="img">
                        <path
                          d="M8.2 12.1a4 4 0 1 1 3.6-6.1 4 4 0 0 1-3.6 6.1Zm7.1-1.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm-6.8 1.6c2.6 0 5.7 1.3 5.7 3.9v1H2.5v-1c0-2.6 3.1-3.9 5.9-3.9Zm6.5.4h1.2v2.2h2.2v1.2h-2.2v2.2H15v-2.2h-2.2v-1.2H15v-2.2Z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                  )}
                </button>
                {friendStatus === "friend" && (
                  <button
                    className={`${styles.friendButton} ${styles.friendButtonRemove}`}
                    onClick={handleRemoveFriend}
                    aria-label={t.friends?.remove || "Remove friend"}
                  >
                    <span className={styles.friendIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="img">
                        <path
                          d="M8.2 12.1a4 4 0 1 1 3.6-6.1 4 4 0 0 1-3.6 6.1Zm7.1-1.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm-6.8 1.6c2.6 0 5.7 1.3 5.7 3.9v1H2.5v-1c0-2.6 3.1-3.9 5.9-3.9Zm6.2 1.7h5.4v1.6h-5.4z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
          <p className={styles.subtitle}>
            {t.profile.matches}: {summary.matches}
          </p>
          {user && user.uid !== uid && friendStatus === "incoming" && (
            <div className={styles.friendActions}>
              <button
                className={`${styles.friendButton} ${styles.friendButtonAccept}`}
                onClick={handleAcceptFriend}
              >
                {t.friends?.accept || "Accept"}
              </button>
              <button
                className={`${styles.friendButton} ${styles.friendButtonReject}`}
                onClick={handleRejectFriend}
              >
                {t.friends?.reject || "Reject"}
              </button>
            </div>
          )}
        </div>
        <div className={styles.headerStats}>
          <div className={styles.headerStat}>
            <span className={styles.headerLabel}>{t.profile.wins}</span>
            <span className={`${styles.headerValue} ${styles.good}`}>
              {summary.wins}
            </span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.headerLabel}>{t.profile.losses}</span>
            <span className={`${styles.headerValue} ${styles.bad}`}>
              {summary.losses}
            </span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.headerLabel}>{t.profile.winrate}</span>
            <span className={styles.headerValue}>{summary.winrate}%</span>
          </div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <Stat label={t.profile.score} value={summary.avgScore} />
        <Stat label={t.profile.kills} value={summary.avgKills} />
        <Stat label={t.profile.deaths} value={summary.avgDeaths} />
        <Stat label={t.profile.assists} value={summary.avgAssists} />
        <Stat label={t.profile.kda} value={summary.kda} />
        <Stat label={t.profile.damage} value={summary.avgDamage} />
        <Stat
          label={t.profile.damageShare}
          value={`${summary.avgDamageShare}%`}
        />
      </div>

      <div className={styles.rankCard}>
        <h2 className={styles.rankTitle}>
          {t.profile.ranks || "Ranks"}
        </h2>
        <div className={styles.rankGrid}>
          {["s1", "s2", "s3", "s4"].map((season) => (
            <div
              key={season}
              className={`${styles.rankItem} ${
                profileRanks?.[season]?.rank ? "" : styles.rankEmpty
              }`}
            >
              <div className={styles.rankSeason}>
                {season.toUpperCase()}
              </div>
              {profileRanks?.[season]?.rank ? (
                <img
                  className={styles.rankIcon}
                  src={rankIconSrc(profileRanks[season].rank)}
                  alt={formatRank(profileRanks[season].rank, t)}
                />
              ) : (
                <img
                  className={styles.rankIcon}
                  src={rankIconSrc("unranked")}
                  alt={t.profile.rankNone || "Not verified"}
                />
              )}
              <div
                className={`${styles.rankValue} ${
                  profileRanks?.[season]?.rank
                    ? styles[`rank${rankClass(profileRanks[season].rank)}`]
                    : ""
                }`}
              >
                {profileRanks?.[season]?.rank
                  ? formatRank(profileRanks[season].rank, t)
                  : t.profile.rankNone || "Not verified"}
              </div>
            </div>
            ))}
          </div>
        </div>

      <Achievements
        matches={matches}
        friendDates={profileFriendDates}
        friendCount={profileFriendCount}
        mode="summary"
      />

      <div className={styles.chartCard}>
        <h2 className={styles.chartTitle}>{t.profile.progress}</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={matches}>
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="score"
              stroke="#6366f1"
              strokeWidth={2}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="kills"
              stroke="#22d3ee"
              strokeWidth={2}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="deaths"
              stroke="#ef4444"
              strokeWidth={2}
            />
            <CartesianGrid stroke="#374151" strokeDasharray="4 4" />
            <XAxis dataKey="index" />
            <YAxis yAxisId="left" />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip
              labelFormatter={() => ""}
              contentStyle={{
                background: "rgba(9, 12, 20, 0.92)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
                color: "#e2e8f0",
              }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={({ color }) => ({ color })}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

function renderSocial(type, value) {
  if (!value) return null;
  const url = normalizeSocialUrl(type, value);
  const label =
    type === "twitch" ? "Twitch" : type === "youtube" ? "YouTube" : "TikTok";
  return (
    <a
      key={type}
      className={`${styles.socialIcon} ${
        styles[
          type === "twitch"
            ? "socialTwitch"
            : type === "youtube"
            ? "socialYouTube"
            : "socialTikTok"
        ]
      }`}
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
    >
      <img
        src={
          type === "twitch"
            ? "/twitch.png"
            : type === "youtube"
            ? "/yt.png"
            : "/tiktok.png"
        }
        alt={label}
      />
    </a>
  );
}

function normalizeSocialUrl(type, value) {
  const v = String(value).trim();
  if (!v) return "#";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (type === "twitch") return `https://twitch.tv/${v.replace(/^@/, "")}`;
  if (type === "youtube") return `https://youtube.com/${v.replace(/^@/, "@")}`;
  return `https://tiktok.com/${v.replace(/^@/, "")}`;
}

function formatRank(rank, t) {
  const key = String(rank || "").toLowerCase();
  if (key === "bronze") return t.profile?.rankBronze || "Bronze";
  if (key === "silver") return t.profile?.rankSilver || "Silver";
  if (key === "gold") return t.profile?.rankGold || "Gold";
  if (key === "platinum") return t.profile?.rankPlatinum || "Platinum";
  if (key === "diamond") return t.profile?.rankDiamond || "Diamond";
  if (key === "master") return t.profile?.rankMaster || "Master";
  if (key === "ace") return t.profile?.rankAce || "Ace";
  if (key === "punkmaster") return t.profile?.rankPunkmaster || "Punkmaster";
  return rank;
}

function rankClass(rank) {
  const key = String(rank || "").toLowerCase();
  if (key === "bronze") return "Bronze";
  if (key === "silver") return "Silver";
  if (key === "gold") return "Gold";
  if (key === "platinum") return "Platinum";
  if (key === "diamond") return "Diamond";
  if (key === "master") return "Master";
  if (key === "ace") return "Ace";
  if (key === "punkmaster") return "Punkmaster";
  return "";
}

function rankIconSrc(rank) {
  const key = String(rank || "unranked").toLowerCase();
  return `/ranks/${key}.png`;
}

