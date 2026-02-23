import styles from "@/pages/Policy/Policy.module.css";
import { useLang } from "@/i18n/LanguageContext";

export default function Policy() {
  const { t } = useLang();
  const renderRich = (text) =>
    text?.includes("<strong>") ? (
      <span dangerouslySetInnerHTML={{ __html: text }} />
    ) : (
      text
    );
  const sections = Array.isArray(t.policy?.sections) ? t.policy.sections : [];
  const legacyParagraphs = [t.policy?.p1, t.policy?.p2, t.policy?.p3, t.policy?.p4, t.policy?.p5].filter(Boolean);

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>
        {t.policy?.title || "Policy of use"}
      </h1>
      {t.policy?.intro && <p className={styles.text}>{renderRich(t.policy.intro)}</p>}

      {(t.policy?.importantTitle || t.policy?.importantText) && (
        <div className={styles.important}>
          {t.policy?.importantTitle && (
            <h2 className={styles.importantTitle}>{renderRich(t.policy.importantTitle)}</h2>
          )}
          {t.policy?.importantText && (
            <p className={styles.importantText}>{renderRich(t.policy.importantText)}</p>
          )}
        </div>
      )}

      {sections.length > 0
        ? sections.map((section, idx) => (
            <section key={`${section?.title || "section"}-${idx}`} className={styles.section}>
              {section?.title && (
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIndex}>{idx + 1}.</span> {renderRich(section.title)}
                </h2>
              )}
              {section?.body && <p className={styles.text}>{renderRich(section.body)}</p>}
              {Array.isArray(section?.items) && section.items.length > 0 && (
                <ul className={styles.list}>
                  {section.items.map((item, itemIdx) => (
                    <li key={`${section?.title || "item"}-${itemIdx}`}>{renderRich(item)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))
        : legacyParagraphs.map((paragraph, idx) => (
            <p key={`legacy-${idx}`} className={styles.text}>
              {renderRich(paragraph)}
            </p>
          ))}

      {(t.policy?.lastUpdatedLabel || t.policy?.lastUpdatedDate) && (
        <p className={styles.updatedAt}>
          {t.policy?.lastUpdatedLabel || "Last updated"}: {t.policy?.lastUpdatedDate || "-"}
        </p>
      )}
    </div>
  );
}
