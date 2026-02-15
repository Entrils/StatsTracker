import { useEffect, useState } from "react";
import styles from "@/pages/Admin/Admin.module.css";
import { useAuth } from "@/auth/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function Admin() {
  const { user, claims } = useAuth();
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankItems, setRankItems] = useState([]);
  const [banLoading, setBanLoading] = useState(false);
  const [banItems, setBanItems] = useState([]);
  const [banUid, setBanUid] = useState("");
  const [banReason, setBanReason] = useState("");
  const [eloLoading, setEloLoading] = useState(false);
  const [eloItems, setEloItems] = useState([]);
  const [eloRecomputeLoading, setEloRecomputeLoading] = useState(false);
  const [eloRecomputeStatus, setEloRecomputeStatus] = useState("");
  const [eloRecomputeTone, setEloRecomputeTone] = useState("");

  const isAdmin = claims?.admin === true || claims?.role === "admin";

  const handleRebuild = async () => {
    if (!user) {
      setStatus("Login required");
      setTone("bad");
      return;
    }
    setLoading(true);
    setStatus("Rebuilding...");
    setTone("neutral");

    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/leaderboard/rebuild`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(data?.error || "Rebuild failed");
        setTone("bad");
        return;
      }

      setStatus(`Rebuild done. Players: ${data?.players ?? "?"}`);
      setTone("good");
    } catch (err) {
      setStatus("Rebuild failed");
      setTone("bad");
    } finally {
      setLoading(false);
    }
  };

  const loadErrors = async () => {
    if (!user) return;
    setErrorLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/client-error/recent?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setErrors(Array.isArray(data?.errors) ? data.errors : []);
      } else {
        setErrors([]);
      }
    } finally {
      setErrorLoading(false);
    }
  };

  const loadRankSubmissions = async () => {
    if (!user) return;
    setRankLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${BACKEND_URL}/admin/ranks?status=pending&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => null);
      setRankItems(Array.isArray(data?.rows) ? data.rows : []);
    } finally {
      setRankLoading(false);
    }
  };

  const decideRank = async (id, decision) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/admin/ranks/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, decision }),
      });
      if (res.ok) {
        setRankItems((items) => items.filter((r) => r.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const loadBans = async () => {
    if (!user) return;
    setBanLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/admin/bans?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      setBanItems(Array.isArray(data?.rows) ? data.rows : []);
    } finally {
      setBanLoading(false);
    }
  };

  const loadHiddenElo = async () => {
    if (!user) return;
    setEloLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/admin/hidden-elo?limit=20&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      setEloItems(Array.isArray(data?.rows) ? data.rows : []);
    } finally {
      setEloLoading(false);
    }
  };

  const recomputeHiddenElo = async () => {
    if (!user) return;
    setEloRecomputeLoading(true);
    setEloRecomputeStatus("Recomputing hidden ELO...");
    setEloRecomputeTone("neutral");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/admin/hidden-elo/recompute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEloRecomputeStatus(data?.error || "Recompute failed");
        setEloRecomputeTone("bad");
        return;
      }
      setEloRecomputeStatus(
        `Done. Updated: ${data?.processedLeaderboard ?? 0}, created: ${
          data?.createdFromUsers ?? 0
        }`
      );
      setEloRecomputeTone("good");
      await loadHiddenElo();
    } catch {
      setEloRecomputeStatus("Recompute failed");
      setEloRecomputeTone("bad");
    } finally {
      setEloRecomputeLoading(false);
    }
  };

  const submitBan = async () => {
    if (!user || !banUid.trim()) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${BACKEND_URL}/admin/bans/ban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: banUid.trim(), reason: banReason.trim() }),
      });
      setBanUid("");
      setBanReason("");
      loadBans();
    } catch {
      // ignore
    }
  };

  const submitUnban = async (uid) => {
    if (!user || !uid) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${BACKEND_URL}/admin/bans/unban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });
      loadBans();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    loadRankSubmissions();
    loadBans();
    loadHiddenElo();
  }, [user, isAdmin]);

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.hint}>Login required</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.hint}>Access denied</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Admin</h1>
      <div className={styles.sectionGrid}>
        <div className={`${styles.section} ${styles.hiddenEloSection}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Leaderboard rebuild</h2>
          </div>
          <p className={styles.hint}>
            Rebuild leaderboard from users matches
          </p>
          <button
            className={styles.button}
            onClick={handleRebuild}
            disabled={loading}
          >
            {loading ? "Rebuilding..." : "Rebuild leaderboard"}
          </button>
          {status && (
            <p
              className={`${styles.status} ${
                tone === "good"
                  ? styles.statusOk
                  : tone === "bad"
                  ? styles.statusBad
                  : ""
              }`}
            >
              {status}
            </p>
          )}
        </div>
        <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Top Hidden ELO</h2>
          <div className={styles.actionsRow}>
            <button
              className={styles.smallButton}
              onClick={loadHiddenElo}
              disabled={eloLoading || eloRecomputeLoading}
            >
              {eloLoading ? "Loading..." : "Refresh"}
            </button>
            <button
              className={styles.smallButton}
              onClick={recomputeHiddenElo}
              disabled={eloRecomputeLoading || eloLoading}
            >
              {eloRecomputeLoading ? "Recomputing..." : "Recompute all"}
            </button>
          </div>
        </div>

        {eloRecomputeStatus && (
          <p
            className={`${styles.status} ${
              eloRecomputeTone === "good"
                ? styles.statusOk
                : eloRecomputeTone === "bad"
                ? styles.statusBad
                : ""
            }`}
          >
            {eloRecomputeStatus}
          </p>
        )}

        {!eloItems.length && (
          <p className={styles.hint}>No hidden ELO data yet.</p>
        )}

        {!!eloItems.length && (
          <div className={styles.eloList}>
            {eloItems.map((item, i) => (
              <div key={item.uid || i} className={styles.eloItem}>
                <div className={styles.eloLeft}>
                  <span className={styles.eloRank}>#{i + 1}</span>
                  <span className={styles.eloName}>{item.name || item.uid}</span>
                </div>
                <div className={styles.eloRight}>
                  <span className={styles.eloValue}>{Math.round(item.hiddenElo || 0)}</span>
                  <span className={styles.eloMeta}>
                    {Math.round(item.winrate || 0)}% WR • {Math.round(item.matches || 0)} m
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Client errors</h2>
          <button
            className={styles.smallButton}
            onClick={loadErrors}
            disabled={errorLoading}
          >
            {errorLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!errors.length && (
          <p className={styles.hint}>No client errors logged yet.</p>
        )}

        {!!errors.length && (
          <div className={styles.errorList}>
            {errors.map((err) => (
              <div key={err.id} className={styles.errorItem}>
                <div className={styles.errorMessage}>{err.message}</div>
                <div className={styles.errorMeta}>
                  {err.url || "Unknown URL"} •{" "}
                  {err.ts ? new Date(err.ts).toLocaleString() : "Unknown time"}
                </div>
                {err.stack && (
                  <pre className={styles.errorStack}>{err.stack}</pre>
                )}
              </div>
            ))}
          </div>
        )}
        </div>

        <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Rank verification</h2>
          <button
            className={styles.smallButton}
            onClick={loadRankSubmissions}
            disabled={rankLoading}
          >
            {rankLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!rankItems.length && (
          <p className={styles.hint}>No pending submissions.</p>
        )}

        {!!rankItems.length && (
          <div className={styles.rankList}>
            {rankItems.map((item) => (
              <div key={item.id} className={styles.rankItem}>
                <div className={styles.rankMeta}>
                  <div className={styles.rankTitleLine}>
                    <span className={styles.rankName}>
                      {item.name || item.uid}
                    </span>
                    <span className={styles.rankBadge}>
                      {String(item.season || "").toUpperCase()}
                    </span>
                    <span className={styles.rankBadgeAlt}>
                      {String(item.rank || "")}
                    </span>
                  </div>
                  <div className={styles.rankSub}>
                    {item.createdAt?.seconds
                      ? new Date(item.createdAt.seconds * 1000).toLocaleString()
                      : "—"}
                  </div>
                </div>

                {item.image && (
                  <div className={styles.rankPreview}>
                    <img src={item.image} alt="Rank proof" />
                  </div>
                )}

                <div className={styles.rankActions}>
                  <button
                    className={styles.rankApprove}
                    onClick={() => decideRank(item.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    className={styles.rankReject}
                    onClick={() => decideRank(item.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Bans</h2>
          <button
            className={styles.smallButton}
            onClick={loadBans}
            disabled={banLoading}
          >
            {banLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className={styles.banForm}>
          <input
            className={styles.banInput}
            placeholder="User UID"
            value={banUid}
            onChange={(e) => setBanUid(e.target.value)}
          />
          <input
            className={styles.banInput}
            placeholder="Reason (optional)"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
          <button className={styles.banButton} onClick={submitBan}>
            Ban user
          </button>
        </div>

        {!banItems.length && (
          <p className={styles.hint}>No bans yet.</p>
        )}

        {!!banItems.length && (
          <div className={styles.banList}>
            {banItems.map((ban) => (
              <div key={ban.id} className={styles.banItem}>
                <div className={styles.banMeta}>
                  <div className={styles.banUid}>{ban.uid || ban.id}</div>
                  <div className={styles.banReason}>
                    {ban.reason || "No reason provided"}
                  </div>
                </div>
                <div className={styles.banActions}>
                  {ban.active ? (
                    <button
                      className={styles.banUnban}
                      onClick={() => submitUnban(ban.uid || ban.id)}
                    >
                      Unban
                    </button>
                  ) : (
                    <span className={styles.banInactive}>Inactive</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
