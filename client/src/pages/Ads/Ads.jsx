import styles from "./Ads.module.css";
import { useLang } from "../../i18n/LanguageContext";

export default function Ads() {
  const { t } = useLang();
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>
        {t.ads?.title || "Advertising & contacts"}
      </h1>
      <p className={styles.text}>
        {t.ads?.intro ||
          "For partnerships and advertising placements, contact us:"}
      </p>
      <div className={styles.contactBox}>
        <div className={styles.contactLabel}>{t.ads?.email || "Email"}</div>
        <div className={styles.contactValue}>soon</div>
      </div>
      <div className={styles.contactBox}>
        <div className={styles.contactLabel}>{t.ads?.discord || "Discord"}</div>
        <div className={styles.contactValue}>@entrils</div>
      </div>
    </div>
  );
}
