import styles from "@/pages/MyProfile/MyProfile.module.css";

export default function Record({ label, value, sub }) {
  return (
    <div className={styles.record}>
      <div className={styles.recordLabel}>{label}</div>
      <div className={styles.recordValue}>{value}</div>
      <div className={styles.recordSub}>{sub}</div>
    </div>
  );
}
