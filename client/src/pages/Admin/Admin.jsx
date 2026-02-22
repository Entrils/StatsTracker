import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/pages/Admin/Admin.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import PageState from "@/components/StateMessage/PageState";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const UX_PERIODS = [7, 14, 30];
const UX_EVENT_FALLBACKS = {
  activation_target_action: {
    title: "Activation target action",
    hint: "Reached key action after opening Players leaderboard.",
  },
  time_to_value_insight: {
    title: "Time to value insight",
    hint: "Time until user sees meaningful value in profile analytics.",
  },
  upload_completion: {
    title: "Upload completion",
    hint: "Successful upload flow completions.",
  },
  tournament_register_conversion: {
    title: "Tournament register conversion",
    hint: "Completed tournament registration actions.",
  },
};

function UxBars({ points = [] }) {
  const safe = Array.isArray(points) ? points : [];
  const max = Math.max(1, ...safe.map((p) => Number(p?.count) || 0));
  return (
    <div className={styles.uxChart}>
      {safe.map((point) => {
        const value = Number(point?.count) || 0;
        const avgMs = Number.isFinite(Number(point?.avgMs))
          ? Math.round(Number(point.avgMs))
          : null;
        const h = Math.max(6, Math.round((value / max) * 100));
        const title = avgMs === null
          ? `${point.day}: ${value}`
          : `${point.day}: ${value} | avg ${avgMs} ms`;
        return (
          <div key={point.day} className={styles.uxBarWrap} title={title}>
            <div className={styles.uxBar} style={{ height: `${h}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function formatDayLabel(day) {
  if (!day) return "";
  const ts = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ts)) return day;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildAxisLabels(dayKeys = [], points = []) {
  const source = Array.isArray(dayKeys) && dayKeys.length
    ? dayKeys
    : points.map((p) => p.day).filter(Boolean);
  if (!source.length) return [];
  if (source.length <= 2) return source;
  const middle = source[Math.floor(source.length / 2)];
  const out = [source[0], middle, source[source.length - 1]];
  return out.filter((v, i) => out.indexOf(v) === i);
}

export default function Admin() {
  const { user, claims } = useAuth();
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState("tech");
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
  const [uxLoading, setUxLoading] = useState(false);
  const [uxDays, setUxDays] = useState(14);
  const [uxRows, setUxRows] = useState([]);
  const [uxDayKeys, setUxDayKeys] = useState([]);

  const isAdmin = claims?.admin === true || claims?.role === "admin";
  const adminT = t?.admin || {};
  const uxT = adminT?.ux || {};
  const tabsT = adminT?.tabs || {};
  const sectionT = adminT?.sections || {};

  const uxEventMap = useMemo(() => {
    const translated = uxT?.events || {};
    const merged = { ...UX_EVENT_FALLBACKS };
    for (const [event, fallback] of Object.entries(UX_EVENT_FALLBACKS)) {
      const next = translated?.[event];
      if (next && typeof next === "object") {
        merged[event] = {
          title: next.title || fallback.title,
          hint: next.hint || fallback.hint,
        };
      }
    }
    return merged;
  }, [uxT?.events]);

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
    } catch {
      setStatus("Rebuild failed");
      setTone("bad");
    } finally {
      setLoading(false);
    }
  };

  const loadErrors = useCallback(async () => {
    if (!user) return;
    setErrorLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/client-error/recent?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      setErrors(res.ok && Array.isArray(data?.errors) ? data.errors : []);
    } finally {
      setErrorLoading(false);
    }
  }, [user]);

  const loadRankSubmissions = useCallback(async () => {
    if (!user) return;
    setRankLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/admin/ranks?status=pending&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      setRankItems(Array.isArray(data?.rows) ? data.rows : []);
    } finally {
      setRankLoading(false);
    }
  }, [user]);

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
      if (res.ok) setRankItems((items) => items.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  };

  const loadBans = useCallback(async () => {
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
  }, [user]);

  const loadUxMetrics = useCallback(async (days = 14) => {
    if (!user) return;
    setUxLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/admin/analytics/ux?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setUxRows([]);
        setUxDayKeys([]);
        return;
      }
      setUxDays(Number.isFinite(Number(data?.days)) ? Number(data.days) : 14);
      setUxRows(Array.isArray(data?.rows) ? data.rows : []);
      setUxDayKeys(Array.isArray(data?.dayKeys) ? data.dayKeys : []);
    } finally {
      setUxLoading(false);
    }
  }, [user]);

  const pickUxPeriod = async (days) => {
    if (uxLoading) return;
    setUxDays(days);
    await loadUxMetrics(days);
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
    loadUxMetrics(14);
    loadErrors();
  }, [user, isAdmin, loadBans, loadErrors, loadRankSubmissions, loadUxMetrics]);

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>{adminT?.title || "Admin"}</h1>
        <PageState
          error={adminT?.loginRequired || "Login required"}
          errorText={adminT?.loginRequired || "Login required"}
        />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>{adminT?.title || "Admin"}</h1>
        <PageState
          error={adminT?.accessDenied || "Access denied"}
          errorText={adminT?.accessDenied || "Access denied"}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.wrapper} ${activeTab === "ux" ? styles.wrapperWide : ""}`}>
      <h1 className={styles.title}>{adminT?.title || "Admin"}</h1>

      <div className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${activeTab === "tech" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("tech")}
        >
          {tabsT?.tech || "Tech"}
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "community" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("community")}
        >
          {tabsT?.community || "Community"}
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "ux" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("ux")}
        >
          {tabsT?.ux || "UX metrics"}
        </button>
      </div>

      {activeTab === "tech" && (
        <div className={styles.sectionGrid}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{sectionT?.leaderboardRebuild || "Leaderboard rebuild"}</h2>
            </div>
            <p className={styles.hint}>{sectionT?.leaderboardRebuildHint || "Rebuild leaderboard from users matches"}</p>
            <button className={styles.button} onClick={handleRebuild} disabled={loading}>
              {loading ? "Rebuilding..." : "Rebuild leaderboard"}
            </button>
            {status && (
              <p className={`${styles.status} ${tone === "good" ? styles.statusOk : tone === "bad" ? styles.statusBad : ""}`}>
                {status}
              </p>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{sectionT?.clientErrors || "Client errors"}</h2>
              <button className={styles.smallButton} onClick={loadErrors} disabled={errorLoading}>
                {errorLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {!errors.length ? (
              <p className={styles.hint}>{sectionT?.noClientErrors || "No client errors logged yet."}</p>
            ) : (
              <div className={styles.errorList}>
                {errors.map((err) => (
                  <div key={err.id} className={styles.errorItem}>
                    <div className={styles.errorMessage}>{err.message}</div>
                    <div className={styles.errorMeta}>
                      {err.url || "Unknown URL"} | {err.ts ? new Date(err.ts).toLocaleString() : "Unknown time"}
                    </div>
                    {err.stack && <pre className={styles.errorStack}>{err.stack}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "community" && (
        <div className={styles.sectionGrid}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{sectionT?.rankVerification || "Rank verification"}</h2>
              <button className={styles.smallButton} onClick={loadRankSubmissions} disabled={rankLoading}>
                {rankLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {!rankItems.length ? (
              <p className={styles.hint}>{sectionT?.noPendingSubmissions || "No pending submissions."}</p>
            ) : (
              <div className={styles.rankList}>
                {rankItems.map((item) => (
                  <div key={item.id} className={styles.rankItem}>
                    <div className={styles.rankMeta}>
                      <div className={styles.rankTitleLine}>
                        <span className={styles.rankName}>{item.name || item.uid}</span>
                        <span className={styles.rankBadge}>{String(item.season || "").toUpperCase()}</span>
                        <span className={styles.rankBadgeAlt}>{String(item.rank || "")}</span>
                      </div>
                      <div className={styles.rankSub}>
                        {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleString() : "-"}
                      </div>
                    </div>
                    {item.image && (
                      <div className={styles.rankPreview}>
                        <img src={item.image} alt="Rank proof" />
                      </div>
                    )}
                    <div className={styles.rankActions}>
                      <button className={styles.rankApprove} onClick={() => decideRank(item.id, "approved")}>
                        Approve
                      </button>
                      <button className={styles.rankReject} onClick={() => decideRank(item.id, "rejected")}>
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
              <h2 className={styles.sectionTitle}>{sectionT?.bans || "Bans"}</h2>
              <button className={styles.smallButton} onClick={loadBans} disabled={banLoading}>
                {banLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            <div className={styles.banForm}>
              <input className={styles.banInput} placeholder="User UID" value={banUid} onChange={(e) => setBanUid(e.target.value)} />
              <input className={styles.banInput} placeholder="Reason (optional)" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
              <button className={styles.banButton} onClick={submitBan}>
                Ban user
              </button>
            </div>
            {!banItems.length ? (
              <p className={styles.hint}>{sectionT?.noBans || "No bans yet."}</p>
            ) : (
              <div className={styles.banList}>
                {banItems.map((ban) => (
                  <div key={ban.id} className={styles.banItem}>
                    <div className={styles.banMeta}>
                      <div className={styles.banUid}>{ban.uid || ban.id}</div>
                      <div className={styles.banReason}>{ban.reason || "No reason provided"}</div>
                    </div>
                    <div className={styles.banActions}>
                      {ban.active ? (
                        <button className={styles.banUnban} onClick={() => submitUnban(ban.uid || ban.id)}>
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
      )}

      {activeTab === "ux" && (
        <div className={styles.sectionGridSingle}>
          <div className={`${styles.section} ${styles.uxFullWidthSection}`}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{uxT?.title || "UX metrics"}</h2>
              <div className={styles.actionsRow}>
                <div className={styles.periodRow}>
                  {UX_PERIODS.map((days) => (
                    <button
                      key={days}
                      className={`${styles.periodButton} ${uxDays === days ? styles.periodButtonActive : ""}`}
                      onClick={() => pickUxPeriod(days)}
                      disabled={uxLoading}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
                <button className={styles.smallButton} onClick={() => loadUxMetrics(uxDays)} disabled={uxLoading}>
                  {uxLoading ? uxT?.loading || "Loading..." : uxT?.refresh || "Refresh"}
                </button>
              </div>
            </div>
            <p className={styles.hint}>{(uxT?.subtitle || "Last {days} days").replace("{days}", String(uxDays))}</p>
            {!uxRows.length ? (
              <p className={styles.hint}>{uxT?.empty || "No UX metrics yet."}</p>
            ) : (
              <div className={styles.uxList}>
                {uxRows.map((row) => {
                  const eventMeta = uxEventMap[row.event] || { title: row.event, hint: "" };
                  const points = Array.isArray(row?.perDay) ? row.perDay : [];
                  const axisLabels = buildAxisLabels(uxDayKeys, points);
                  return (
                    <div key={row.event} className={styles.uxItem}>
                      <div className={styles.uxEvent}>{eventMeta.title}</div>
                      {!!eventMeta.hint && <div className={styles.uxHint}>{eventMeta.hint}</div>}
                      <div className={styles.uxMeta}>
                        <span>{(uxT?.count || "Events")}: {Math.round(Number(row.count || 0))}</span>
                        <span>
                          {(uxT?.avg || "Avg time")}: {Number.isFinite(Number(row.avgMs)) ? `${Math.round(Number(row.avgMs))} ms` : uxT?.avgMissing || "-"}
                        </span>
                      </div>
                      {!!points.length && (
                        <>
                          <UxBars points={points} />
                          <div className={styles.uxAxis}>
                            {axisLabels.map((label) => (
                              <span key={label}>{formatDayLabel(label)}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
