import styles from "@/buttons/DiscordLoginButton/DiscordLoginButton.module.css";

export default function DiscordLoginButton() {
  const redirectUri = encodeURIComponent(
    `${window.location.origin}/auth/discord/callback`
  );

  const url = `https://discord.com/oauth2/authorize?client_id=1465137820330102968&response_type=code&redirect_uri=${redirectUri}&scope=identify`;


  return (
    <a href={url} className={styles.link}>
      <button className={styles.button}>
        <span className={styles.icon}>🎮</span>
        <span className={styles.text}>Login with Discord</span>
      </button>
    </a>
  );
}
