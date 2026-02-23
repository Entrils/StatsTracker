import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/pages/Admin/Admin.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import PageState from "@/components/StateMessage/PageState";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const UX_PINNED_KEY = "admin_ux_pinned_metrics_v1";
const UX_PERIODS = [7, 14, 30];
const UX_IMPORTANCE_ORDER = [
  "activation_target_action",
  "time_to_value_insight",
  "upload_completion",
  "tournament_register_conversion",
  "goal_engine_impression",
  "goal_engine_click",
  "goal_engine_completed",
  "weekly_digest_open",
  "weekly_digest_click",
  "friend_compare_prompt_click",
  "saved_view_deleted",
];
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
  friend_compare_prompt_click: {
    title: "Friend compare prompt click",
    hint: "Clicks on contextual compare prompts in social blocks.",
  },
  saved_view_deleted: {
    title: "Saved filter cleanup",
    hint: "User removed a saved leaderboard view.",
  },
  goal_engine_impression: {
    title: "Goal engine impression",
    hint: "Displayed next-best-action card in My Profile.",
  },
  goal_engine_click: {
    title: "Goal engine click",
    hint: "User clicked CTA in next-best-action card.",
  },
  goal_engine_completed: {
    title: "Goal transition completed",
    hint: "User moved from previous goal state to a new one.",
  },
  weekly_digest_open: {
    title: "Weekly digest opened",
    hint: "Weekly digest block was opened in My Profile performance tab.",
  },
  weekly_digest_click: {
    title: "Weekly digest CTA click",
    hint: "User clicked weekly digest improvement CTA.",
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

function UxDualBars({ points = [] }) {
  const safe = Array.isArray(points) ? points : [];
  const max = Math.max(
    1,
    ...safe.map((p) => Math.max(Number(p?.open) || 0, Number(p?.click) || 0))
  );
  return (
    <div className={styles.uxDualChart}>
      {safe.map((point) => {
        const open = Number(point?.open) || 0;
        const click = Number(point?.click) || 0;
        const openH = Math.max(4, Math.round((open / max) * 100));
        const clickH = Math.max(4, Math.round((click / max) * 100));
        return (
          <div key={point.day} className={styles.uxDualBarWrap} title={`${point.day}: open ${open}, click ${click}`}>
            <div className={`${styles.uxDualBar} ${styles.uxDualBarOpen}`} style={{ height: `${openH}%` }} />
            <div className={`${styles.uxDualBar} ${styles.uxDualBarClick}`} style={{ height: `${clickH}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function UxCtrLine({ points = [] }) {
  const safe = Array.isArray(points) ? points : [];
  const ctrPoints = safe.map((p, idx) => ({
    x: idx,
    ctr: Number.isFinite(Number(p?.ctr)) ? Number(p.ctr) : 0,
  }));
  const polyline = ctrPoints.map((p) => `${p.x},${100 - Math.max(0, Math.min(100, p.ctr))}`).join(" ");

  return (
    <div className={styles.uxCtrWrap}>
      <svg className={styles.uxCtrSvg} viewBox={`0 0 ${Math.max(1, safe.length - 1)} 100`} preserveAspectRatio="none">
        <polyline className={styles.uxCtrLine} points={polyline} />
        {ctrPoints.map((p) => (
          <circle
            key={`ctr-dot-${p.x}`}
            className={styles.uxCtrDot}
            cx={p.x}
            cy={100 - Math.max(0, Math.min(100, p.ctr))}
            r="1.8"
          />
        ))}
      </svg>
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

function getMetricSeverity(value, { warn, bad, higherIsBetter = true }) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "warn";
  }
  const numeric = Number(value);
  if (higherIsBetter) {
    if (numeric < bad) return "bad";
    if (numeric < warn) return "warn";
    return "good";
  }
  if (numeric > bad) return "bad";
  if (numeric > warn) return "warn";
  return "good";
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value))}%`;
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
  const [uxSortMode, setUxSortMode] = useState("importance");
  const [uxOnlyPinned, setUxOnlyPinned] = useState(false);
  const [uxCompactView, setUxCompactView] = useState(false);
  const [pinnedEvents, setPinnedEvents] = useState([]);
  const [collapsedEvents, setCollapsedEvents] = useState({});

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

  const weeklyDigestCtr = useMemo(() => {
    const openCount = Number(
      uxRows.find((row) => row?.event === "weekly_digest_open")?.count || 0
    );
    const clickCount = Number(
      uxRows.find((row) => row?.event === "weekly_digest_click")?.count || 0
    );
    const ctr = openCount > 0 ? (clickCount / openCount) * 100 : null;
    return { openCount, clickCount, ctr };
  }, [uxRows]);

  const goalEngineMetrics = useMemo(() => {
    const impressions = Number(
      uxRows.find((row) => row?.event === "goal_engine_impression")?.count || 0
    );
    const clicks = Number(
      uxRows.find((row) => row?.event === "goal_engine_click")?.count || 0
    );
    const completed = Number(
      uxRows.find((row) => row?.event === "goal_engine_completed")?.count || 0
    );
    return {
      impressions,
      clicks,
      completed,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      completionRate: impressions > 0 ? (completed / impressions) * 100 : null,
    };
  }, [uxRows]);

  const weeklyDigestTrend = useMemo(() => {
    const openRow = uxRows.find((row) => row?.event === "weekly_digest_open");
    const clickRow = uxRows.find((row) => row?.event === "weekly_digest_click");
    const points = (Array.isArray(uxDayKeys) ? uxDayKeys : []).map((day) => {
      const openPoint = (Array.isArray(openRow?.perDay) ? openRow.perDay : []).find((p) => p?.day === day);
      const clickPoint = (Array.isArray(clickRow?.perDay) ? clickRow.perDay : []).find((p) => p?.day === day);
      const open = Number(openPoint?.count || 0);
      const click = Number(clickPoint?.count || 0);
      return {
        day,
        open,
        click,
        ctr: open > 0 ? (click / open) * 100 : null,
      };
    });
    return {
      points,
      hasData: points.some((p) => p.open > 0 || p.click > 0),
      hasCtrData: points.some((p) => Number.isFinite(Number(p.ctr))),
      axisLabels: buildAxisLabels(uxDayKeys, points),
    };
  }, [uxRows, uxDayKeys]);

  const dashboardStats = useMemo(() => {
    const pendingRanks = Array.isArray(rankItems) ? rankItems.length : 0;
    const activeBans = (Array.isArray(banItems) ? banItems : []).filter((row) => row?.active).length;
    const clientErrors = Array.isArray(errors) ? errors.length : 0;
    const uxEventsTotal = (Array.isArray(uxRows) ? uxRows : []).reduce(
      (sum, row) => sum + Number(row?.count || 0),
      0
    );
    return { pendingRanks, activeBans, clientErrors, uxEventsTotal };
  }, [rankItems, banItems, errors, uxRows]);

  const focusSummary = useMemo(() => {
    const actions = [];
    const highlights = [];

    const weeklyCtrSeverity = getMetricSeverity(weeklyDigestCtr.ctr, {
      warn: 20,
      bad: 12,
      higherIsBetter: true,
    });
    const goalCtrSeverity = getMetricSeverity(goalEngineMetrics.ctr, {
      warn: 30,
      bad: 18,
      higherIsBetter: true,
    });
    const goalCompletionSeverity = getMetricSeverity(goalEngineMetrics.completionRate, {
      warn: 15,
      bad: 8,
      higherIsBetter: true,
    });
    const errorsSeverity = getMetricSeverity(dashboardStats.clientErrors, {
      warn: 0,
      bad: 10,
      higherIsBetter: false,
    });
    const queueSeverity = getMetricSeverity(dashboardStats.pendingRanks, {
      warn: 8,
      bad: 20,
      higherIsBetter: false,
    });

    if (weeklyCtrSeverity !== "good") {
      actions.push({
        severity: weeklyCtrSeverity,
        title: "Низкий CTR недельного дайджеста",
        recommendation: "Упростить текст CTA и поднять блок выше в табе «Форма».",
      });
    } else {
      highlights.push("Дайджест открывают и кликают стабильно.");
    }

    if (goalCtrSeverity !== "good") {
      actions.push({
        severity: goalCtrSeverity,
        title: "Карточка Next Best Action кликается слабо",
        recommendation: "Сделать CTA конкретнее: «Сыграй 3 матча» вместо общей формулировки.",
      });
    } else {
      highlights.push("Карточка целей хорошо вовлекает.");
    }

    if (goalCompletionSeverity !== "good") {
      actions.push({
        severity: goalCompletionSeverity,
        title: "Мало завершений цели",
        recommendation: "Добавить промежуточный прогресс (1/3, 2/3) и быстрый переход к действию.",
      });
    } else {
      highlights.push("Пользователи доходят до завершения целей.");
    }

    if (errorsSeverity !== "good") {
      actions.push({
        severity: errorsSeverity,
        title: "Есть ошибки клиента",
        recommendation: "Проверить топ-3 повторяющихся ошибок и закрыть самые массовые.",
      });
    }

    if (queueSeverity !== "good") {
      actions.push({
        severity: queueSeverity,
        title: "Очередь верификаций растет",
        recommendation: "Разобрать хвост заявок, чтобы сократить задержку модерации.",
      });
    }

    const hasBad = actions.some((item) => item.severity === "bad");
    const hasWarn = actions.some((item) => item.severity === "warn");
    const status = hasBad ? "bad" : hasWarn ? "warn" : "good";

    const titleByStatus = {
      good: "Система стабильна",
      warn: "Нужны точечные правки",
      bad: "Нужны срочные действия",
    };

    return {
      status,
      title: titleByStatus[status],
      highlights: highlights.slice(0, 2),
      actions: actions.slice(0, 4),
      weeklyCtrSeverity,
      goalCtrSeverity,
      goalCompletionSeverity,
      errorsSeverity,
      queueSeverity,
    };
  }, [dashboardStats.clientErrors, dashboardStats.pendingRanks, goalEngineMetrics.completionRate, goalEngineMetrics.ctr, weeklyDigestCtr.ctr]);

  const sortedUxRows = useMemo(() => {
    const rows = Array.isArray(uxRows) ? [...uxRows] : [];
    const importanceRank = new Map(
      UX_IMPORTANCE_ORDER.map((event, idx) => [event, idx + 1])
    );
    const sorted = rows.sort((a, b) => {
      const aPinned = pinnedEvents.includes(String(a?.event || ""));
      const bPinned = pinnedEvents.includes(String(b?.event || ""));
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (uxSortMode === "volume") {
        const diff = Number(b?.count || 0) - Number(a?.count || 0);
        if (diff !== 0) return diff;
      }
      if (uxSortMode === "name") {
        const aTitle = String((uxEventMap[String(a?.event || "")] || {}).title || a?.event || "");
        const bTitle = String((uxEventMap[String(b?.event || "")] || {}).title || b?.event || "");
        const byName = aTitle.localeCompare(bTitle);
        if (byName !== 0) return byName;
      }
      const aRank = Number(importanceRank.get(String(a?.event || "")) || 999);
      const bRank = Number(importanceRank.get(String(b?.event || "")) || 999);
      if (aRank !== bRank) return aRank - bRank;
      return String(a?.event || "").localeCompare(String(b?.event || ""));
    });
    return uxOnlyPinned
      ? sorted.filter((row) => pinnedEvents.includes(String(row?.event || "")))
      : sorted;
  }, [uxRows, pinnedEvents, uxSortMode, uxOnlyPinned, uxEventMap]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(UX_PINNED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        setPinnedEvents(list.map((v) => String(v || "")).filter(Boolean));
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  const togglePinEvent = (eventName) => {
    const key = String(eventName || "").trim();
    if (!key) return;
    setPinnedEvents((prev) => {
      const next = prev.includes(key)
        ? prev.filter((item) => item !== key)
        : [...prev, key];
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(UX_PINNED_KEY, JSON.stringify(next));
        } catch {
          // ignore storage issues
        }
      }
      return next;
    });
  };

  const toggleCollapseEvent = (eventName) => {
    const key = String(eventName || "").trim();
    if (!key) return;
    setCollapsedEvents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>{adminT?.title || "Admin"}</h1>
          <p className={styles.heroSubtitle}>
            {adminT?.subtitle || "Control center for tech health, community moderation and UX signals."}
          </p>
        </div>
      </header>

      <section className={styles.snapshotGrid}>
        <article className={styles.snapshotCard}>
          <p className={styles.snapshotLabel}>{sectionT?.rankVerification || "Rank verification"}</p>
          <p className={styles.snapshotValue}>{dashboardStats.pendingRanks}</p>
          <p className={styles.snapshotMeta}>{adminT?.pendingLabel || "Pending reviews"}</p>
        </article>
        <article className={styles.snapshotCard}>
          <p className={styles.snapshotLabel}>{sectionT?.bans || "Bans"}</p>
          <p className={styles.snapshotValue}>{dashboardStats.activeBans}</p>
          <p className={styles.snapshotMeta}>{adminT?.activeLabel || "Active bans"}</p>
        </article>
        <article className={styles.snapshotCard}>
          <p className={styles.snapshotLabel}>{sectionT?.clientErrors || "Client errors"}</p>
          <p className={styles.snapshotValue}>{dashboardStats.clientErrors}</p>
          <p className={styles.snapshotMeta}>{adminT?.recentLabel || "Recent logs"}</p>
        </article>
        <article className={styles.snapshotCard}>
          <p className={styles.snapshotLabel}>{uxT?.title || "UX metrics"}</p>
          <p className={styles.snapshotValue}>{dashboardStats.uxEventsTotal}</p>
          <p className={styles.snapshotMeta}>{uxT?.count || "Events"}</p>
        </article>
      </section>

      <div className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${activeTab === "tech" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("tech")}
        >
          <span className={styles.tabLabel}>{tabsT?.tech || "Tech"}</span>
          <span className={styles.tabHint}>{sectionT?.leaderboardRebuild || "Infrastructure and diagnostics"}</span>
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "community" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("community")}
        >
          <span className={styles.tabLabel}>{tabsT?.community || "Community"}</span>
          <span className={styles.tabHint}>{sectionT?.bans || "Moderation and verification"}</span>
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "ux" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("ux")}
        >
          <span className={styles.tabLabel}>{tabsT?.ux || "UX metrics"}</span>
          <span className={styles.tabHint}>{uxT?.subtitle || "Signals and conversion trends"}</span>
        </button>
      </div>

      {activeTab === "tech" && (
        <section className={styles.sectionGrid}>
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
        </section>
      )}

      {activeTab === "community" && (
        <section className={styles.sectionGrid}>
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
        </section>
      )}

      {activeTab === "ux" && (
        <section className={styles.sectionGridSingle}>
          <section className={`${styles.focusBlock} ${styles[`focusBlock${focusSummary.status}`]}`}>
            <div className={styles.focusHeader}>
              <div>
                <p className={styles.focusEyebrow}>Оперативная сводка</p>
                <h2 className={styles.focusTitle}>{focusSummary.title}</h2>
              </div>
              <span className={`${styles.focusBadge} ${styles[`focusBadge${focusSummary.status}`]}`}>
                {focusSummary.status === "good" ? "OK" : focusSummary.status === "warn" ? "Внимание" : "Критично"}
              </span>
            </div>
            <div className={styles.focusMetrics}>
              <div className={`${styles.focusMetric} ${styles[`focusMetric${focusSummary.weeklyCtrSeverity}`]}`}>
                <span className={styles.focusMetricLabel}>CTR дайджеста</span>
                <strong className={styles.focusMetricValue}>{formatPercent(weeklyDigestCtr.ctr)}</strong>
              </div>
              <div className={`${styles.focusMetric} ${styles[`focusMetric${focusSummary.goalCtrSeverity}`]}`}>
                <span className={styles.focusMetricLabel}>CTR цели</span>
                <strong className={styles.focusMetricValue}>{formatPercent(goalEngineMetrics.ctr)}</strong>
              </div>
              <div className={`${styles.focusMetric} ${styles[`focusMetric${focusSummary.goalCompletionSeverity}`]}`}>
                <span className={styles.focusMetricLabel}>Completion цели</span>
                <strong className={styles.focusMetricValue}>{formatPercent(goalEngineMetrics.completionRate)}</strong>
              </div>
              <div className={`${styles.focusMetric} ${styles[`focusMetric${focusSummary.errorsSeverity}`]}`}>
                <span className={styles.focusMetricLabel}>Ошибки клиента</span>
                <strong className={styles.focusMetricValue}>{dashboardStats.clientErrors}</strong>
              </div>
            </div>
            <div className={styles.focusBody}>
              <div className={styles.focusColumn}>
                <h3 className={styles.focusColumnTitle}>Что хорошо</h3>
                {focusSummary.highlights.length ? (
                  <ul className={styles.focusList}>
                    {focusSummary.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.focusMuted}>Сильные сигналы пока не зафиксированы.</p>
                )}
              </div>
              <div className={styles.focusColumn}>
                <h3 className={styles.focusColumnTitle}>Что делать сейчас</h3>
                {focusSummary.actions.length ? (
                  <ul className={styles.focusList}>
                    {focusSummary.actions.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}:</strong> {item.recommendation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.focusMuted}>Критичных задач нет. Поддерживайте текущий ритм обновлений.</p>
                )}
              </div>
            </div>
          </section>

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
            <div className={styles.uxToolbar}>
              <span className={styles.uxToolbarLabel}>{uxT?.sortBy || "Sort by"}:</span>
              <div className={styles.uxSortGroup}>
                <button
                  className={`${styles.uxSortButton} ${uxSortMode === "importance" ? styles.uxSortButtonActive : ""}`}
                  onClick={() => setUxSortMode("importance")}
                  type="button"
                >
                  {uxT?.sortImportance || "Importance"}
                </button>
                <button
                  className={`${styles.uxSortButton} ${uxSortMode === "volume" ? styles.uxSortButtonActive : ""}`}
                  onClick={() => setUxSortMode("volume")}
                  type="button"
                >
                  {uxT?.sortVolume || "Volume"}
                </button>
                <button
                  className={`${styles.uxSortButton} ${uxSortMode === "name" ? styles.uxSortButtonActive : ""}`}
                  onClick={() => setUxSortMode("name")}
                  type="button"
                >
                  {uxT?.sortName || "Name"}
                </button>
                <button
                  className={`${styles.uxSortButton} ${uxOnlyPinned ? styles.uxSortButtonActive : ""}`}
                  onClick={() => setUxOnlyPinned((v) => !v)}
                  type="button"
                >
                  {uxT?.onlyPinned || "Only pinned"}
                </button>
                <button
                  className={`${styles.uxSortButton} ${uxCompactView ? styles.uxSortButtonActive : ""}`}
                  onClick={() => setUxCompactView((v) => !v)}
                  type="button"
                >
                  {uxCompactView
                    ? (uxT?.fullView || "Full view")
                    : (uxT?.compactView || "Compact view")}
                </button>
              </div>
            </div>
            <p className={styles.hint}>{(uxT?.subtitle || "Last {days} days").replace("{days}", String(uxDays))}</p>
            {!uxRows.length ? (
              <p className={styles.hint}>{uxT?.empty || "No UX metrics yet."}</p>
            ) : (
              <>
                <div className={styles.uxKpiGrid}>
                  <div className={`${styles.uxKpiCard} ${styles[`uxKpiCard${focusSummary.weeklyCtrSeverity}`]}`}>
                    <div className={styles.uxKpiTitle}>
                      {uxT?.weeklyDigestCtrTitle || "Weekly digest CTR"}
                    </div>
                    <div className={styles.uxKpiValue}>
                      {weeklyDigestCtr.ctr === null ? "-" : `${Math.round(weeklyDigestCtr.ctr)}%`}
                    </div>
                    <div className={styles.uxKpiMeta}>
                      {(uxT?.weeklyDigestCtrMeta || "Clicks {clicks} / Opens {opens}")
                        .replace("{clicks}", String(weeklyDigestCtr.clickCount))
                        .replace("{opens}", String(weeklyDigestCtr.openCount))}
                    </div>
                  </div>
                  <div className={`${styles.uxKpiCard} ${styles[`uxKpiCard${focusSummary.goalCtrSeverity}`]}`}>
                    <div className={styles.uxKpiTitle}>
                      {uxT?.goalEngineCtrTitle || "Goal engine CTR"}
                    </div>
                    <div className={styles.uxKpiValue}>
                      {goalEngineMetrics.ctr === null ? "-" : `${Math.round(goalEngineMetrics.ctr)}%`}
                    </div>
                    <div className={styles.uxKpiMeta}>
                      {(uxT?.goalEngineCtrMeta || "Clicks {clicks} / Impressions {impressions}")
                        .replace("{clicks}", String(goalEngineMetrics.clicks))
                        .replace("{impressions}", String(goalEngineMetrics.impressions))}
                    </div>
                  </div>
                  <div className={`${styles.uxKpiCard} ${styles[`uxKpiCard${focusSummary.goalCompletionSeverity}`]}`}>
                    <div className={styles.uxKpiTitle}>
                      {uxT?.goalEngineCompletionTitle || "Goal completion rate"}
                    </div>
                    <div className={styles.uxKpiValue}>
                      {goalEngineMetrics.completionRate === null ? "-" : `${Math.round(goalEngineMetrics.completionRate)}%`}
                    </div>
                    <div className={styles.uxKpiMeta}>
                      {(uxT?.goalEngineCompletionMeta || "Completed {completed} / Impressions {impressions}")
                        .replace("{completed}", String(goalEngineMetrics.completed))
                        .replace("{impressions}", String(goalEngineMetrics.impressions))}
                    </div>
                  </div>
                </div>
                {weeklyDigestTrend.hasData ? (
                  <div className={styles.uxMiniSection}>
                    <div className={styles.uxMiniTitle}>
                      {uxT?.weeklyDigestTrendTitle || "Weekly digest trend by day"}
                    </div>
                    <div className={styles.uxMiniLegend}>
                      <span>
                        <i className={`${styles.uxMiniSwatch} ${styles.uxMiniSwatchOpen}`} />
                        {uxT?.weeklyDigestLegendOpen || "Open"}
                      </span>
                      <span>
                        <i className={`${styles.uxMiniSwatch} ${styles.uxMiniSwatchClick}`} />
                        {uxT?.weeklyDigestLegendClick || "Click"}
                      </span>
                    </div>
                    <UxDualBars points={weeklyDigestTrend.points} />
                    <div className={styles.uxAxis}>
                      {weeklyDigestTrend.axisLabels.map((label) => (
                        <span key={label}>{formatDayLabel(label)}</span>
                      ))}
                    </div>
                    {weeklyDigestTrend.hasCtrData ? (
                      <>
                        <div className={styles.uxMiniLegend}>
                          <span>
                            <i className={`${styles.uxMiniSwatch} ${styles.uxMiniSwatchCtr}`} />
                            {uxT?.weeklyDigestLegendCtr || "CTR"}
                          </span>
                        </div>
                        <UxCtrLine points={weeklyDigestTrend.points} />
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className={`${styles.uxEventsGrid} ${uxCompactView ? styles.uxEventsGridCompact : ""}`}>
                  {sortedUxRows.map((row) => {
                    const eventMeta = uxEventMap[row.event] || { title: row.event, hint: "" };
                    const points = Array.isArray(row?.perDay) ? row.perDay : [];
                    const axisLabels = buildAxisLabels(uxDayKeys, points);
                    const eventName = String(row?.event || "");
                    const isPinned = pinnedEvents.includes(eventName);
                    const isCollapsed = Boolean(collapsedEvents[eventName]);
                    return (
                      <div key={row.event} className={`${styles.uxItem} ${uxCompactView ? styles.uxItemCompact : ""}`}>
                        <div className={styles.uxEventRow}>
                          <div>
                            <div className={styles.uxEvent}>
                              {eventMeta.title}
                              {isPinned ? (
                                <span className={styles.uxPinnedTag}>{uxT?.pinnedTag || "Pinned"}</span>
                              ) : null}
                            </div>
                            {!uxCompactView && !!eventMeta.hint && <div className={styles.uxHint}>{eventMeta.hint}</div>}
                          </div>
                          <div className={styles.uxEventActions}>
                            <button
                              type="button"
                              className={styles.uxEventAction}
                              onClick={() => togglePinEvent(eventName)}
                            >
                              {isPinned ? (uxT?.unpin || "Unpin") : (uxT?.pin || "Pin")}
                            </button>
                            <button
                              type="button"
                              className={styles.uxEventAction}
                              onClick={() => toggleCollapseEvent(eventName)}
                            >
                              {isCollapsed ? (uxT?.expand || "Expand") : (uxT?.collapse || "Collapse")}
                            </button>
                          </div>
                        </div>
                        <div className={styles.uxMeta}>
                          <span>{(uxT?.count || "Events")}: {Math.round(Number(row.count || 0))}</span>
                          {!uxCompactView ? (
                            <span>
                              {(uxT?.avg || "Avg time")}: {Number.isFinite(Number(row.avgMs)) ? `${Math.round(Number(row.avgMs))} ms` : uxT?.avgMissing || "-"}
                            </span>
                          ) : null}
                        </div>
                        {!uxCompactView && !isCollapsed && !!points.length && (
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
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
