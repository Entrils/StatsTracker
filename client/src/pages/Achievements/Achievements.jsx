import { useEffect, useState } from "react";
import Achievements from "@/components/Achievements/Achievements";
import styles from "@/pages/Achievements/Achievements.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function AchievementsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [matches, setMatches] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const friendsRes = await fetch(`${BACKEND_URL}/friends/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const friendsData = await friendsRes.json().catch(() => null);
        if (!alive) return;
        setFriends(Array.isArray(friendsData?.rows) ? friendsData.rows : []);

        const matchesRes = await fetch(`${BACKEND_URL}/player/${user.uid}?limit=500`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const matchesData = await matchesRes.json().catch(() => null);
        if (!alive) return;
        setMatches(Array.isArray(matchesData?.matches) ? matchesData.matches : []);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) {
    return <div className={styles.wrapper}>{t.friends?.login || "Login required"}</div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t.achievements?.title || "Achievements"}</h1>
        <span className={styles.hint}>
          {t.achievements?.hint || "Your progress and unlock dates"}
        </span>
      </div>
      {loading ? (
        <div className={styles.hint}>{t.friends?.loading || "Loading..."}</div>
      ) : (
        <Achievements
          matches={matches}
          friends={friends}
          friendDates={friends.map((f) => f.createdAt).filter(Boolean)}
        />
      )}
    </div>
  );
}
