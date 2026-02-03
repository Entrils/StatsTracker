import { useEffect, useState } from "react";
import styles from "./Socials.module.css";
import { useAuth } from "../../auth/AuthContext";
import { useLang } from "../../i18n/LanguageContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function Socials() {
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

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch(`${BACKEND_URL}/profile/${user.uid}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const s = data?.socials || {};
        setSocials({
          twitch: s.twitch || "",
          youtube: s.youtube || "",
          tiktok: s.tiktok || "",
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user]);

  const saveSocials = async () => {
    if (!user) return;
    setSaving(true);
    setStatus(t.me?.saving || "Saving...");
    setTone("neutral");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/profile/socials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ socials }),
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
        <h1 className={styles.title}>{t.me?.socials || "Socials"}</h1>
        <p className={styles.hint}>{t.me?.loginRequired || "Login required"}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t.me?.socials || "Socials"}</h1>
        <p className={styles.hint}>
          {t.me?.socialsHint ||
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
                className={styles.socialInput}
                value={socials.twitch}
                onChange={(e) =>
                  (setSocials((s) => ({ ...s, twitch: e.target.value })),
                  setEditing((ed) => ({ ...ed, twitch: true })))
                }
                placeholder="twitch.tv/username"
              />
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
                className={styles.socialInput}
                value={socials.youtube}
                onChange={(e) =>
                  (setSocials((s) => ({ ...s, youtube: e.target.value })),
                  setEditing((ed) => ({ ...ed, youtube: true })))
                }
                placeholder="youtube.com/@username"
              />
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
                className={styles.socialInput}
                value={socials.tiktok}
                onChange={(e) =>
                  (setSocials((s) => ({ ...s, tiktok: e.target.value })),
                  setEditing((ed) => ({ ...ed, tiktok: true })))
                }
                placeholder="tiktok.com/@username"
              />
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
  );
}
