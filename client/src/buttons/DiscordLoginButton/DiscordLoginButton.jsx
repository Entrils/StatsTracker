import styles from "@/buttons/DiscordLoginButton/DiscordLoginButton.module.css";
import { useLang } from "@/i18n/LanguageContext";

const DISCORD_OAUTH_STATE_KEY = "discord_oauth_state";
const DISCORD_OAUTH_STATE_TS_KEY = "discord_oauth_state_ts";

export default function DiscordLoginButton() {
  const { t } = useLang();
  const redirectUri = encodeURIComponent(
    `${window.location.origin}/auth/discord/callback`
  );

  const handleLogin = async (event) => {
    event.preventDefault();

    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

    let state = "";
    try {
      const res = await fetch(`${backendUrl}/auth/discord/state`);
      if (!res.ok) throw new Error("Failed to request oauth state");
      const payload = await res.json();
      state = String(payload?.state || "");
    } catch {
      return;
    }
    if (!state) return;

    sessionStorage.setItem(DISCORD_OAUTH_STATE_KEY, state);
    sessionStorage.setItem(DISCORD_OAUTH_STATE_TS_KEY, String(Date.now()));

    const url = `https://discord.com/oauth2/authorize?client_id=1465137820330102968&response_type=code&redirect_uri=${redirectUri}&scope=identify&state=${encodeURIComponent(
      state
    )}`;
    window.location.assign(url);
  };

  return (
    <a href="#" className={styles.link} onClick={handleLogin}>
      <button className={styles.button}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img" focusable="false">
            <path d="M20.1 5.2a19.1 19.1 0 0 0-4.7-1.4l-.2.1c-.2.4-.4.9-.6 1.3a18.3 18.3 0 0 0-5.2 0 12 12 0 0 0-.6-1.3l-.2-.1c-1.6.3-3.2.8-4.7 1.4l-.1.1C1.5 9 1 12.7 1.3 16.3c0 .1 0 .1.1.2a19.4 19.4 0 0 0 5.9 3l.2-.1c.5-.7.9-1.4 1.2-2.1v-.2l-1.1-.4-.1-.2.3-.2c2.3 1 4.7 1 7 0l.3.2-.1.2-1.1.4v.2c.3.7.7 1.4 1.2 2.1l.2.1a19.4 19.4 0 0 0 5.9-3l.1-.2c.3-3.6-.2-7.3-2.6-11.1l-.1-.1ZM8.6 14.5c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.6 1.6-1.5 1.6Zm6.8 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.6 1.6-1.5 1.6Z" />
          </svg>
        </span>
        <span className={styles.text}>
          {t.nav?.loginDiscord || "Login with Discord"}
        </span>
      </button>
    </a>
  );
}

