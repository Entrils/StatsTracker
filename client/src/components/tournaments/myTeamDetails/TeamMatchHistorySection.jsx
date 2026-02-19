import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";
import { formatTeamMatchDate } from "@/shared/tournaments/myTeamDetailsUtils";

export default function TeamMatchHistorySection({ matchHistory, tm }) {
  return (
    <>
      <h3 className={`${styles.formTitle} ${styles.teamDetailsSectionTitle}`}>
        {tm.matchHistory || "Match history"}
      </h3>
      <div className={`${styles.teamTableWrap} ${styles.teamDetailsTableWrap}`}>
        <table className={styles.teamTable}>
          <thead>
            <tr>
              <th>{tm.tournament || "Tournament"}</th>
              <th>{tm.opponent || "Opponent"}</th>
              <th>{tm.result || "Result"}</th>
              <th>{tm.score || "Score"}</th>
              <th>{tm.date || "Date"}</th>
            </tr>
          </thead>
          <tbody>
            {!matchHistory.length ? (
              <tr>
                <td colSpan={5}>{tm.noData || "No data"}</td>
              </tr>
            ) : (
              matchHistory.map((match) => (
                <tr key={`${match.tournamentId}-${match.id}`}>
                  <td>{match.tournamentTitle || "-"}</td>
                  <td>{match.opponent?.teamName || "TBD"}</td>
                  <td>
                    {match.result === "win"
                      ? (tm.win || "Win")
                      : match.result === "loss"
                        ? (tm.loss || "Loss")
                        : (tm.pending || "Pending")}
                  </td>
                  <td>{match.scoreFor}:{match.scoreAgainst}</td>
                  <td>{formatTeamMatchDate(match.playedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


