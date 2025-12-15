import { NavLink } from "react-router-dom";
import styles from "./Navbar.module.css";
import { useLang } from "../../i18n/LanguageContext";

export default function Navbar() {
  const { lang, setLang, t } = useLang();

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>
        FRAG<span>PUNK</span>
      </div>

      <div className={styles.links}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `${styles.link} ${isActive ? styles.active : ""}`
          }
        >
          {t.nav.upload}
        </NavLink>

        <NavLink
          to="/players"
          className={({ isActive }) =>
            `${styles.link} ${isActive ? styles.active : ""}`
          }
        >
          {t.nav.players}
        </NavLink>
      </div>

      <div className={styles.langSwitch}>
        <button
          className={`${styles.langBtn} ${
            lang === "en" ? styles.langActive : ""
          }`}
          onClick={() => setLang("en")}
        >
          EN
        </button>

        <button
          className={`${styles.langBtn} ${
            lang === "ru" ? styles.langActive : ""
          }`}
          onClick={() => setLang("ru")}
        >
          RU
        </button>
      </div>
    </nav>
  );
}
