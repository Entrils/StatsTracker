import { useState } from "react";
import styles from "./Admin.module.css";
import { useAuth } from "../../auth/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function Admin() {
  const { user, claims } = useAuth();
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);
  const [errors, setErrors] = useState([]);

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
    </div>
  );
}
