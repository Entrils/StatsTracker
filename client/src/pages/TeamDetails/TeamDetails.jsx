import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";
import { useLang } from "@/i18n/LanguageContext";
import StateMessage from "@/components/StateMessage/StateMessage";
import TeamOverviewSection from "@/components/tournaments/myTeamDetails/TeamOverviewSection";
import TeamRosterSection from "@/components/tournaments/myTeamDetails/TeamRosterSection";
import TeamMatchHistorySection from "@/components/tournaments/myTeamDetails/TeamMatchHistorySection";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function TeamDetailsPage() {
  const { id } = useParams();
  const { t } = useLang();
  const tm = t?.tournaments?.myTeams || {};

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [teamData, setTeamData] = useState(null);

  const loadTeam = useCallback(async () => {
    if (!id) {
      setTeamData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`${BACKEND_URL}/teams/${id}/public`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.teamNotFound || "Team not found");
      setTeamData(data || null);
    } catch (err) {
      setTeamData(null);
      setNotice(err?.message || tm.teamNotFound || "Team not found");
    } finally {
      setLoading(false);
    }
  }, [id, tm.teamNotFound]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const row = teamData?.row || null;
  const roster = Array.isArray(teamData?.roster) ? teamData.roster : [];
  const recentTournaments = Array.isArray(teamData?.recentTournaments) ? teamData.recentTournaments : [];
  const matchHistory = Array.isArray(teamData?.matchHistory) ? teamData.matchHistory : [];
  const stats = teamData?.stats || { wins: 0, losses: 0, matchesPlayed: 0, winRate: 0 };
  const slotsLeft = useMemo(() => {
    if (!row) return 0;
    return Math.max(0, Number(row.maxMembers || 0) - Number(row.memberCount || 0));
  }, [row]);

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={tm.loading || "Loading..."} tone="neutral" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={notice || tm.teamNotFound || "Team not found"} tone="error" />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{row.name || tm.teamDetails || "Team"}</h1>
          <p className={styles.subtitle}>{tm.teamDetailsSubtitle || "Team profile"}</p>
        </div>
        <Link className={styles.detailsLink} to="/tournaments">
          {t?.tournaments?.details?.backToList || "Back to list"}
        </Link>
      </header>

      {notice ? <StateMessage text={notice} tone="neutral" /> : null}

      <section className={styles.teamsSection}>
        <TeamOverviewSection
          row={row}
          stats={stats}
          recentTournaments={recentTournaments}
          slotsLeft={slotsLeft}
          tm={tm}
        />
        <TeamRosterSection
          row={row}
          roster={roster}
          tm={tm}
          onTransferCaptain={() => {}}
          onKickMember={() => {}}
        />
        <TeamMatchHistorySection matchHistory={matchHistory} tm={tm} />
      </section>
    </div>
  );
}
