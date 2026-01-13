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

export default function PlayerProfile() {
  const { t } = useLang();
  const { id: uid } = useParams();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileSocials, setProfileSocials] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [profileRanks, setProfileRanks] = useState(null);
  const [banInfo, setBanInfo] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const backend =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
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
        setBanInfo(data?.ban || null);
      } catch (e) {
        setError(t.profile.empty || "No match history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [uid]);

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
            <h1 className={styles.nickname}>{summary.name}</h1>
            {banInfo?.active && (
              <span className={styles.banBadge}>
                {t.profile?.bannedBadge || "Banned"}
              </span>
            )}
            <div className={styles.nameSocials}>
              {renderSocial("twitch", profileSocials?.twitch)}
              {renderSocial("youtube", profileSocials?.youtube)}
              {renderSocial("tiktok", profileSocials?.tiktok)}
            </div>
          </div>
          <p className={styles.subtitle}>
            {t.profile.matches}: {summary.matches}
          </p>
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
                <div className={styles.rankIconPlaceholder} />
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
  const key = String(rank || "").toLowerCase();
  return `/ranks/${key}.png`;
}

