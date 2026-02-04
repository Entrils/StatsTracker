import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import styles from "@/pages/Settings/Settings.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function Settings() {
  const { user } = useAuth();
  const { t } = useLang();
  const [socials, setSocials] = useState({
    twitch: "",
    youtube: "",
    tiktok: "",
  });
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState({
    twitch: false,
    youtube: false,
    tiktok: false,
  });
  const [errors, setErrors] = useState({});
  const [rankSeason, setRankSeason] = useState("s1");
  const [rankValue, setRankValue] = useState("bronze");
  const [rankFile, setRankFile] = useState(null);
  const [rankPreview, setRankPreview] = useState("");
  const [rankStatus, setRankStatus] = useState("");
  const [rankTone, setRankTone] = useState("");
  const [rankSending, setRankSending] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const rankRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch(`${BACKEND_URL}/profile/${user.uid}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const s = data?.settings || data?.socials || {};
        setSocials({
          twitch: s.twitch || "",
          youtube: s.youtube || "",
          tiktok: s.tiktok || "",
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!rankOpen) return;
    const handleClick = (event) => {
      if (rankRef.current && !rankRef.current.contains(event.target)) {
        setRankOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [rankOpen]);

  const isUrl = (value) => /^https?:\/\//i.test(value);
  const safeUrl = (value) => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const validateSocial = (type, value) => {
    const v = value.trim();
    if (!v) return "";

    if (isUrl(v)) {
      const url = safeUrl(v);
      if (!url) return "url";
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      const path = url.pathname.replace(/\/+$/, "");
      if (type === "twitch") {
        if (host !== "twitch.tv") return "domain";
        if (!path || path === "/") return "path";
        return "";
      }
      if (type === "youtube") {
        const okHost =
          host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
        if (!okHost) return "domain";
        if (!path || path === "/") return "path";
        return "";
      }
      if (type === "tiktok") {
        if (host !== "tiktok.com") return "domain";
        if (!path || path === "/") return "path";
        return "";
      }
    }

    if (type === "twitch") {
      return /^[a-zA-Z0-9_]{4,25}$/.test(v.replace(/^@/, "")) ? "" : "format";
    }
    if (type === "youtube") {
      return /^@?[a-zA-Z0-9._-]{3,30}$/.test(v) ? "" : "format";
    }
    return /^[a-zA-Z0-9._]{2,24}$/.test(v.replace(/^@/, "")) ? "" : "format";
  };

  const validateAll = () => {
    const next = {};
    const twitchError = validateSocial("twitch", socials.twitch);
    const youtubeError = validateSocial("youtube", socials.youtube);
    const tiktokError = validateSocial("tiktok", socials.tiktok);
    if (twitchError) next.twitch = twitchError;
    if (youtubeError) next.youtube = youtubeError;
    if (tiktokError) next.tiktok = tiktokError;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const rankOptions = useMemo(() => {
    const base = [
      { value: "bronze", label: t.me?.rankBronze || "Bronze" },
      { value: "silver", label: t.me?.rankSilver || "Silver" },
      { value: "gold", label: t.me?.rankGold || "Gold" },
      { value: "platinum", label: t.me?.rankPlatinum || "Platinum" },
      { value: "diamond", label: t.me?.rankDiamond || "Diamond" },
      { value: "master", label: t.me?.rankMaster || "Master" },
      { value: "ace", label: t.me?.rankAce || "Ace" },
      { value: "punkmaster", label: t.me?.rankPunkmaster || "Punkmaster" },
    ];
    const limited = rankSeason === "s1" || rankSeason === "s2";
    return limited ? base.filter((r) => r.value !== "ace") : base;
  }, [t, rankSeason]);

  const rankClass = (rank) => {
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
  };

  const rankIconSrc = (rank) => `/ranks/${String(rank || "").toLowerCase()}.png`;
  const currentRank = rankOptions.find((r) => r.value === rankValue) || rankOptions[0];

  useEffect(() => {
    if (!rankOptions.find((r) => r.value === rankValue)) {
      setRankValue(rankOptions[0]?.value || "bronze");
    }
  }, [rankOptions, rankValue]);

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });

  const handleRankFile = async (file) => {
    if (!file) return;
    const options = {
      maxSizeMB: 1.2,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };
    try {
      const compressed = await imageCompression(file, options);
      const base64 = await toBase64(compressed);
      setRankFile(base64);
      setRankPreview(base64);
      setRankStatus("");
      setRankTone("");
    } catch {
      setRankFile(null);
      setRankPreview("");
      setRankStatus(t.me?.rankFileError || "Image processing failed");
      setRankTone("bad");
    }
  };

  const submitRank = async () => {
    if (!user) return;
    if (!rankFile) {
      setRankStatus(t.me?.rankMissingFile || "Attach a screenshot");
      setRankTone("bad");
      return;
    }
    setRankSending(true);
    setRankStatus(t.me?.rankSending || "Sending...");
    setRankTone("neutral");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/rank/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          season: rankSeason,
          rank: rankValue,
          base64Image: rankFile,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRankStatus(
          data?.error || t.me?.rankError || "Submit failed"
        );
        setRankTone("bad");
      } else {
        setRankStatus(t.me?.rankSent || "Submitted for review");
        setRankTone("good");
        setRankFile(null);
        setRankPreview("");
      }
    } catch {
      setRankStatus(t.me?.rankError || "Submit failed");
      setRankTone("bad");
    } finally {
      setRankSending(false);
    }
  };

  const saveSocials = async () => {
    if (!user) return;
    if (!validateAll()) {
      setStatus(t.me?.saveError || "Save failed");
      setTone("bad");
      return;
    }
    setSaving(true);
    setStatus(t.me?.saving || "Saving...");
    setTone("neutral");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/profile/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: socials }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus(t.me?.saved || "Saved");
      setTone("good");
      setEditing({ twitch: false, youtube: false, tiktok: false });
    } catch {
      setStatus(t.me?.saveError || "Save failed");
      setTone("bad");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>{t.me?.settings || "Settings"}</h1>
        <p className={styles.hint}>{t.me?.loginRequired || "Login required"}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t.me?.settings || "Settings"}</h1>
        <div className={styles.settingsLayout}>
          <div className={styles.rankBlock}>
          <h2 className={styles.rankTitle}>
            {t.me?.rankVerifyTitle || "Rank verification"}
          </h2>
          <p className={styles.rankHint}>
            {t.me?.rankVerifyHint ||
              "Select season and rank, then attach a screenshot. One submit per day."}
          </p>

          <div className={styles.rankGrid}>
            <label className={styles.rankField}>
              <span className={styles.socialLabel}>
                {t.me?.rankSeason || "Season"}
              </span>
              <select
                className={styles.socialInput}
                value={rankSeason}
                onChange={(e) => setRankSeason(e.target.value)}
              >
                <option value="s1">S1</option>
                <option value="s2">S2</option>
                <option value="s3">S3</option>
                <option value="s4">S4</option>
              </select>
            </label>

            <label className={styles.rankField}>
              <span className={styles.socialLabel}>
                {t.me?.rankLabel || "Rank"}
              </span>
              <div className={styles.rankSelect} ref={rankRef}>
                <button
                  type="button"
                  className={styles.rankSelectButton}
                  onClick={() => setRankOpen((v) => !v)}
                >
                  <img
                    className={styles.rankIconSmall}
                    src={rankIconSrc(currentRank.value)}
                    alt={currentRank.label}
                  />
                  <span
                    className={`${styles.rankLabel} ${
                      styles[`rank${rankClass(currentRank.value)}`] || ""
                    }`}
                  >
                    {currentRank.label}
                  </span>
                  <span className={styles.rankCaret}>▾</span>
                </button>
                {rankOpen && (
                  <div className={styles.rankMenu}>
                    {rankOptions.map((r) => (
                      <button
                        type="button"
                        key={r.value}
                        className={`${styles.rankOption} ${
                          r.value === rankValue ? styles.rankOptionActive : ""
                        }`}
                        onClick={() => {
                          setRankValue(r.value);
                          setRankOpen(false);
                        }}
                      >
                        <img
                          className={styles.rankIconSmall}
                          src={rankIconSrc(r.value)}
                          alt={r.label}
                        />
                        <span
                          className={`${styles.rankLabel} ${
                            styles[`rank${rankClass(r.value)}`] || ""
                          }`}
                        >
                          {r.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            <label className={styles.rankField}>
              <span className={styles.socialLabel}>
                {t.me?.rankScreenshot || "Screenshot"}
              </span>
              <input
                className={styles.socialInput}
                type="file"
                accept="image/*"
                onChange={(e) => handleRankFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {rankPreview && (
            <div className={styles.rankPreview}>
              <img src={rankPreview} alt="Rank proof" />
            </div>
          )}

          <div className={styles.rankActions}>
            <button
              className={styles.saveBtn}
              onClick={submitRank}
              disabled={rankSending}
            >
              {rankSending
                ? t.me?.rankSending || "Sending..."
                : t.me?.rankSubmit || "Submit"}
            </button>
            {rankStatus && (
              <span
                className={`${styles.socialsStatus} ${
                  rankTone === "good"
                    ? styles.good
                    : rankTone === "bad"
                    ? styles.bad
                    : ""
                }`}
              >
                {rankStatus}
              </span>
            )}
          </div>
        </div>

          <div className={styles.socialsBlock}>
            <h2 className={styles.sectionTitle}>
              {t.me?.settingsSocialsTitle || "Socials"}
            </h2>
            <p className={styles.hint}>
              {t.me?.settingsHint ||
                "Add links to your channels. Usernames or full URLs are accepted."}
            </p>
            <div className={styles.socialsGrid}>
              <label className={styles.socialField}>
                <span className={styles.socialLabel}>
                  {t.me?.twitch || "Twitch"}
                </span>
                {socials.twitch && !editing.twitch ? (
                  <div className={styles.socialValue}>
                    <span>{socials.twitch}</span>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() =>
                        setEditing((e) => ({ ...e, twitch: true }))
                      }
                      title={t.me?.edit || "Edit"}
                    >
                      ✎
                    </button>
                  </div>
                ) : (
                  <input
                    className={`${styles.socialInput} ${
                      errors.twitch ? styles.inputError : ""
                    }`}
                    value={socials.twitch}
                    onChange={(e) =>
                      (setSocials((s) => ({ ...s, twitch: e.target.value })),
                      setEditing((ed) => ({ ...ed, twitch: true })))
                    }
                    placeholder="twitch.tv/username"
                  />
                )}
                {errors.twitch && (
                  <span className={styles.errorText}>
                    {t.me?.socialInvalidTwitch ||
                      "Invalid Twitch link or username"}
                  </span>
                )}
              </label>
              <label className={styles.socialField}>
                <span className={styles.socialLabel}>
                  {t.me?.youtube || "YouTube"}
                </span>
                {socials.youtube && !editing.youtube ? (
                  <div className={styles.socialValue}>
                    <span>{socials.youtube}</span>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() =>
                        setEditing((e) => ({ ...e, youtube: true }))
                      }
                      title={t.me?.edit || "Edit"}
                    >
                      ✎
                    </button>
                  </div>
                ) : (
                  <input
                    className={`${styles.socialInput} ${
                      errors.youtube ? styles.inputError : ""
                    }`}
                    value={socials.youtube}
                    onChange={(e) =>
                      (setSocials((s) => ({ ...s, youtube: e.target.value })),
                      setEditing((ed) => ({ ...ed, youtube: true })))
                    }
                    placeholder="youtube.com/@username"
                  />
                )}
                {errors.youtube && (
                  <span className={styles.errorText}>
                    {t.me?.socialInvalidYouTube ||
                      "Invalid YouTube link or handle"}
                  </span>
                )}
              </label>
              <label className={styles.socialField}>
                <span className={styles.socialLabel}>
                  {t.me?.tiktok || "TikTok"}
                </span>
                {socials.tiktok && !editing.tiktok ? (
                  <div className={styles.socialValue}>
                    <span>{socials.tiktok}</span>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() =>
                        setEditing((e) => ({ ...e, tiktok: true }))
                      }
                      title={t.me?.edit || "Edit"}
                    >
                      ✎
                    </button>
                  </div>
                ) : (
                  <input
                    className={`${styles.socialInput} ${
                      errors.tiktok ? styles.inputError : ""
                    }`}
                    value={socials.tiktok}
                    onChange={(e) =>
                      (setSocials((s) => ({ ...s, tiktok: e.target.value })),
                      setEditing((ed) => ({ ...ed, tiktok: true })))
                    }
                    placeholder="tiktok.com/@username"
                  />
                )}
                {errors.tiktok && (
                  <span className={styles.errorText}>
                    {t.me?.socialInvalidTikTok ||
                      "Invalid TikTok link or username"}
                  </span>
                )}
              </label>
            </div>
            <div className={styles.socialsActions}>
              <button
                className={styles.saveBtn}
                onClick={saveSocials}
                disabled={saving}
              >
                {saving ? t.me?.saving || "Saving..." : t.me?.save || "Save"}
              </button>
              {status && (
                <span
                  className={`${styles.socialsStatus} ${
                    tone === "good" ? styles.good : tone === "bad" ? styles.bad : ""
                  }`}
                >
                  {status}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
