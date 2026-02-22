import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { round1 } from "@/utils/myProfile/math";
import { dedupedJsonRequest } from "@/utils/network/dedupedFetch";

export default function useProfileRemoteData({ uid, user, summary, backendUrl }) {
  const [profileRanks, setProfileRanks] = useState(null);
  const [profileElo, setProfileElo] = useState(0);
  const [banInfo, setBanInfo] = useState(null);
  const [globalAvg, setGlobalAvg] = useState(null);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [globalRanks, setGlobalRanks] = useState(null);
  const [globalMeans, setGlobalMeans] = useState(null);
  const [globalMatchMeans, setGlobalMatchMeans] = useState(null);
  const [loadingRanks, setLoadingRanks] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendId, setFriendId] = useState("");

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const loadProfile = async () => {
      try {
        const data = await dedupedJsonRequest(
          `player-profile-lite:${uid}`,
          async () => {
            const res = await fetch(`${backendUrl}/player/${uid}?limit=1&lite=1`);
            if (!res.ok) {
              const error = new Error("Failed to load profile");
              error.status = res.status;
              throw error;
            }
            return res.json();
          },
          2500
        );
        if (!alive) return;
        setProfileRanks(data?.ranks || null);
        setProfileElo(Number.isFinite(Number(data?.elo)) ? Number(data.elo) : 0);
        setBanInfo(data?.ban || null);
      } catch {
        // Secondary backend fallback.
        try {
          const data = await dedupedJsonRequest(
            `profile:${uid}`,
            async () => {
              const res = await fetch(`${backendUrl}/profile/${uid}?lite=1`);
              if (!res.ok) {
                const error = new Error("Failed to load profile");
                error.status = res.status;
                throw error;
              }
              return res.json();
            },
            2500
          );
          if (!alive) return;
          setProfileRanks(data?.ranks || null);
          setProfileElo(Number.isFinite(Number(data?.elo)) ? Number(data.elo) : 0);
          setBanInfo(data?.ban || null);
          return;
        } catch {
          // ignore and continue to Firestore fallback below
        }
        // Fallback for local/dev rate limits: read own ranks directly from Firestore.
        try {
          const ranksSnap = await getDoc(doc(db, "users", uid, "profile", "ranks"));
          if (!alive) return;
          setProfileRanks(ranksSnap.exists() ? ranksSnap.data() || null : null);
          setProfileElo(0);
        } catch {
          if (alive) {
            setProfileRanks(null);
            setProfileElo(0);
          }
        }
      }
    };
    loadProfile();
    return () => {
      alive = false;
    };
  }, [uid, backendUrl]);

  useEffect(() => {
    if (!summary) return;
    const controller = new AbortController();
    setLoadingGlobal(true);
    setGlobalAvg(null);
    setGlobalMeans(null);
    setGlobalMatchMeans(null);
    setGlobalRanks(null);
    setLoadingRanks(true);

    const metrics = {
      matches: summary.matchesCount,
      wins: summary.wins,
      losses: summary.losses,
      avgScore: summary.avgScoreRaw,
      avgKills: summary.avgKillsRaw,
      avgDeaths: summary.avgDeathsRaw,
      avgAssists: summary.avgAssistsRaw,
      avgDamage: summary.avgDamageRaw,
      avgDamageShare: summary.avgDamageShareRaw,
      kda: summary.kdaRaw,
      winrate: summary.winrateRaw,
    };

    dedupedJsonRequest(
      `percentiles:${JSON.stringify(metrics)}`,
      async () => {
        const res = await fetch(`${backendUrl}/stats/percentiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metrics }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const error = new Error("Failed to load percentiles");
          error.status = res.status;
          throw error;
        }
        return res.json();
      },
      2500
    )
      .then((data) => {
        if (!data) return;
        setGlobalRanks(data.percentiles || null);
        setGlobalMeans(data.averages || null);
        setGlobalMatchMeans(data.matchAverages || null);
        if (data.matchAverages) {
          const m = data.matchAverages;
          setGlobalAvg({
            count: data.matchCount || 0,
            avgScore: Math.round(m.avgScore || 0),
            avgKills: Math.round(m.avgKills || 0),
            avgDeaths: Math.round(m.avgDeaths || 0),
            avgAssists: Math.round(m.avgAssists || 0),
            avgDamage: Math.round(m.avgDamage || 0),
            avgDamageShare: round1(m.avgDamageShare || 0),
            kda: round1(m.kda || 0),
          });
        }
      })
      .catch(() => {
        setGlobalAvg(null);
      })
      .finally(() => {
        setLoadingGlobal(false);
        setLoadingRanks(false);
      });

    return () => controller.abort();
  }, [summary, backendUrl]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const loadFriends = async () => {
      setFriendsLoading(true);
      try {
        const token = await user.getIdToken();
        const data = await dedupedJsonRequest(
          `friends-list:full:${user.uid}`,
          async () => {
            const res = await fetch(`${backendUrl}/friends/list?view=full`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              const error = new Error("Failed to load friends list");
              error.status = res.status;
              throw error;
            }
            return res.json();
          },
          2500
        );
        if (!alive) return;
        setFriends(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (alive) setFriends([]);
      } finally {
        if (alive) setFriendsLoading(false);
      }
    };
    loadFriends();
    return () => {
      alive = false;
    };
  }, [user, backendUrl]);

  useEffect(() => {
    if (!friends.length) return;
    setFriendId((prev) => prev || friends[0]?.uid || "");
  }, [friends]);

  return {
    profileRanks,
    profileElo,
    banInfo,
    globalAvg,
    loadingGlobal,
    globalRanks,
    globalMeans,
    globalMatchMeans,
    loadingRanks,
    friends,
    friendsLoading,
    friendId,
    setFriendId,
  };
}
