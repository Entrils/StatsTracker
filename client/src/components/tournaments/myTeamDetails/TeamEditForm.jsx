import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";

export default function TeamEditForm({
  tm,
  editName,
  setEditName,
  onEditAvatarChange,
  editAvatarPreview,
  onSaveEdit,
  onCancelEdit,
  savingEdit,
}) {
  return (
    <div className={styles.teamEditForm}>
      <h3 className={styles.formTitle}>{tm.editTeam || "Edit team"}</h3>
      <input
        className={styles.input}
        placeholder={tm?.placeholders?.teamName || "Team name"}
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
      />
      <input
        type="file"
        accept="image/*"
        className={styles.input}
        onChange={onEditAvatarChange}
      />
      {!!editAvatarPreview && (
        <img src={editAvatarPreview} alt="Team avatar preview" className={styles.logoPreview} />
      )}
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={onSaveEdit} disabled={savingEdit}>
          {savingEdit ? tm.saving || "Saving..." : tm.save || "Save"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancelEdit} disabled={savingEdit}>
          {tm.cancel || "Cancel"}
        </Button>
      </div>
    </div>
  );
}

