import styles from "@/pages/Policy/Policy.module.css";
import { useLang } from "@/i18n/LanguageContext";

export default function Policy() {
  const { t } = useLang();
  const renderText = (text) =>
    text?.includes("<strong>") ? (
      <span dangerouslySetInnerHTML={{ __html: text }} />
    ) : (
      text
    );

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>
        {t.policy?.title || "Policy of use"}
      </h1>
      <p className={styles.text}>
        {renderText(
          t.policy?.p1 ||
            "By using FragPunk Tracker, you agree the service is provided \"as is\", without guarantees of availability or data accuracy."
        )}
      </p>
      <p className={styles.text}>
        {renderText(
          t.policy?.p2 ||
            "It is forbidden to use the site for hacking, mass scraping, or automated requests that disrupt service stability."
        )}
      </p>
      <p className={styles.text}>
        {renderText(
          t.policy?.p3 ||
            "We may change functionality and limitations without prior notice."
        )}
      </p>
      <p className={styles.text}>
        {renderText(
          t.policy?.p4 ||
            "FragPunk Tracker is an unofficial, fan-made application and is not affiliated with or endorsed by FragPunk or its publishers."
        )}
      </p>
      <p className={styles.text}>
        {renderText(
          t.policy?.p5 ||
            "The application does not use or access any official game code, servers, or networks."
        )}
      </p>
    </div>
  );
}
