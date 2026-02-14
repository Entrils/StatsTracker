import styles from "@/pages/MyProfile/MyProfile.module.css";
import { formatRank, rankClass, rankIconSrc } from "@/utils/myProfile/formatters";

export default function RanksCard({ t, profileRanks }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>{t.me?.ranks || "Ranks"}</h2>
      <div className={styles.rankGrid}>
        {["s1", "s2", "s3", "s4"].map((season) => (
          <div
            key={season}
            className={`${styles.rankItem} ${
              profileRanks?.[season]?.rank ? "" : styles.rankEmpty
            }`}
          >
            <div className={styles.rankSeason}>{season.toUpperCase()}</div>
            {profileRanks?.[season]?.rank ? (
              <img
                className={styles.rankIcon}
                src={rankIconSrc(profileRanks[season].rank)}
                alt={formatRank(profileRanks[season].rank, t)}
              />
            ) : (
              <img
                className={styles.rankIcon}
                src={rankIconSrc("unranked")}
                alt={t.me?.rankNone || "Not verified"}
              />
            )}
            <div
              className={`${styles.rankValue} ${
                profileRanks?.[season]?.rank
                  ? styles[`rank${rankClass(profileRanks[season].rank)}`]
                  : ""
              }`}
            >
              {profileRanks?.[season]?.rank
                ? formatRank(profileRanks[season].rank, t)
                : t.me?.rankNone || "Not verified"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
