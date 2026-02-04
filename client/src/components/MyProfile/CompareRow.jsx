import styles from "@/pages/MyProfile/MyProfile.module.css";

function sign(x) {
  return x >= 0 ? "+" : "";
}

export default function CompareRow({ label, you, global, delta, accent, compareSep }) {
  return (
    <div className={styles.compareRow}>
      <div className={styles.compareLabel}>{label}</div>

      <div className={styles.compareVals}>
        <span className={styles.compareYou}>{you}</span>
        <span className={styles.compareSep}>{compareSep || "vs"}</span>
        <span className={styles.compareGlobal}>{global}</span>
      </div>

      <div
        className={`${styles.compareDelta} ${
          accent === "good" ? styles.good : accent === "bad" ? styles.bad : ""
        }`}
      >
        {typeof delta === "number" ? `${sign(delta)}${delta}` : delta}
      </div>
    </div>
  );
}
