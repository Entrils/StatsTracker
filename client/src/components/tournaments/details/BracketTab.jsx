import Button from "@/components/ui/Button";
import { Link } from "react-router-dom";
import styles from "@/pages/TournamentDetails/TournamentDetails.module.css";

export default function BracketTab({
  td,
  isSolo = false,
  tournamentId,
  buildMatchHref,
  isAdmin,
  generating,
  canGenerateBracket,
  onGenerate,
  matchesSource,
  stageTabs,
  stageFilter,
  onStageFilterChange,
  stageLabels,
  groupStageMatches,
  groupStatsByGroup,
  getTeamScoreClass,
  getMatchScoreText,
  hasTeamIdentity,
  savingResultId,
  onOpenScoreModal,
  onFinishGroupStage,
  canFinishGroupStage,
  generatingPlayoff,
  isDoubleAllView,
  doubleElimRef,
  doubleElimOverlay,
  upperRounds,
  lowerRounds,
  renderTree,
  upperFinalRef,
  lowerFinalRef,
  grandFinalRef,
  grandTopRowRef,
  grandBottomRowRef,
  grandFinalMatch,
  treeRounds,
  visibleBuckets,
}) {
  const toMatchHref = (id) => {
    if (typeof buildMatchHref === "function") return buildMatchHref(id);
    return tournamentId ? `/tournaments/${tournamentId}/matches/${id}` : "#";
  };
  const sideAName = isSolo ? "Player A" : "Team A";
  const sideBName = isSolo ? "Player B" : "Team B";
  const groupEntityLabel = isSolo ? (td?.bracket?.player || "Player") : (td?.bracket?.team || "Team");
  const getEntityHref = (side) => {
    const id = String(side?.teamId || "").trim();
    if (!id) return "";
    return isSolo ? `/player/${encodeURIComponent(id)}` : `/teams/${encodeURIComponent(id)}`;
  };
  const getBestOfLabel = (m) => {
    const value = Number(m?.bestOf);
    return `BO${[1, 3, 5].includes(value) ? value : 1}`;
  };

  return (
    <section className={styles.teamsSection}>
      <div className={styles.cardTop}>
        <h2 className={styles.formTitle}>{td?.bracket?.title || "Bracket"}</h2>
        <div className={styles.actions}>
          {isAdmin && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={onGenerate}
                disabled={generating || !canGenerateBracket}
              >
                {generating
                  ? td?.bracket?.generating || "Generating..."
                  : td?.bracket?.generate || "Generate bracket"}
              </Button>
              {!canGenerateBracket && (
                <span className={styles.rowSubText}>
                  {td?.bracket?.minParticipants || "At least 2 participants are required"}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {!!matchesSource.length && (
        <div className={styles.tabs}>
          {stageTabs.map((key) => (
            <button
              key={key}
              type="button"
              className={`${styles.tab} ${stageFilter === key ? styles.tabActive : ""}`}
              onClick={() => onStageFilterChange(key)}
            >
              {stageLabels[key] || key}
            </button>
          ))}
        </div>
      )}

      {!matchesSource.length ? (
        <p className={styles.hint}>{td?.bracket?.empty || "Bracket is not generated yet"}</p>
      ) : (stageFilter === "group" || (stageFilter === "all" && groupStageMatches.length)) ? (
        <div className={styles.groupStageWrap}>
          <div className={styles.groupTables}>
            {groupStatsByGroup.map((group) => (
              <div key={`table-${group.group}`} className={styles.groupTableCard}>
                <h3 className={styles.invitesTitle}>
                  {(td?.bracket?.group || "Group {name}").replace("{name}", group.group)}
                </h3>
                <table className={styles.groupTable}>
                  <thead>
                    <tr>
                      <th>{groupEntityLabel}</th>
                      <th>W</th>
                      <th>L</th>
                      <th>P</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={`row-${group.group}-${row.teamId}`}>
                        <td className={styles.groupTeamCell}>
                          {hasTeamIdentity(row) && (
                            <img
                              src={row.avatarUrl || "/nologoteam.png"}
                              alt={`${row.teamName} avatar`}
                              className={styles.teamAvatar}
                            />
                          )}
                          <span>{row.teamName}</span>
                        </td>
                        <td>{row.wins}</td>
                        <td>{row.losses}</td>
                        <td>{row.played}</td>
                        <td>{row.scoreFor - row.scoreAgainst}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className={styles.groupMatchesSection}>
            <h3 className={styles.invitesTitle}>{td?.bracket?.matches || "Matches"}</h3>
            <div className={styles.rounds}>
              {groupStatsByGroup.map((group) => {
                const matches = groupStageMatches.filter(
                  (m) => String(m.group || "A") === String(group.group)
                );
                return (
                  <div key={`group-matches-${group.group}`} className={styles.roundCol}>
                    <h4 className={styles.invitesTitle}>
                      {(td?.bracket?.group || "Group {name}").replace("{name}", group.group)}
                    </h4>
                    {matches.map((m) => (
                      <div key={m.id} className={styles.matchCard}>
                        <div className={styles.matchTeamRow}>
                          <div className={styles.matchTeamInfo}>
                            {hasTeamIdentity(m.teamA) && (
                              <img
                                src={m.teamA?.avatarUrl || "/nologoteam.png"}
                                alt={`${m.teamA?.teamName || sideAName} avatar`}
                                className={styles.teamAvatar}
                              />
                            )}
                            <p className={styles.meta}>
                              {getEntityHref(m.teamA) ? (
                                <Link className={styles.entityLink} to={getEntityHref(m.teamA)}>
                                  {m.teamA?.teamName || "TBD"}
                                </Link>
                              ) : (m.teamA?.teamName || "TBD")}
                            </p>
                          </div>
                          <span className={`${styles.matchScore} ${getTeamScoreClass(m, "A")}`}>
                            {getMatchScoreText(m, "A")}
                          </span>
                        </div>
                        <div className={styles.matchTeamRow}>
                          <div className={styles.matchTeamInfo}>
                            {hasTeamIdentity(m.teamB) && (
                              <img
                                src={m.teamB?.avatarUrl || "/nologoteam.png"}
                                alt={`${m.teamB?.teamName || sideBName} avatar`}
                                className={styles.teamAvatar}
                              />
                            )}
                            <p className={styles.meta}>
                              {getEntityHref(m.teamB) ? (
                                <Link className={styles.entityLink} to={getEntityHref(m.teamB)}>
                                  {m.teamB?.teamName || "TBD"}
                                </Link>
                              ) : (m.teamB?.teamName || "TBD")}
                            </p>
                          </div>
                          <span className={`${styles.matchScore} ${getTeamScoreClass(m, "B")}`}>
                            {getMatchScoreText(m, "B")}
                          </span>
                        </div>
                        {isAdmin && (
                          <div className={styles.matchEditFloating}>
                            <button
                              type="button"
                              className={styles.matchEditBtn}
                              aria-label={td?.modal?.editScore || "Edit match score"}
                              title={td?.modal?.editScore || "Edit match score"}
                              disabled={!m.teamA?.teamId || !m.teamB?.teamId || savingResultId === m.id}
                              onClick={() => onOpenScoreModal(m)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42L18.21 3.29a1.003 1.003 0 0 0-1.42 0L14.96 5.12l3.75 3.75 1.99-1.66z" />
                              </svg>
                            </button>
                          </div>
                        )}
                        {tournamentId ? (
                          <div className={styles.matchCompactFooter}>
                            <span className={styles.bestOfChip}>{getBestOfLabel(m)}</span>
                            <Link className={styles.detailsLink} to={toMatchHref(m.id)}>
                              {td?.match?.open || "Open match"}
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <div className={styles.formActions}>
              <Button
                size="sm"
                onClick={onFinishGroupStage}
                disabled={!canFinishGroupStage || generatingPlayoff}
              >
                {generatingPlayoff
                  ? td?.bracket?.finishingGroup || "Finishing..."
                  : td?.bracket?.finishGroup || "Finish group stage"}
              </Button>
            </div>
          )}
        </div>
      ) : isDoubleAllView ? (
        <div className={styles.doubleElimScroll}>
          <div className={styles.doubleElimUnified} ref={doubleElimRef}>
            <svg
              className={styles.doubleElimOverlay}
              aria-hidden="true"
              width={doubleElimOverlay.width}
              height={doubleElimOverlay.height}
              viewBox={`0 0 ${doubleElimOverlay.width || 1} ${doubleElimOverlay.height || 1}`}
              preserveAspectRatio="none"
            >
              {doubleElimOverlay.upper && <path d={doubleElimOverlay.upper} />}
              {doubleElimOverlay.lower && <path d={doubleElimOverlay.lower} />}
            </svg>
            <div className={styles.doubleElimLaneUpper}>
              <h3 className={styles.invitesTitle}>{td?.stage?.upper || "Upper"}</h3>
              {renderTree(upperRounds, "upper", true, upperFinalRef)}
            </div>
            <div className={styles.doubleElimLaneLower}>
              <h3 className={styles.invitesTitle}>{td?.stage?.lower || "Lower"}</h3>
              {renderTree(lowerRounds, "lower", true, lowerFinalRef)}
            </div>
            <div className={styles.doubleElimGrand} ref={grandFinalRef}>
              <div className={`${styles.bracketMatch} ${styles.doubleElimGrandCard}`}>
                <h3 className={styles.bracketRoundTitle}>{td?.stage?.grand_final || "Grand Final"}</h3>
                <div className={styles.matchTeamRow} ref={grandTopRowRef}>
                  <div className={styles.matchTeamInfo}>
                    {hasTeamIdentity(grandFinalMatch.teamA) && (
                      <img
                        src={grandFinalMatch.teamA?.avatarUrl || "/nologoteam.png"}
                        alt={`${grandFinalMatch.teamA?.teamName || sideAName} avatar`}
                        className={styles.teamAvatar}
                      />
                    )}
                    <p className={styles.meta}>
                      {getEntityHref(grandFinalMatch.teamA) ? (
                        <Link className={styles.entityLink} to={getEntityHref(grandFinalMatch.teamA)}>
                          {grandFinalMatch.teamA?.teamName || td?.bracket?.tbd || "TBD"}
                        </Link>
                      ) : (grandFinalMatch.teamA?.teamName || td?.bracket?.tbd || "TBD")} ({grandFinalMatch.teamA?.avgElo ?? 0})
                    </p>
                  </div>
                  <span className={`${styles.matchScore} ${getTeamScoreClass(grandFinalMatch, "A")}`}>
                    {getMatchScoreText(grandFinalMatch, "A")}
                  </span>
                </div>
                <div className={styles.matchTeamRow} ref={grandBottomRowRef}>
                  <div className={styles.matchTeamInfo}>
                    {hasTeamIdentity(grandFinalMatch.teamB) && (
                      <img
                        src={grandFinalMatch.teamB?.avatarUrl || "/nologoteam.png"}
                        alt={`${grandFinalMatch.teamB?.teamName || sideBName} avatar`}
                        className={styles.teamAvatar}
                      />
                    )}
                    <p className={styles.meta}>
                      {getEntityHref(grandFinalMatch.teamB) ? (
                        <Link className={styles.entityLink} to={getEntityHref(grandFinalMatch.teamB)}>
                          {grandFinalMatch.teamB?.teamName || td?.bracket?.tbd || "TBD"}
                        </Link>
                      ) : (grandFinalMatch.teamB?.teamName || td?.bracket?.tbd || "TBD")} ({grandFinalMatch.teamB?.avgElo ?? 0})
                    </p>
                  </div>
                  <span className={`${styles.matchScore} ${getTeamScoreClass(grandFinalMatch, "B")}`}>
                    {getMatchScoreText(grandFinalMatch, "B")}
                  </span>
                </div>
                {isAdmin && (
                  <div className={styles.matchEditFloating}>
                    <button
                      type="button"
                      className={styles.matchEditBtn}
                      aria-label={td?.modal?.editScore || "Edit match score"}
                      title={td?.modal?.editScore || "Edit match score"}
                      disabled={!grandFinalMatch.id || !grandFinalMatch.teamA?.teamId || !grandFinalMatch.teamB?.teamId}
                      onClick={() => onOpenScoreModal(grandFinalMatch)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42L18.21 3.29a1.003 1.003 0 0 0-1.42 0L14.96 5.12l3.75 3.75 1.99-1.66z" />
                      </svg>
                    </button>
                  </div>
                )}
                {tournamentId && grandFinalMatch?.id ? (
                  <div className={styles.matchCompactFooter}>
                    <span className={styles.bestOfChip}>{getBestOfLabel(grandFinalMatch)}</span>
                    <Link
                      className={styles.detailsLink}
                      to={toMatchHref(grandFinalMatch.id)}
                    >
                      {td?.match?.open || "Open match"}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : treeRounds.length ? (
        renderTree(treeRounds, "single-tree")
      ) : !visibleBuckets.length ? (
        <p className={styles.hint}>{td?.bracket?.noMatchesForStage || "No matches for selected stage yet"}</p>
      ) : (
        <div className={styles.rounds}>
          {visibleBuckets.map(([bucket, matches]) => (
            <div key={`bucket-${bucket}`} className={styles.roundCol}>
              <h3 className={styles.invitesTitle}>
                {(td?.bracket?.round || "Round {n}").replace(
                  "{n}",
                  Number(String(bucket).match(/:r(\d+)/)?.[1] || 1)
                )}
              </h3>
              {matches.map((m) => (
                <div key={m.id} className={styles.matchCard}>
                  <div className={styles.matchTeamRow}>
                    <div className={styles.matchTeamInfo}>
                      {hasTeamIdentity(m.teamA) && (
                        <img
                          src={m.teamA?.avatarUrl || "/nologoteam.png"}
                          alt={`${m.teamA?.teamName || sideAName} avatar`}
                          className={styles.teamAvatar}
                        />
                      )}
                      <p className={styles.meta}>
                        {getEntityHref(m.teamA) ? (
                          <Link className={styles.entityLink} to={getEntityHref(m.teamA)}>
                            {m.teamA?.teamName || td?.bracket?.tbd || "TBD"}
                          </Link>
                        ) : (m.teamA?.teamName || td?.bracket?.tbd || "TBD")}
                      </p>
                    </div>
                    <span className={`${styles.matchScore} ${getTeamScoreClass(m, "A")}`}>
                      {getMatchScoreText(m, "A")}
                    </span>
                  </div>
                  <div className={styles.matchTeamRow}>
                    <div className={styles.matchTeamInfo}>
                      {hasTeamIdentity(m.teamB) && (
                        <img
                          src={m.teamB?.avatarUrl || "/nologoteam.png"}
                          alt={`${m.teamB?.teamName || sideBName} avatar`}
                          className={styles.teamAvatar}
                        />
                      )}
                      <p className={styles.meta}>
                        {getEntityHref(m.teamB) ? (
                          <Link className={styles.entityLink} to={getEntityHref(m.teamB)}>
                            {m.teamB?.teamName || td?.bracket?.tbd || "TBD"}
                          </Link>
                        ) : (m.teamB?.teamName || td?.bracket?.tbd || "TBD")}
                      </p>
                    </div>
                    <div className={styles.matchScoreActions}>
                      <span className={`${styles.matchScore} ${getTeamScoreClass(m, "B")}`}>
                        {getMatchScoreText(m, "B")}
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className={styles.matchEditFloating}>
                      <button
                        type="button"
                        className={styles.matchEditBtn}
                        aria-label={td?.modal?.editScore || "Edit match score"}
                        title={td?.modal?.editScore || "Edit match score"}
                        disabled={!m.teamA?.teamId || !m.teamB?.teamId || savingResultId === m.id}
                        onClick={() => onOpenScoreModal(m)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42L18.21 3.29a1.003 1.003 0 0 0-1.42 0L14.96 5.12l3.75 3.75 1.99-1.66z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {tournamentId ? (
                    <div className={styles.matchCompactFooter}>
                      <span className={styles.bestOfChip}>{getBestOfLabel(m)}</span>
                      <Link className={styles.detailsLink} to={toMatchHref(m.id)}>
                        {td?.match?.open || "Open match"}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

