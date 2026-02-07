import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import styles from "@/components/NavBar/Navbar.module.css";
import { useLang } from "@/i18n/LanguageContext";
import DiscordLoginButton from "@/buttons/DiscordLoginButton/DiscordLoginButton";
import { useAuth } from "@/auth/AuthContext";
import { auth } from "@/firebase";
import { dedupedJsonRequest } from "@/utils/network/dedupedFetch";

export default function Navbar() {
  const { lang, setLang, t } = useLang();
  const { user, claims } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [friendRequests, setFriendRequests] = useState(0);
  const dropdownRef = useRef(null);
  const langRef = useRef(null);
  const langMobileRef = useRef(null);

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
    sessionStorage.removeItem("discord_oauth_code");
    await signOut(auth);
  };

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
      const inDesktopLang =
        langRef.current && langRef.current.contains(e.target);
      const inMobileLang =
        langMobileRef.current && langMobileRef.current.contains(e.target);
      if (!inDesktopLang && !inMobileLang) {
        setLangOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prev || "";
    }
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!user) {
      setFriendRequests(0);
      return;
    }
    let alive = true;
    const loadRequests = async () => {
      try {
        const token = await user.getIdToken();
        const base = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
        const url = `${base}/friends/requests`;
        const data = await dedupedJsonRequest(
          `friends-requests:${user.uid}`,
          async () => {
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              const error = new Error("Failed to load friend requests");
              error.status = res.status;
              throw error;
            }
            return res.json();
          },
          2500
        );
        if (!alive) return;
        const count = Array.isArray(data?.rows) ? data.rows.length : 0;
        setFriendRequests(count);
      } catch {
        if (alive) setFriendRequests(0);
      }
    };
    loadRequests();
    const id = setInterval(loadRequests, 60 * 1000);
    const handleRefresh = () => {
      loadRequests();
    };
    window.addEventListener("friends-requests-refresh", handleRefresh);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("friends-requests-refresh", handleRefresh);
    };
  }, [user]);

  const closeMobile = () => {
    setMobileOpen(false);
    setLangOpen(false);
  };

  const languages = [
    { code: "ru", label: "Русский", flagSrc: "/flags/ru.png" },
    { code: "en", label: "English", flagSrc: "/flags/eng.png" },
    { code: "de", label: "Deutsch", flagSrc: "/flags/de.png" },
    { code: "fr", label: "Français", flagSrc: "/flags/fr.png" },
  ];
  const currentLang =
    languages.find((item) => item.code === lang) || languages[0];
  const isPlayersActive =
    location.pathname === "/" || location.pathname.startsWith("/players");

  return (
    <nav className={styles.navbar}>
      <div className={styles.navInner}>
        <div className={styles.logo}>
          FragPunk <span>Tracker</span>
        </div>

        <div className={styles.links}>
          {user && (
            <NavLink
              to="/upload"
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
              `${styles.link} ${
                isActive || isPlayersActive ? styles.active : ""
              }`
            }
          >
            {t.nav.players}
          </NavLink>
          <NavLink
            to="/help"
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ""}`
            }
          >
            {t.nav.help || "Help"}
          </NavLink>
          {user && (claims?.admin === true || claims?.role === "admin") && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.admin || "Admin"}
            </NavLink>
          )}
        </div>

        <div className={styles.right}>
          {!user && (
            <div className={styles.desktopLogin}>
              <DiscordLoginButton />
            </div>
          )}

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
                  v
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
                  onClick={() => {
                    setOpen(false);
                    navigate("/friends");
                  }}
                  className={styles.dropdownItem}
                >
                  {t.nav.friends || "Friends"}
                  {!!friendRequests && (
                    <span className={styles.badge}>{friendRequests}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate("/achievements");
                  }}
                  className={styles.dropdownItem}
                >
                  {t.nav.achievements || "Achievements"}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate("/settings");
                  }}
                  className={styles.dropdownItem}
                >
                  {t.nav.settings || "Settings"}
                </button>

                <button onClick={handleLogout} className={styles.dropdownItem}>
                  {t.nav.Logout || "Logout"}
                </button>
              </div>
            </div>
          )}

          <div className={styles.langDropdown} ref={langRef}>
            <button
              className={styles.langToggle}
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              aria-label="Language selector"
            >
              <img
                className={styles.langFlagImg}
                src={currentLang.flagSrc}
                alt=""
              />
              <span className={styles.langCode}>
                {currentLang.code.toUpperCase()}
              </span>
              <span
                className={`${styles.langChevron} ${
                  langOpen ? styles.langChevronOpen : ""
                }`}
              >
                v
              </span>
            </button>
            <div
              className={`${styles.langMenu} ${
                langOpen ? styles.langMenuOpen : ""
              }`}
            >
              {languages.map((item) => (
                <button
                  key={item.code}
                  className={`${styles.langOption} ${
                    lang === item.code ? styles.langOptionActive : ""
                  }`}
                  onClick={() => {
                    setLang(item.code);
                    setLangOpen(false);
                  }}
                >
                  <img
                    className={styles.langFlagImg}
                    src={item.flagSrc}
                    alt=""
                  />
                  <span className={styles.langLabel}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className={styles.burger}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <div
        className={`${styles.mobileOverlay} ${
          mobileOpen ? styles.mobileOverlayOpen : ""
        }`}
        onClick={closeMobile}
      />

      <aside
        className={`${styles.offcanvas} ${
          mobileOpen ? styles.offcanvasOpen : ""
        }`}
      >
        <div className={styles.offcanvasHeader}>
          <div className={styles.logo}>
            FragPunk <span>Tracker</span>
          </div>
          <button
            className={styles.closeBtn}
            onClick={closeMobile}
            aria-label="Close menu"
          >
            x
          </button>
        </div>

        <div className={styles.offcanvasLinks}>
          {user && (
            <NavLink
              to="/upload"
              onClick={closeMobile}
              className={({ isActive }) =>
                `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.upload}
            </NavLink>
          )}
          <NavLink
            to="/players"
            onClick={closeMobile}
            className={({ isActive }) =>
              `${styles.offcanvasLink} ${
                isActive || isPlayersActive ? styles.active : ""
              }`
            }
          >
            {t.nav.players}
          </NavLink>
          <NavLink
            to="/help"
            onClick={closeMobile}
            className={({ isActive }) =>
              `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
            }
          >
            {t.nav.help || "Help"}
          </NavLink>
          {user && (
            <NavLink
              to="/me"
              onClick={closeMobile}
              className={({ isActive }) =>
                `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.myProfile || "My profile"}
            </NavLink>
          )}
          {user && (
            <NavLink
              to="/friends"
              onClick={closeMobile}
              className={({ isActive }) =>
                `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.friends || "Friends"}
              {!!friendRequests && (
                <span className={styles.badge}>{friendRequests}</span>
              )}
            </NavLink>
          )}
          {user && (
            <NavLink
              to="/achievements"
              onClick={closeMobile}
              className={({ isActive }) =>
                `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.achievements || "Achievements"}
            </NavLink>
          )}
          {user && (
            <NavLink
              to="/settings"
              onClick={closeMobile}
              className={({ isActive }) =>
                `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.settings || "Settings"}
            </NavLink>
          )}
          {user && (claims?.admin === true || claims?.role === "admin") && (
            <NavLink
              to="/admin"
              onClick={closeMobile}
              className={({ isActive }) =>
                `${styles.offcanvasLink} ${isActive ? styles.active : ""}`
              }
            >
              {t.nav.admin || "Admin"}
            </NavLink>
          )}
        </div>

        <div className={styles.offcanvasActions}>
          {!user && <DiscordLoginButton />}
          {user && (
            <button
              onClick={async () => {
                await handleLogout();
                closeMobile();
              }}
              className={styles.offcanvasBtn}
            >
              {t.nav.Logout || "Logout"}
            </button>
          )}
        </div>

        <div className={styles.offcanvasLang}>
          <div className={styles.langDropdown} ref={langMobileRef}>
            <button
              className={styles.langToggle}
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              aria-label="Language selector"
            >
              <img
                className={styles.langFlagImg}
                src={currentLang.flagSrc}
                alt=""
              />
              <span className={styles.langCode}>
                {currentLang.code.toUpperCase()}
              </span>
              <span
                className={`${styles.langChevron} ${
                  langOpen ? styles.langChevronOpen : ""
                }`}
              >
                v
              </span>
            </button>
            <div
              className={`${styles.langMenu} ${
                langOpen ? styles.langMenuOpen : ""
              }`}
            >
              {languages.map((item) => (
                <button
                  key={item.code}
                  className={`${styles.langOption} ${
                    lang === item.code ? styles.langOptionActive : ""
                  }`}
                  onClick={() => {
                    setLang(item.code);
                    setLangOpen(false);
                    closeMobile();
                  }}
                >
                  <img
                    className={styles.langFlagImg}
                    src={item.flagSrc}
                    alt=""
                  />
                  <span className={styles.langLabel}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </nav>
  );
}
