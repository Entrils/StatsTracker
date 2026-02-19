import styles from "@/pages/TournamentDetails/TournamentDetails.module.css";

export default function ParticipantsTab({ td, tournament, registrations = [] }) {
  const currentCount = Array.isArray(registrations)
    ? registrations.length
    : Number(tournament?.registeredTeams || 0);
  const maxCount = Number(tournament?.maxTeams || 0);

  return (
    <section className={styles.teamsSection}>
      <h2 className={styles.formTitle}>
        {td?.participants?.title || "Participants"} ({currentCount}/{maxCount || currentCount})
      </h2>
      {!registrations.length ? (
        <p className={styles.hint}>{td?.participants?.empty || "No registrations yet"}</p>
      ) : (
        <div className={styles.teamList}>
          {registrations.map((r, index) => (
            <div key={r.id} className={styles.teamCard}>
              <div className={styles.teamCardHead}>
                <span className={styles.participantIndex}>{index + 1}.</span>
                <img
                  src={r.avatarUrl || "/nologoteam.png"}
                  alt={`${r.teamName} avatar`}
                  className={styles.teamAvatar}
                />
                <div>
                  <p className={styles.participantName}>
                    <strong>{r.teamName}</strong>
                  </p>
                  <p className={styles.participantElo}>
                    {tournament.teamFormat === "1x1"
                      ? (td?.participants?.elo || "ELO: {value}").replace("{value}", r.avgEloSnapshot)
                      : (td?.participants?.averageElo || "Average ELO: {value}").replace(
                          "{value}",
                          r.avgEloSnapshot
                        )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

