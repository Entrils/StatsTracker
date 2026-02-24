import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "@/pages/Friends/Friends.module.css";
import PageState from "@/components/StateMessage/PageState";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import { trackUxEvent } from "@/utils/analytics/trackUxEvent";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const seasonOrder = ["s1", "s2", "s3", "s4"];

const buildAvatarUrl = (uid, avatar, provider) => {
  if (!avatar) return null;
  if (typeof avatar === "string" && avatar.startsWith("http")) return avatar;
  if (provider === "discord" && uid?.startsWith("discord:")) {
    const discordId = uid.replace("discord:", "");
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
  }
  return null;
};

const rankIconSrc = (rank) => `/ranks/${String(rank || "").toLowerCase()}.png`;

const normalizeSocialUrl = (type, value) => {
  const v = String(value || "").trim();
  if (!v) return "#";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (type === "twitch") return `https://twitch.tv/${v.replace(/^@/, "")}`;
  if (type === "youtube") return `https://youtube.com/${v.replace(/^@/, "@")}`;
  return `https://tiktok.com/${v.replace(/^@/, "")}`;
};

const renderSocialIcon = (type, value) => {
  if (!value) return null;
  const url = normalizeSocialUrl(type, value);
  const label =
    type === "twitch" ? "Twitch" : type === "youtube" ? "YouTube" : "TikTok";
  return (
    <a
      key={type}
      className={`${styles.socialIcon} ${styles[`social${label}`] || ""}`}
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
        loading="lazy"
      />
    </a>
  );
};

export default function Friends() {
  const { t } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedExpanded, setFeedExpanded] = useState(false);
  const pendingRequestsRef = useRef(0);

  const beginLoading = useCallback(() => {
    pendingRequestsRef.current += 1;
    setLoading(true);
  }, []);

  const endLoading = useCallback(() => {
    pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    if (pendingRequestsRef.current === 0) {
      setLoading(false);
    }
  }, []);

  const tokenPromise = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    beginLoading();
    try {
      setError("");
      const token = await tokenPromise();
      const res = await fetch(`${BACKEND_URL}/friends/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(t.friends?.loadError || "Failed to load friends");
      }
      const data = await res.json().catch(() => null);
      setFriends(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err?.message || t.friends?.loadError || "Failed to load friends");
    } finally {
      endLoading();
    }
  }, [beginLoading, endLoading, t.friends?.loadError, tokenPromise, user]);

  const loadRequests = useCallback(async () => {
    if (!user) return;
    beginLoading();
    try {
      setError("");
      const token = await tokenPromise();
      const res = await fetch(`${BACKEND_URL}/friends/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(t.friends?.loadError || "Failed to load friends");
      }
      const data = await res.json().catch(() => null);
      setRequests(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err?.message || t.friends?.loadError || "Failed to load friends");
    } finally {
      endLoading();
    }
  }, [beginLoading, endLoading, t.friends?.loadError, tokenPromise, user]);

  const loadOutgoing = useCallback(async () => {
    if (!user) return;
    beginLoading();
    try {
      setError("");
      const token = await tokenPromise();
      const res = await fetch(`${BACKEND_URL}/friends/outgoing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(t.friends?.loadError || "Failed to load friends");
      }
      const data = await res.json().catch(() => null);
      setOutgoing(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err?.message || t.friends?.loadError || "Failed to load friends");
    } finally {
      endLoading();
    }
  }, [beginLoading, endLoading, t.friends?.loadError, tokenPromise, user]);

  const acceptRequest = async (uid) => {
    if (!user || !uid) return;
    setRequests((items) => items.filter((r) => r.uid !== uid));
    const token = await tokenPromise();
    await fetch(`${BACKEND_URL}/friends/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid }),
    });
    loadRequests();
    loadFriends();
    window.dispatchEvent(new Event("friends-requests-refresh"));
  };

  const rejectRequest = async (uid) => {
    if (!user || !uid) return;
    setRequests((items) => items.filter((r) => r.uid !== uid));
    const token = await tokenPromise();
    await fetch(`${BACKEND_URL}/friends/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid }),
    });
    loadRequests();
    window.dispatchEvent(new Event("friends-requests-refresh"));
  };

  const cancelOutgoing = async (uid) => {
    if (!user || !uid) return;
    setOutgoing((items) => items.filter((r) => r.uid !== uid));
    const token = await tokenPromise();
    await fetch(`${BACKEND_URL}/friends/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid }),
    });
    loadOutgoing();
  };

  useEffect(() => {
    if (!user) {
      pendingRequestsRef.current = 0;
      setLoading(false);
      setError("");
      return;
    }
    loadFriends();
    loadRequests();
    loadOutgoing();
  }, [loadFriends, loadOutgoing, loadRequests, user]);

  const emptyText = useMemo(() => {
    if (tab === "requests") {
      return t.friends?.emptyRequests || "No requests yet";
    }
    if (tab === "outgoing") {
      return t.friends?.emptyOutgoing || "No outgoing requests";
    }
    return t.friends?.empty || "No friends yet";
  }, [tab, t]);

  const activityFeed = useMemo(() => {
    if (!Array.isArray(friends) || !friends.length) return [];

    const toMs = (value) => {
      if (!value) return 0;
      if (typeof value === "number") return value;
      if (typeof value === "string") return Date.parse(value);
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (typeof value?.seconds === "number") return value.seconds * 1000;
      if (typeof value?._seconds === "number") return value._seconds * 1000;
      return 0;
    };
    const winsInLast5 = (last5 = []) =>
      (Array.isArray(last5) ? last5 : []).filter((r) => r === "W").length;

    const events = [];
    friends.forEach((friend) => {
      const uid = String(friend?.uid || "").trim();
      if (!uid) return;
      const name = String(friend?.name || uid);
      const createdAtMs = toMs(friend?.createdAt);
      const baseScore = createdAtMs > 0 ? createdAtMs : 0;
      const matches = Number(friend?.matches || 0);
      const last5 = Array.isArray(friend?.last5) ? friend.last5 : [];
      const wins = winsInLast5(last5);

      if (createdAtMs > 0) {
        events.push({
          key: `added-${uid}`,
          uid,
          type: "added",
          score: baseScore,
          text: (t.friends?.feedAdded || "{name} joined your friends list.")
            .replace("{name}", name),
        });
      }
      if (last5.length >= 3 && wins >= 3) {
        events.push({
          key: `streak-${uid}`,
          uid,
          type: "streak",
          score: baseScore - 1,
          text: (t.friends?.feedStreak || "{name} is hot: {wins} wins in last 5.")
            .replace("{name}", name)
            .replace("{wins}", String(wins)),
        });
      }
      if (matches >= 30) {
        events.push({
          key: `grind-${uid}`,
          uid,
          type: "grind",
          score: baseScore - 2,
          text: (t.friends?.feedGrind || "{name} is grinding hard: {matches} matches played.")
            .replace("{name}", name)
            .replace("{matches}", String(matches)),
        });
      }
    });

    return events
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 8);
  }, [friends, t.friends]);

  const feedPreviewText = activityFeed[0]?.text || "";

  useEffect(() => {
    if (tab !== "friends") setFeedExpanded(false);
    if (!activityFeed.length) setFeedExpanded(false);
  }, [activityFeed.length, tab]);

  if (!user) {
    return <div className={styles.wrapper}>{t.friends?.login || "Login required"}</div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t.friends?.title || "Friends"}</h1>
          <div className={styles.tabs}>
            <Button
              className={`${styles.tab} ${
                tab === "friends" ? styles.tabActive : ""
              }`}
              onClick={() => setTab("friends")}
              variant="secondary"
              size="sm"
            >
              {t.friends?.tabFriends || "In friends"}
            </Button>
            <Button
              className={`${styles.tab} ${
                tab === "requests" ? styles.tabActive : ""
              }`}
              onClick={() => setTab("requests")}
              variant="secondary"
              size="sm"
            >
              {t.friends?.tabRequests || "Requests"}
            </Button>
            <Button
              className={`${styles.tab} ${
                tab === "outgoing" ? styles.tabActive : ""
              }`}
              onClick={() => setTab("outgoing")}
              variant="secondary"
              size="sm"
            >
              {t.friends?.tabOutgoing || "Outgoing"}
            </Button>
          </div>
        </div>
        {tab === "friends" && activityFeed.length > 0 ? (
          <div className={styles.feedCard}>
            <button
              type="button"
              className={styles.feedToggle}
              onClick={() => setFeedExpanded((prev) => !prev)}
              aria-expanded={feedExpanded ? "true" : "false"}
            >
              <span className={styles.feedTitle}>
                {t.friends?.feedTitle || "Friends Activity Feed"} ({activityFeed.length})
              </span>
              <span className={styles.feedPreview}>{feedPreviewText}</span>
              <span className={styles.feedChevron} aria-hidden="true">
                {feedExpanded ? "▴" : "▾"}
              </span>
            </button>
            {feedExpanded ? (
              <div className={styles.feedList}>
                {activityFeed.map((event) => (
                  <div className={styles.feedItem} key={event.key}>
                    <span className={styles.feedDot} aria-hidden="true" />
                    <span className={styles.feedText}>{event.text}</span>
                    <Link
                      className={styles.feedCta}
                      to={`/me?tab=friends&friend=${encodeURIComponent(event.uid)}`}
                      onClick={() =>
                        trackUxEvent("friend_compare_prompt_click", {
                          meta: {
                            source: "friends_feed",
                            uid: event.uid,
                            type: event.type,
                          },
                        })
                      }
                    >
                      {t.friends?.feedCompareCta || "Compare"}
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <PageState
          loading={loading}
          error={error}
          empty={
            (tab === "friends" && !friends.length) ||
            (tab === "requests" && !requests.length) ||
            (tab === "outgoing" && !outgoing.length)
          }
          loadingText={t.friends?.loading || "Loading..."}
          errorText={error}
          emptyText={emptyText}
        >

        {tab === "friends" && (
          <div className={`${styles.list} ${styles.listGrid}`}>
            {friends.map((friend) => {
              const avatarUrl = buildAvatarUrl(
                friend.uid,
                friend.avatar,
                friend.provider
              );
              const ranks = friend.ranks || {};
              const socials = friend.settings || {};
              const last5 = Array.isArray(friend.last5) ? friend.last5 : [];
              return (
                <div key={friend.uid} className={styles.friendCard}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={friend.name || friend.uid}
                      className={styles.avatar}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {(friend.name || friend.uid || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className={styles.info}>
                    <div className={styles.nameRow}>
                      <Link
                        to={`/player/${encodeURIComponent(friend.uid)}`}
                        className={styles.nameLink}
                      >
                        {friend.name || friend.uid}
                      </Link>
                      <div className={styles.socialIcons}>
                        {renderSocialIcon("twitch", socials.twitch)}
                        {renderSocialIcon("youtube", socials.youtube)}
                        {renderSocialIcon("tiktok", socials.tiktok)}
                      </div>
                    </div>
                    <div className={styles.meta}>
                      {t.friends?.matches || "Matches"}: {friend.matches || 0}
                    </div>
                    <Link
                      className={styles.compareCta}
                      to={`/me?tab=friends&friend=${encodeURIComponent(friend.uid)}`}
                      onClick={() =>
                        trackUxEvent("friend_compare_prompt_click", {
                          meta: {
                            source: "friends_list_card",
                            uid: friend.uid,
                          },
                        })
                      }
                    >
                      {t.friends?.feedCompareCta || "Compare"}
                    </Link>
                    {last5.length ? (
                      <div className={styles.streak}>
                        {last5.map((r, idx) => (
                          <span
                            key={`${friend.uid}-${idx}`}
                            className={
                              r === "W"
                                ? styles.streakWin
                                : r === "L"
                                ? styles.streakLoss
                                : styles.streakNeutral
                            }
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.rankCol}>
                    {seasonOrder.map((season) => {
                      const rank = ranks?.[season]?.rank || "unranked";
                      return (
                        <img
                          key={season}
                          src={rankIconSrc(rank)}
                          alt={String(rank)}
                          className={styles.rankIconLarge}
                          title={`${season.toUpperCase()} ${rank}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "requests" && (
          <div className={styles.list}>
            {requests.map((friend) => {
              const avatarUrl = buildAvatarUrl(
                friend.uid,
                friend.avatar,
                friend.provider
              );
              const ranks = friend.ranks || {};
              return (
                <div key={friend.uid} className={styles.friendCard}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={friend.name || friend.uid}
                      className={styles.avatar}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {(friend.name || friend.uid || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className={styles.info}>
                    <div className={styles.name}>{friend.name || friend.uid}</div>
                    <div className={styles.rankRow}>
                      {seasonOrder.map((season) =>
                        ranks?.[season]?.rank ? (
                          <img
                            key={season}
                            src={rankIconSrc(ranks[season].rank)}
                            alt={String(ranks[season].rank)}
                            className={styles.rankIcon}
                            title={`${season.toUpperCase()} ${ranks[season].rank}`}
                          />
                        ) : null
                      )}
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      className={styles.accept}
                      onClick={() => acceptRequest(friend.uid)}
                      variant="primary"
                      size="sm"
                    >
                      {t.friends?.accept || "Accept"}
                    </Button>
                    <Button
                      className={styles.reject}
                      onClick={() => rejectRequest(friend.uid)}
                      variant="danger"
                      size="sm"
                    >
                      {t.friends?.reject || "Reject"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "outgoing" && (
          <div className={styles.list}>
            {outgoing.map((friend) => {
              const avatarUrl = buildAvatarUrl(
                friend.uid,
                friend.avatar,
                friend.provider
              );
              const ranks = friend.ranks || {};
              return (
                <div key={friend.uid} className={styles.friendCard}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={friend.name || friend.uid}
                      className={styles.avatar}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {(friend.name || friend.uid || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className={styles.info}>
                    <div className={styles.name}>{friend.name || friend.uid}</div>
                    <div className={styles.rankRow}>
                      {seasonOrder.map((season) =>
                        ranks?.[season]?.rank ? (
                          <img
                            key={season}
                            src={rankIconSrc(ranks[season].rank)}
                            alt={String(ranks[season].rank)}
                            className={styles.rankIcon}
                            title={`${season.toUpperCase()} ${ranks[season].rank}`}
                          />
                        ) : null
                      )}
                    </div>
                  </div>
                  <Badge className={styles.pendingTag}>
                    {t.friends?.pending || "Pending"}
                  </Badge>
                  <Button
                    className={styles.cancel}
                    onClick={() => cancelOutgoing(friend.uid)}
                    variant="danger"
                    size="sm"
                  >
                    {t.friends?.cancel || "Cancel"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        </PageState>
      </div>
    </div>
  );
}
