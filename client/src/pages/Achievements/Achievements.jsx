import { useEffect, useState } from "react";
import Achievements from "@/components/Achievements/Achievements";
import styles from "@/pages/Achievements/Achievements.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import PageState from "@/components/StateMessage/PageState";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function AchievementsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [matches, setMatches] = useState([]);
  const [friendMeta, setFriendMeta] = useState({
    friendCount: 0,
    milestoneDates: {},
    latestFriendAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const friendsRes = await fetch(`${BACKEND_URL}/friends/meta`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const friendsData = await friendsRes.json().catch(() => null);
        if (!friendsRes.ok) {
          throw new Error(friendsData?.error || t.achievements?.loadError || "Failed to load achievements");
        }
        if (!alive) return;
        const friendCountRaw = Number(friendsData?.friendCount ?? friendsData?.count);
        setFriendMeta({
          friendCount: Number.isFinite(friendCountRaw) ? friendCountRaw : 0,
          milestoneDates:
            friendsData?.milestoneDates && typeof friendsData.milestoneDates === "object"
              ? friendsData.milestoneDates
              : {},
          latestFriendAt: friendsData?.latestFriendAt || null,
        });

        const matchesRes = await fetch(`${BACKEND_URL}/player/${user.uid}?limit=500`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const matchesData = await matchesRes.json().catch(() => null);
        if (!matchesRes.ok) {
          throw new Error(matchesData?.error || t.achievements?.loadError || "Failed to load achievements");
        }
        if (!alive) return;
        setMatches(Array.isArray(matchesData?.matches) ? matchesData.matches : []);
      } catch (err) {
        if (alive) {
          setError(err?.message || t.achievements?.loadError || "Failed to load achievements");
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [t.achievements?.loadError, user]);

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <PageState
          error={t.friends?.login || "Login required"}
          errorText={t.friends?.login || "Login required"}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t.achievements?.title || "Achievements"}</h1>
        <span className={styles.hint}>
          {t.achievements?.hint || "Your progress and unlock dates"}
        </span>
      </div>
      <PageState
        loading={loading}
        error={error}
        loadingText={t.friends?.loading || "Loading..."}
        errorText={error}
      >
        <Achievements
          matches={matches}
          friendCount={friendMeta.friendCount}
          friendMilestones={friendMeta.milestoneDates}
          friendDates={
          friendMeta.latestFriendAt ? [friendMeta.latestFriendAt] : []
          }
        />
      </PageState>
    </div>
  );
}
