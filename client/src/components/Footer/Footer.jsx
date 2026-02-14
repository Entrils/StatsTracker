import styles from "@/components/Footer/Footer.module.css";
import { useLang } from "@/i18n/LanguageContext";

export default function Footer() {
  const { t } = useLang();
  const sep = "\u00B7";
  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>{t.footer?.brand || "FragPunk Tracker"}</div>
      <div className={styles.copy}>
        {t.footer?.text ||
          "All rights reserved. Site materials are intended for personal use only."}
      </div>
      <div className={styles.links}>
        <a href="/policy" className={styles.link}>
          {t.footer?.policy || "Policy of use"}
        </a>
        <span className={styles.sep}>{sep}</span>
        <a href="/support" className={styles.link}>
          {t.footer?.support || "Support"}
        </a>
        <span className={styles.sep}>{sep}</span>
        <a href="/ads" className={styles.link}>
          {t.footer?.ads || "Advertising & contacts"}
        </a>
        <span className={styles.sep}>{sep}</span>
        <a href="/roadmap" className={styles.link}>
          {t.footer?.roadmap || "Roadmap"}
        </a>
      </div>
    </footer>
  );
}
