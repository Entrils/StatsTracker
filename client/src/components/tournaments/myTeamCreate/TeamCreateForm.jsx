import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeamCreate/MyTeamCreate.module.css";
import { TEAM_CREATION_FORMATS, teamMaxMembersByFormat } from "@/shared/tournaments/teamUtils";

export default function TeamCreateForm({
  tm,
  teamName,
  setTeamName,
  teamFormat,
  setTeamFormat,
  teamCountry,
  setTeamCountry,
  teamCountries,
  creatingTeam,
  onCreateTeam,
  onAvatarChange,
  teamAvatarPreview,
}) {
  return (
    <section className={`${styles.teamsSection} ${styles.teamCreatePageSection}`}>
      <form className={`${styles.teamCreate} ${styles.teamCreateVertical}`} onSubmit={onCreateTeam}>
        <input
          className={styles.input}
          placeholder={tm?.placeholders?.teamName || "Team name"}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
        <input type="file" accept="image/*" className={styles.input} onChange={onAvatarChange} />
        <select
          className={styles.select}
          value={teamFormat}
          onChange={(e) => setTeamFormat(String(e.target.value || "5x5"))}
        >
          {TEAM_CREATION_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f} ({teamMaxMembersByFormat(f)})
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={teamCountry}
          onChange={(e) => setTeamCountry(String(e.target.value || ""))}
        >
          <option value="">{tm?.placeholders?.country || "Team country"}</option>
          {teamCountries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} - {c.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={creatingTeam}>
          {creatingTeam ? tm.creatingTeam || "Creating..." : tm.createTeam || "Create team"}
        </Button>
      </form>
      {!!teamAvatarPreview && (
        <div className={styles.logoPreviewWrap}>
          <img src={teamAvatarPreview} alt="Team avatar preview" className={styles.logoPreview} />
        </div>
      )}
    </section>
  );
}


