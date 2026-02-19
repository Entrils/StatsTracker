import { Link, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import styles from "./MyTeamCreate.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import StateMessage from "@/components/StateMessage/StateMessage";
import TeamCreateForm from "@/components/tournaments/myTeamCreate/TeamCreateForm";
import useMyTeamCreateForm from "@/hooks/tournaments/useMyTeamCreateForm";
import { buildTeamCountries } from "@/shared/tournaments/teamUtils";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function MyTeamCreatePage() {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();

  const tm = t?.tournaments?.myTeams || {};
  const teamCountries = useMemo(() => buildTeamCountries(), []);

  const {
    teamName,
    setTeamName,
    teamMaxMembers,
    setTeamMaxMembers,
    teamCountry,
    setTeamCountry,
    teamAvatarPreview,
    creatingTeam,
    notice,
    onCreateTeam,
    onAvatarChange,
  } = useMyTeamCreateForm({
    user,
    tm,
    backendUrl: BACKEND_URL,
    navigate,
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
      <header className={`${styles.header} ${styles.teamCreatePageHeader}`}>
        <div>
          <h1 className={styles.title}>{tm.createTitle || "Create team"}</h1>
          <p className={styles.subtitle}>{tm.subtitle || "Manage roster, avatars and invites"}</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.detailsLink} to="/my-teams">
            {tm.title || "My teams"}
          </Link>
        </div>
      </header>

      {notice ? <StateMessage text={notice} tone="error" /> : null}

      <TeamCreateForm
        tm={tm}
        teamName={teamName}
        setTeamName={setTeamName}
        teamMaxMembers={teamMaxMembers}
        setTeamMaxMembers={setTeamMaxMembers}
        teamCountry={teamCountry}
        setTeamCountry={setTeamCountry}
        teamCountries={teamCountries}
        creatingTeam={creatingTeam}
        onCreateTeam={onCreateTeam}
        onAvatarChange={onAvatarChange}
        teamAvatarPreview={teamAvatarPreview}
      />
    </div>
  );
}
