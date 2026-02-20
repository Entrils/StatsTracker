import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";
import { buildFriendAvatarUrl } from "@/shared/tournaments/myTeamDetailsUtils";

export default function TeamInvitePanel({
  tm,
  inviteUid,
  setInviteUid,
  onInvite,
  friendSearch,
  setFriendSearch,
  friendsLoading,
  inviteableFriends,
  selectedFriendUid,
  setSelectedFriendUid,
  filteredInviteableFriends,
  onInviteFriend,
  pendingInvites,
  onCancelInvite,
}) {
  return (
    <div className={`${styles.teamInviteShell} ${styles.teamDetailsInviteShell}`}>
      <div className={styles.inviteRow}>
        <input
          className={styles.input}
          placeholder={tm?.placeholders?.playerUid || "Player UID"}
          value={inviteUid}
          onChange={(e) => setInviteUid(e.target.value)}
        />
        <Button variant="secondary" size="sm" onClick={onInvite}>
          {tm.invite || "Invite"}
        </Button>
      </div>

      <div className={styles.teamInviteFriends}>
        <p className={styles.metaLabel}>{tm.inviteFromFriends || "Invite from friends"}</p>
        <input
          className={styles.input}
          placeholder={tm?.placeholders?.friendSearch || "Search friend by name or UID"}
          value={friendSearch}
          onChange={(e) => setFriendSearch(e.target.value)}
          disabled={friendsLoading || inviteableFriends.length === 0}
        />
        <div className={styles.inviteRow}>
          <select
            className={styles.select}
            value={selectedFriendUid}
            onChange={(e) => setSelectedFriendUid(String(e.target.value || ""))}
            disabled={friendsLoading || filteredInviteableFriends.length === 0}
          >
            <option value="">
              {friendsLoading ? tm.loading || "Loading..." : tm.selectFriend || "Select a friend"}
            </option>
            {filteredInviteableFriends.map((friend) => (
              <option key={friend.uid} value={friend.uid}>
                {friend.name || friend.uid}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onInviteFriend()}
            disabled={!selectedFriendUid}
          >
            {tm.invite || "Invite"}
          </Button>
        </div>
        {!!filteredInviteableFriends.length && (
          <div className={styles.teamInviteFriendList}>
            {filteredInviteableFriends.slice(0, 10).map((friend) => (
              <button
                key={friend.uid}
                type="button"
                className={styles.teamInviteFriendItem}
                onClick={() => onInviteFriend(friend.uid)}
              >
                <img
                  src={buildFriendAvatarUrl(friend) || "/nologoteam.png"}
                  alt={friend.name || friend.uid}
                  className={styles.teamInviteFriendAvatar}
                />
                <span>{friend.name || friend.uid}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.invites}>
        <p className={styles.invitesTitle}>{tm.invitedPlayers || "Invited players"}</p>
        {Array.isArray(pendingInvites) && pendingInvites.length ? (
          pendingInvites.map((invite) => (
            <div className={styles.inviteItem} key={invite.uid}>
              <span>{invite.name || invite.uid}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCancelInvite(invite.uid)}
              >
                {tm.cancelInvite || tm.cancel || "Cancel"}
              </Button>
            </div>
          ))
        ) : (
          <p className={styles.metaLabel}>{tm.noInvites || "No pending invites"}</p>
        )}
      </div>
    </div>
  );
}


