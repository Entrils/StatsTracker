import styles from "./DiscordLoginButton.module.css";

export default function DiscordLoginButton() {

  const redirectUri = encodeURIComponent(
    "http://localhost:5173/auth/discord/callback"
  );

  const url ="https://discord.com/oauth2/authorize?client_id=1465137820330102968&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fdiscord%2Fcallback&scope=identify";


  return (
    <a href={url} className={styles.link}>
      <button className={styles.button}>
        <span className={styles.icon}>🎮</span>
        <span className={styles.text}>Discord</span>
      </button>
    </a>
  );
}
