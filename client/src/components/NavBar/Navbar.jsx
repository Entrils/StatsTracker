import { NavLink, useNavigate } from "react-router-dom"; // ✅ useNavigate
import styles from "./Navbar.module.css";
import { useLang } from "../../i18n/LanguageContext";
import DiscordLoginButton from "../../buttons/DiscordLoginButton/DiscordLoginButton";
import { useAuth } from "../../auth/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useEffect, useRef, useState } from "react";

export default function Navbar() {
  const { lang, setLang, t } = useLang();
  const { user, claims } = useAuth();
  const navigate = useNavigate(); // ✅

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  let discordAvatarUrl = null;
  let discordUsername = null;

  if (user && claims?.provider === "discord") {
    discordUsername = claims.username;

    if (claims.avatar) {
      const discordId = user.uid.replace("discord:", "");
      discordAvatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${claims.avatar}.png`;
    }
  }

  const handleLogout = async () => {
    setOpen(false);
    await signOut(auth);
  };

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>
        FRAG<span>PUNK</span>
      </div>

      <div className={styles.links}>
        {user && (
          <NavLink
            to="/"
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ""}`
            }
          >
            {t.nav.upload}
          </NavLink>
        )}

        <NavLink
          to="/players"
          className={({ isActive }) =>
            `${styles.link} ${isActive ? styles.active : ""}`
          }
        >
          {t.nav.players}
        </NavLink>
      </div>

      <div className={styles.right}>
        {!user && <DiscordLoginButton />}

        {user && (
          <div className={styles.dropdownWrapper} ref={dropdownRef}>
            <button
              className={styles.userButton}
              onClick={() => setOpen((v) => !v)}
            >
              {discordAvatarUrl && (
                <img
                  src={discordAvatarUrl}
                  alt={discordUsername}
                  className={styles.avatar}
                />
              )}
              <span className={styles.username}>
                {discordUsername || "User"}
              </span>
              <span
                className={`${styles.chevron} ${
                  open ? styles.chevronOpen : ""
                }`}
              >
                ▾
              </span>
            </button>

            <div
              className={`${styles.dropdown} ${
                open ? styles.dropdownOpen : ""
              }`}
            >
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/me");
                }}
                className={styles.dropdownItem}
              >
                {t.nav.myProfile || "My profile"}
              </button>

              <button
                onClick={handleLogout}
                className={styles.dropdownItem}
              >
                {t.nav.Logout || "Logout"}
              </button>
            </div>
          </div>
        )}

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
      </div>
    </nav>
  );
}
