import { useNavigate } from "react-router-dom";
import styles from "./MyTeams.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import Button from "@/components/ui/Button";
import StateMessage from "@/components/StateMessage/StateMessage";
import useMyTeamsController from "@/hooks/tournaments/useMyTeamsController";
import MyTeamInvitesSection from "@/components/tournaments/myTeams/MyTeamInvitesSection";
import MyTeamsTable from "@/components/tournaments/myTeams/MyTeamsTable";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function MyTeamsPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();

  const tm = t?.tournaments?.myTeams || {};

  const { teams, invites, loading, notice, onInviteDecision, onLeaveTeam } =
    useMyTeamsController({
      user,
      tm,
      backendUrl: BACKEND_URL,
    });

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={tm.loginRequired || "Login required"} tone="error" />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{tm.title || "My teams"}</h1>
          <p className={styles.subtitle}>{tm.subtitle || "Manage roster, avatars and invites"}</p>
        </div>
        <div className={styles.actions}>
          <Button size="sm" className={styles.createBtn} onClick={() => navigate("/my-teams/create")}>
            {tm.createTitle || "Create team"}
          </Button>
        </div>
      </header>

      {notice ? <StateMessage text={notice} tone="neutral" /> : null}
      {loading ? <StateMessage text={tm.loading || "Loading..."} tone="neutral" /> : null}

      <MyTeamInvitesSection
        tm={tm}
        invites={invites}
        onInviteDecision={onInviteDecision}
      />

      <section className={styles.teamsSection}>
        <h2 className={styles.formTitle}>{tm.listTitle || "Team list"}</h2>
        {!loading && !teams.length ? (
          <p className={styles.hint}>{tm.noTeams || "You have no teams yet"}</p>
        ) : (
          <MyTeamsTable
            tm={tm}
            teams={teams}
            onLeaveTeam={onLeaveTeam}
            navigate={navigate}
          />
        )}
      </section>
    </div>
  );
}
