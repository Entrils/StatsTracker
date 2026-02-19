import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeams/MyTeams.module.css";
import TeamCountryBadge from "@/components/tournaments/TeamCountryBadge";
import { teamFormatByMembers } from "@/shared/tournaments/teamUtils";

export default function MyTeamsTable({ tm, teams, onLeaveTeam, navigate }) {
  return (
    <div className={styles.teamTableWrap}>
      <table className={styles.teamTable}>
        <thead>
          <tr>
            <th>{tm.team || "Team"}</th>
            <th>{tm.teamSize || tm.members || "Members"}</th>
            <th>{tm.format || "Format"}</th>
            <th>{tm.country || "Country"}</th>
            <th>{tm.role || "Role"}</th>
            <th>{tm.actions || "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr
              key={team.id}
              className={styles.teamTableRow}
              onClick={() => navigate(`/my-teams/${team.id}`)}
            >
              <td>
                <div className={styles.teamCellMain}>
                  <img
                    src={team.avatarUrl || "/nologoteam.png"}
                    alt={`${team.name} avatar`}
                    className={styles.teamAvatarLg}
                  />
                  <Link
                    className={styles.teamTitleLink}
                    to={`/my-teams/${team.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {team.name}
                  </Link>
                </div>
              </td>
              <td>{team.memberCount}/{team.maxMembers}</td>
              <td>{teamFormatByMembers(team.maxMembers)}</td>
              <td><TeamCountryBadge country={team.country} /></td>
              <td>{team.isCaptain ? tm.captainRole || "Captain" : tm.playerRole || "Player"}</td>
              <td>
                {!team.isCaptain ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLeaveTeam(team.id);
                    }}
                  >
                    {tm.leaveTeam || "Leave team"}
                  </Button>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


