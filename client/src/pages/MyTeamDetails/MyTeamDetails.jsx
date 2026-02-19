import { useNavigate, useParams } from "react-router-dom";
import styles from "./MyTeamDetails.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import Button from "@/components/ui/Button";
import StateMessage from "@/components/StateMessage/StateMessage";
import useMyTeamDetailsController from "@/hooks/tournaments/useMyTeamDetailsController";
import TeamOverviewSection from "@/components/tournaments/myTeamDetails/TeamOverviewSection";
import TeamRosterSection from "@/components/tournaments/myTeamDetails/TeamRosterSection";
import TeamInvitePanel from "@/components/tournaments/myTeamDetails/TeamInvitePanel";
import TeamActionsRow from "@/components/tournaments/myTeamDetails/TeamActionsRow";
import TeamEditForm from "@/components/tournaments/myTeamDetails/TeamEditForm";
import TeamMatchHistorySection from "@/components/tournaments/myTeamDetails/TeamMatchHistorySection";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function MyTeamDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const { user } = useAuth();

  const tm = t?.tournaments?.myTeams || {};

  const {
    loading,
    notice,
    row,
    roster,
    recentTournaments,
    matchHistory,
    stats,
    slotsLeft,
    inviteUid,
    setInviteUid,
    friendsLoading,
    selectedFriendUid,
    setSelectedFriendUid,
    friendSearch,
    setFriendSearch,
    inviteableFriends,
    filteredInviteableFriends,
    isEditing,
    editName,
    setEditName,
    editAvatarPreview,
    savingEdit,
    onInvite,
    onInviteFriend,
    onDeleteTeam,
    onStartEdit,
    onCancelEdit,
    onEditAvatarChange,
    onSaveEdit,
    onLeaveTeam,
    onKickMember,
    onTransferCaptain,
    onSetMemberRole,
  } = useMyTeamDetailsController({
    id,
    navigate,
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
          <h1 className={styles.title}>{tm.teamDetails || "Team"}</h1>
          <p className={styles.subtitle}>{tm.teamDetailsSubtitle || "Team profile and management"}</p>
        </div>
        <Button size="sm" className={styles.createBtn} onClick={() => navigate("/my-teams")}>
          {tm.title || "My teams"}
        </Button>
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

        <TeamActionsRow
          row={row}
          tm={tm}
          onStartEdit={onStartEdit}
          onDeleteTeam={onDeleteTeam}
          onLeaveTeam={onLeaveTeam}
        />

        {isEditing ? (
          <TeamEditForm
            tm={tm}
            editName={editName}
            setEditName={setEditName}
            onEditAvatarChange={onEditAvatarChange}
            editAvatarPreview={editAvatarPreview}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            savingEdit={savingEdit}
          />
        ) : null}

        <TeamRosterSection
          row={row}
          roster={roster}
          tm={tm}
          onTransferCaptain={onTransferCaptain}
          onKickMember={onKickMember}
          onSetMemberRole={onSetMemberRole}
        />

        {row.isCaptain && slotsLeft > 0 ? (
          <TeamInvitePanel
            tm={tm}
            inviteUid={inviteUid}
            setInviteUid={setInviteUid}
            onInvite={onInvite}
            friendSearch={friendSearch}
            setFriendSearch={setFriendSearch}
            friendsLoading={friendsLoading}
            inviteableFriends={inviteableFriends}
            selectedFriendUid={selectedFriendUid}
            setSelectedFriendUid={setSelectedFriendUid}
            filteredInviteableFriends={filteredInviteableFriends}
            onInviteFriend={onInviteFriend}
          />
        ) : null}

        <TeamMatchHistorySection matchHistory={matchHistory} tm={tm} />
      </section>
    </div>
  );
}
