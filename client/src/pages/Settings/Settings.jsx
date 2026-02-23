import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import styles from "@/pages/Settings/Settings.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import Button from "@/components/ui/Button";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const FRAGPUNK_ID_REGEX = /^[A-Za-z0-9._-]{2,24}#[A-Za-z0-9]{2,8}$/;
const FRAGPUNK_ZERO_WIDTH_REGEX = /[\u200B-\u200D\u2060\uFEFF]/g;

function normalizeFragpunkIdInput(value) {
  return String(value || "")
    .replace(FRAGPUNK_ZERO_WIDTH_REGEX, "")
    .trim()
    .replace(/\s*#\s*/, "#");
}

export default function Settings() {
  const { user } = useAuth();
  const { t } = useLang();
  const [socials, setSocials] = useState({
    twitch: "",
    youtube: "",
    tiktok: "",
    fragpunkId: "",
  });
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState({
    twitch: false,
    youtube: false,
    tiktok: false,
    fragpunkId: false,
  });
  const [errors, setErrors] = useState({});
  const [rankSeason, setRankSeason] = useState("s1");
  const [rankValue, setRankValue] = useState("bronze");
  const [rankFile, setRankFile] = useState(null);
  const [rankPreview, setRankPreview] = useState("");
  const [rankFileName, setRankFileName] = useState("");
  const [rankStatus, setRankStatus] = useState("");
  const [rankTone, setRankTone] = useState("");
  const [rankSending, setRankSending] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [fragStatus, setFragStatus] = useState("");
  const [fragTone, setFragTone] = useState("");
  const [fragSaving, setFragSaving] = useState(false);
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
          fragpunkId: s.fragpunkId || "",
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
    const v = type === "fragpunkId" ? normalizeFragpunkIdInput(value) : value.trim();
    if (!v) return "";
    if (type === "fragpunkId") {
      return FRAGPUNK_ID_REGEX.test(v) ? "" : "format";
    }

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

  const validateSocials = () => {
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

  const validateFragpunkId = () => {
    const fragpunkError = validateSocial("fragpunkId", socials.fragpunkId);
    setErrors((prev) => ({
      ...prev,
      fragpunkId: fragpunkError || undefined,
    }));
    return !fragpunkError;
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

  const rankIconSrc = (rank) =>
    `/ranks/${String(rank || "unranked").toLowerCase()}.png`;
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
      setRankFileName(file.name);
      setRankStatus("");
      setRankTone("");
    } catch {
      setRankFile(null);
      setRankPreview("");
      setRankFileName("");
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
        setRankFileName("");
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
    if (!validateSocials()) {
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
        body: JSON.stringify({
          settings: {
            twitch: socials.twitch,
            youtube: socials.youtube,
            tiktok: socials.tiktok,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus(t.me?.saved || "Saved");
      setTone("good");
      setEditing((prev) => ({ ...prev, twitch: false, youtube: false, tiktok: false }));
    } catch {
      setStatus(t.me?.saveError || "Save failed");
      setTone("bad");
    } finally {
      setSaving(false);
    }
  };

  const saveFragpunkId = async () => {
    if (!user) return;
    const normalizedFragpunkId = normalizeFragpunkIdInput(socials.fragpunkId);
    if (normalizedFragpunkId !== socials.fragpunkId) {
      setSocials((prev) => ({ ...prev, fragpunkId: normalizedFragpunkId }));
    }
    if (!validateFragpunkId()) {
      setFragStatus(t.me?.saveError || "Save failed");
      setFragTone("bad");
      return;
    }
    setFragSaving(true);
    setFragStatus(t.me?.saving || "Saving...");
    setFragTone("neutral");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/profile/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: {
            fragpunkId: normalizedFragpunkId,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed");
      }
      setFragStatus(t.me?.saved || "Saved");
      setFragTone("good");
      setEditing((prev) => ({ ...prev, fragpunkId: false }));
    } catch (err) {
      setFragStatus(err?.message || t.me?.saveError || "Save failed");
      setFragTone("bad");
    } finally {
      setFragSaving(false);
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
          <div className={styles.leftCol}>
          <div className={styles.fragpunkBlock}>
            <h2 className={styles.sectionTitle}>{t.me?.fragpunkId || "FragPunk ID"}</h2>
            <p className={styles.hint}>
              {t.me?.socialInvalidFragpunkHint || "Format: nickname#tag"}
            </p>
            <label className={styles.socialField}>
              <span className={styles.socialLabel}>
                {t.me?.fragpunkId || "FragPunk ID"}
              </span>
              {socials.fragpunkId && !editing.fragpunkId ? (
                <div className={styles.socialValue}>
                  <span>{socials.fragpunkId}</span>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() =>
                      setEditing((e) => ({ ...e, fragpunkId: true }))
                    }
                    title={t.me?.edit || "Edit"}
                  >
                    ✎
                  </button>
                </div>
              ) : (
                <input
                  className={`${styles.socialInput} ${
                    errors.fragpunkId ? styles.inputError : ""
                  }`}
                  value={socials.fragpunkId}
                  onChange={(e) =>
                    (setSocials((s) => ({ ...s, fragpunkId: e.target.value })),
                    setEditing((ed) => ({ ...ed, fragpunkId: true })))
                  }
                  placeholder="nickname#tag"
                />
              )}
              {errors.fragpunkId && (
                <span className={styles.errorText}>
                  {t.me?.socialInvalidFragpunk ||
                    "Invalid FragPunk ID format. Use nickname#tag"}
                </span>
              )}
            </label>
            <div className={styles.fragpunkActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={saveFragpunkId}
                disabled={fragSaving}
              >
                {fragSaving ? t.me?.saving || "Saving..." : t.me?.save || "Save"}
              </Button>
              {fragStatus && (
                <span
                  className={`${styles.socialsStatus} ${
                    fragTone === "good" ? styles.good : fragTone === "bad" ? styles.bad : ""
                  }`}
                >
                  {fragStatus}
                </span>
              )}
            </div>
          </div>

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
              <label className={styles.fileControl}>
                <input
                  className={styles.fileInput}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleRankFile(e.target.files?.[0] || null)}
                />
                <span className={styles.fileButton}>
                  {t.me?.rankChooseFile || "Choose file"}
                </span>
                <span className={styles.fileName}>
                  {rankFileName || t.me?.rankNoFile || "No file chosen"}
                </span>
              </label>
            </label>
          </div>

          {rankPreview && (
            <div className={styles.rankPreview}>
              <img src={rankPreview} alt="Rank proof" />
            </div>
          )}

          

          <div className={styles.rankActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={submitRank}
              disabled={rankSending}
            >
              {rankSending
                ? t.me?.rankSending || "Sending..."
                : t.me?.rankSubmit || "Submit"}
            </Button>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={saveSocials}
                disabled={saving}
              >
                {saving ? t.me?.saving || "Saving..." : t.me?.save || "Save"}
              </Button>
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
