import styles from "@/pages/MyTeams/MyTeams.module.css";
import { countryLabel, getCountryFlagUrl } from "@/shared/tournaments/teamUtils";

export default function TeamCountryBadge({ country = "" }) {
  const label = countryLabel(country);
  const flagUrl = getCountryFlagUrl(country);
  return (
    <span className={styles.teamCountryInline}>
      {flagUrl ? (
        <img
          className={styles.teamCountryFlag}
          src={flagUrl}
          alt={`${label} flag`}
          loading="lazy"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}


