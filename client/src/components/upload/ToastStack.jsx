import styles from "@/pages/UploadTab/UploadTab.module.css";

export default function ToastStack({ toasts }) {
  if (!toasts?.length) return null;

  return (
    <div className={styles.toastStack}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${
            toast.tone === "bad" ? styles.toastBad : styles.toastGood
          }`}
        >
          {toast.icon && (
            <span className={styles.toastIcon}>
              <img src={toast.icon} alt="" />
            </span>
          )}
          <span className={styles.toastText}>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

