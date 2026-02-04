import styles from "@/pages/MyProfile/MyProfile.module.css";

export default function Mini({ label, value, accent }) {
  return (
    <div
      className={`${styles.mini} ${
        accent === "good" ? styles.good : accent === "bad" ? styles.bad : ""
      }`}
    >
      <div className={styles.miniLabel}>{label}</div>
      <div className={styles.miniValue}>{value}</div>
    </div>
  );
}
