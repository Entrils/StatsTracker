const ALLOWED_TEAM_FORMATS = new Set(["1x1", "2x2", "3x3", "5x5"]);
const TEAM_ROSTER_FORMATS = new Set(["2x2", "3x3", "5x5"]);
const ALLOWED_BRACKET_TYPES = new Set([
  "single_elimination",
  "double_elimination",
  "group_playoff",
]);
const ALLOWED_MAX_TEAMS = new Set([4, 8, 16, 32, 64]);
const MAX_TEAM_AVATAR_URL_LENGTH = 1_500_000;
const DEFAULT_MAP_POOL = [
  "Yggdrasil",
  "Naos",
  "Dongtian",
  "Blackmarket",
  "Akhet",
  "Outpost",
  "Tundra",
  "Itzamna",
  "Caesarea",
  "Tulix",
];
const VETO_READY_DELAY_MS = 30 * 1000;
const VETO_TURN_MS = 30 * 1000;
const FRAGPUNK_ID_REGEX = /^[A-Za-z0-9._-]{3,24}#[A-Za-z0-9]{2,8}$/;

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toMillis(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value?.seconds)) {
    return Number(value.seconds) * 1000 + Number(value?.nanoseconds || 0) / 1_000_000;
  }
  if (Number.isFinite(value?._seconds)) {
    return Number(value._seconds) * 1000 + Number(value?._nanoseconds || 0) / 1_000_000;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  return fallback;
}

function toAnyMillis(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const fromNumber = Number(value);
  if (Number.isFinite(fromNumber)) return fromNumber;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value?._seconds)) {
    return Number(value._seconds) * 1000 + Number(value?._nanoseconds || 0) / 1_000_000;
  }
  return fallback;
}

function isAdminUser(user) {
  return user?.admin === true || user?.role === "admin";
}

function teamSizeByFormat(format) {
  const left = String(format || "5x5").split("x")[0];
  const n = toInt(left, 5);
  return Math.min(Math.max(n, 1), 5);
}

function normalizeTeamFormat(format, fallback = "5x5") {
  const raw = String(format || "").trim().toLowerCase();
  if (TEAM_ROSTER_FORMATS.has(raw)) return raw;
  return TEAM_ROSTER_FORMATS.has(String(fallback || "").toLowerCase()) ? String(fallback || "").toLowerCase() : "5x5";
}

function inferTeamFormatFromMaxMembers(maxMembers, fallback = "5x5") {
  const n = toInt(maxMembers, 0);
  if (n === 2) return "2x2"; // legacy exact roster size
  if (n === 3) return "3x3"; // legacy exact roster size
  if (n === 4) return "3x3"; // 3x3 + 1 reserve
  if (n === 5) return "5x5"; // legacy exact roster size
  if (n >= 6) return "5x5"; // 5x5 + 1 reserve
  return normalizeTeamFormat(fallback, "5x5");
}

function getTeamFormatForTeamDoc(team = {}) {
  const explicit = String(team?.teamFormat || "").trim().toLowerCase();
  if (TEAM_ROSTER_FORMATS.has(explicit)) return explicit;
  return inferTeamFormatFromMaxMembers(team?.maxMembers, "5x5");
}

function getTeamMaxMembersForFormat(teamFormat = "5x5") {
  return teamSizeByFormat(teamFormat) + 1;
}

function getTeamRosterConfig(team = {}) {
  const teamFormat = getTeamFormatForTeamDoc(team);
  const maxMembers = getTeamMaxMembersForFormat(teamFormat);
  return {
    teamFormat,
    maxMembers,
    starterCount: teamSizeByFormat(teamFormat),
  };
}

function normalizeUidList(input = []) {
  const out = [];
  for (const v of input) {
    const uid = String(v || "").trim();
    if (!uid || out.includes(uid)) continue;
    out.push(uid);
  }
  return out;
}

function normalizeTeamCountry(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function normalizeFragpunkId(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return FRAGPUNK_ID_REGEX.test(clean) ? clean : "";
}

function getProfileFragpunkId(profile = {}) {
  const fromSettings = normalizeFragpunkId(profile?.settings?.fragpunkId);
  if (fromSettings) return fromSettings;
  return "";
}

function normalizeMapPool(input = []) {
  const source = Array.isArray(input) ? input : [];
  const out = [];
  source.forEach((name) => {
    const clean = String(name || "").trim();
    if (!clean || out.includes(clean)) return;
    out.push(clean);
  });
  return out;
}

function resolveProfileAvatarUrl(profile = {}, uid = "") {
  const direct =
    profile.avatarUrl ||
    profile.photoURL ||
    profile.photoUrl ||
    profile.imageUrl ||
    profile.picture ||
    "";
  if (direct) return String(direct);

  const provider = String(profile.provider || "");
  const avatar = String(profile.avatar || "");
  if (provider === "discord" && uid.startsWith("discord:")) {
    const discordId = uid.replace("discord:", "");
    if (avatar) {
      return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=512`;
    }
    if (discordId) {
      const fallbackIndex = Number.parseInt(discordId, 10) % 5;
      return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
    }
  }
  return "";
}

function getTournamentStatus(data, now = Date.now()) {
  const startsAt = toMillis(data?.startsAt, 0);
  const endsAt = toMillis(data?.endsAt, 0);
  const champion = data?.champion || null;
  if (champion) return "past";
  if (endsAt && now >= endsAt) return "past";
  if (startsAt && now < startsAt) return "upcoming";
  if (startsAt && now >= startsAt) return "ongoing";
  return "upcoming";
}

async function findActiveTeamTournamentRegistration({
  db,
  teamId = "",
  team = null,
  tx = null,
  now = Date.now(),
} = {}) {
  const safeTeamId = String(teamId || "").trim();
  if (!db || !safeTeamId) return null;

  const tournamentIdsSet = new Set(
    Array.isArray(team?.activeTournamentIds)
      ? team.activeTournamentIds.map((v) => String(v || "").trim()).filter(Boolean)
      : []
  );

  if (!tournamentIdsSet.size && typeof db.collectionGroup === "function") {
    const extractTournamentIdFromRegistrationDoc = (doc) => {
      const directParentId = String(doc?.ref?.parent?.parent?.id || "").trim();
      if (directParentId) return directParentId;

      const rawPath = String(doc?.ref?.path || "");
      if (rawPath) {
        const parts = rawPath.split("/").filter(Boolean);
        const regIdx = parts.lastIndexOf("registrations");
        if (regIdx > 0) {
          const fromPath = String(parts[regIdx - 1] || "").trim();
          if (fromPath) return fromPath;
        }
      }

      const data = typeof doc?.data === "function" ? doc.data() || {} : {};
      return String(data.tournamentId || "").trim();
    };

    const baseRegsQuery = db.collectionGroup("registrations").where("teamId", "==", safeTeamId);
    const canPaginateRegs = typeof baseRegsQuery.orderBy === "function";

    if (canPaginateRegs) {
      let lastDoc = null;
      while (true) {
        let regsQuery = baseRegsQuery
          // Use document name directly to avoid requiring admin.FieldPath in helper scope.
          .orderBy("__name__")
          .limit(200);
        if (lastDoc && typeof regsQuery.startAfter === "function") {
          regsQuery = regsQuery.startAfter(lastDoc);
        }
        const regsSnap = tx ? await tx.get(regsQuery) : await regsQuery.get();
        const docs = Array.isArray(regsSnap?.docs) ? regsSnap.docs : [];
        if (!docs.length) break;
        docs.forEach((doc) => {
          const tournamentId = extractTournamentIdFromRegistrationDoc(doc);
          if (tournamentId) tournamentIdsSet.add(tournamentId);
        });
        if (docs.length < 200) break;
        lastDoc = docs[docs.length - 1];
      }
    } else {
      const regsSnap = tx ? await tx.get(baseRegsQuery) : await baseRegsQuery.get();
      const docs = Array.isArray(regsSnap?.docs) ? regsSnap.docs : [];
      docs.forEach((doc) => {
        const tournamentId = extractTournamentIdFromRegistrationDoc(doc);
        if (tournamentId) tournamentIdsSet.add(tournamentId);
      });
    }
  }

  const tournamentIds = [...tournamentIdsSet];
  if (!tournamentIds.length) return null;
  for (let i = 0; i < tournamentIds.length; i += 100) {
    const chunkIds = tournamentIds.slice(i, i + 100);
    const refs = chunkIds.map((id) => db.collection("tournaments").doc(id));
    const snaps = tx
      ? await Promise.all(refs.map((ref) => tx.get(ref)))
      : typeof db.getAll === "function"
        ? await db.getAll(...refs)
        : await Promise.all(refs.map((ref) => ref.get()));

    for (let j = 0; j < snaps.length; j += 1) {
      const snap = snaps[j];
      if (!snap?.exists) continue;
      const data = snap.data() || {};
      const status = getTournamentStatus(data, now);
      if (status === "upcoming" || status === "ongoing") {
        return {
          id: snap.id,
          title: String(data.title || "Tournament"),
          status,
        };
      }
    }
  }

  return null;
}

function serializeTournament(doc, now = Date.now()) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || "Untitled tournament",
    description: data.description || "",
    rules: data.rules || "",
    prizePool: data.prizePool || "",
    teamFormat: data.teamFormat || "5x5",
    bracketType: data.bracketType || "single_elimination",
    maxTeams: toInt(data.maxTeams, 0),
    registeredTeams: toInt(data.registeredTeams, 0),
    requirements: {
      minElo: toInt(data?.requirements?.minElo, 0),
      minMatches: toInt(data?.requirements?.minMatches, 0),
    },
    startsAt: toMillis(data.startsAt, 0),
    endsAt: toMillis(data.endsAt, null),
    status: getTournamentStatus(data, now),
    bracketGeneratedAt: toMillis(data.bracketGeneratedAt, null),
    bracketGeneratedBy: data.bracketGeneratedBy || null,
    logoUrl: data.logoUrl || "",
    champion: data.champion || null,
    createdBy: data.createdBy || null,
  };
}

function serializeTeam(doc, uid) {
  const data = doc.data() || {};
  const roster = getTeamRosterConfig(data);
  const memberUids = normalizeUidList(data.memberUids || []);
  return {
    id: doc.id,
    name: data.name || "Unnamed team",
    teamFormat: roster.teamFormat,
    captainUid: data.captainUid || "",
    reserveUid: String(data.reserveUid || ""),
    memberUids,
    memberCount: memberUids.length,
    maxMembers: roster.maxMembers,
    avatarUrl: data.avatarUrl || "",
    country: normalizeTeamCountry(data.country),
    isCaptain: uid ? data.captainUid === uid : false,
  };
}

function parseRoundAndIndex(matchId, fallbackRound = 1) {
  const m = /^(?:[a-z]+_?)?r?(\d+)_m(\d+)$/i.exec(String(matchId || ""));
  if (m) {
    return {
      round: toInt(m[1], fallbackRound),
      index: toInt(m[2], 1),
    };
  }
  return {
    round: toInt(fallbackRound, 1),
    index: 1,
  };
}

function normalizeTeamFromRegistration(row) {
  const captainUid = String(row?.captainUid || "");
  const memberUids = normalizeUidList(row?.memberUids || []);
  const snapshotByUid = new Map(
    (Array.isArray(row?.membersSnapshot) ? row.membersSnapshot : [])
      .map((m) => {
        const uid = String(m?.uid || "").trim();
        if (!uid) return null;
        return [
          uid,
          {
            uid,
            name: String(m?.name || uid),
            avatarUrl: String(m?.avatarUrl || ""),
            elo: toInt(m?.elo, 500),
            fragpunkId: String(m?.fragpunkId || ""),
          },
        ];
      })
      .filter(Boolean)
  );
  const members = memberUids.map((uid) => {
    const snapped = snapshotByUid.get(uid);
    if (snapped) {
      return {
        ...snapped,
        role: uid === captainUid ? "captain" : "player",
      };
    }
    return {
      uid,
      name: uid,
      avatarUrl: "",
      elo: 500,
      fragpunkId: "",
      role: uid === captainUid ? "captain" : "player",
    };
  });
  return {
    registrationId: row.id || row.registrationId || row.teamId || "",
    teamId: row.teamId || row.id || "",
    teamName: row.teamName || "Team",
    avatarUrl: row.avatarUrl || "",
    avgElo: toInt(row.avgEloSnapshot, 0),
    captainUid,
    memberUids,
    members,
  };
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function buildEliminationTreeMatches(registrations, stage = "single", prefix = "r") {
  const seeded = [...registrations].sort(
    (a, b) => toInt(b.avgEloSnapshot, 0) - toInt(a.avgEloSnapshot, 0)
  );
  const size = nextPowerOfTwo(Math.max(2, seeded.length));
  const slots = Array.from({ length: size }, () => null);
  for (let i = 0; i < seeded.length; i += 1) {
    slots[i] = normalizeTeamFromRegistration(seeded[i]);
  }

  const matches = [];
  let currentRoundTeams = [];
  for (let i = 0; i < size / 2; i += 1) {
    const teamA = slots[i];
    const teamB = slots[size - 1 - i];
    const hasA = Boolean(teamA?.teamId);
    const hasB = Boolean(teamB?.teamId);
    const winner = hasA && !hasB ? teamA : !hasA && hasB ? teamB : null;
    const status = hasA && hasB ? "pending" : winner ? "completed" : "waiting";
    const id = `${prefix}1_m${i + 1}`;
    if (hasA || hasB) {
      matches.push({
        id,
        round: 1,
        stage,
        status,
        teamA: teamA || null,
        teamB: teamB || null,
        winnerTeamId: winner?.teamId || null,
        winner: winner || null,
        loser: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    currentRoundTeams.push(winner || null);
  }

  let round = 2;
  while (currentRoundTeams.length > 1) {
    const nextRoundTeams = [];
    const matchCount = Math.ceil(currentRoundTeams.length / 2);
    for (let i = 0; i < matchCount; i += 1) {
      const teamA = currentRoundTeams[i * 2] || null;
      const teamB = currentRoundTeams[i * 2 + 1] || null;
      const hasA = Boolean(teamA?.teamId);
      const hasB = Boolean(teamB?.teamId);
      const winner = hasA && !hasB ? teamA : !hasA && hasB ? teamB : null;
      const status = hasA && hasB ? "pending" : winner ? "completed" : "waiting";
      const id = `${prefix}${round}_m${i + 1}`;
      if (hasA || hasB) {
        matches.push({
          id,
          round,
          stage,
          status,
          teamA: teamA || null,
          teamB: teamB || null,
          winnerTeamId: winner?.teamId || null,
          winner: winner || null,
          loser: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      nextRoundTeams.push(winner || null);
    }
    currentRoundTeams = nextRoundTeams;
    round += 1;
  }

  return matches;
}

function buildGroups(registrations) {
  const seeded = [...registrations].sort(
    (a, b) => toInt(b.avgEloSnapshot, 0) - toInt(a.avgEloSnapshot, 0)
  );
  // For 2-3 participants keep a single group to avoid singleton groups.
  const groupCount =
    seeded.length < 4 ? 1 : Math.max(2, Math.ceil(seeded.length / 4));
  const groups = Array.from({ length: groupCount }, () => []);
  for (let i = 0; i < seeded.length; i += 1) {
    const band = Math.floor(i / groupCount);
    const offset = i % groupCount;
    const idx = band % 2 === 0 ? offset : groupCount - 1 - offset;
    groups[idx].push(seeded[i]);
  }
  return groups
    .map((items, idx) => ({ key: String.fromCharCode(65 + idx), items }))
    .filter((g) => g.items.length > 0);
}

function rankGroup(groupMatches, registrationsByTeamId) {
  const stats = new Map();
  const ensure = (teamId) => {
    if (!stats.has(teamId)) {
      stats.set(teamId, {
        teamId,
        wins: 0,
        losses: 0,
        avgElo: toInt(registrationsByTeamId.get(teamId)?.avgEloSnapshot, 0),
      });
    }
    return stats.get(teamId);
  };

  groupMatches.forEach((m) => {
    const a = m.teamA?.teamId;
    const b = m.teamB?.teamId;
    if (!a || !b) return;
    ensure(a);
    ensure(b);
    if (m.status !== "completed" || !m.winnerTeamId) return;
    const winner = m.winnerTeamId;
    const loser = winner === a ? b : a;
    ensure(winner).wins += 1;
    ensure(loser).losses += 1;
  });

  return [...stats.values()].sort((x, y) => y.wins - x.wins || y.avgElo - x.avgElo);
}

function advanceTreeMatch(tx, matchesRef, currentMatchId, winner, fallbackRound = 1, prefix = "r") {
  const { round, index } = parseRoundAndIndex(currentMatchId, fallbackRound);
  const stage =
    prefix === "r"
      ? "single"
      : prefix === "u"
      ? "upper"
      : prefix === "l"
      ? "lower"
      : "playoff";
  const sameRoundQuery = matchesRef.where("stage", "==", stage).where("round", "==", round).limit(50);
  return tx.get(sameRoundQuery).then((sameRoundSnap) => {
    const activeInRound = sameRoundSnap.docs.filter((doc) => {
      const d = doc.data() || {};
      return Boolean(d.teamA?.teamId) || Boolean(d.teamB?.teamId);
    });
    // Current match is final for this bracket stage.
    if (activeInRound.length <= 1) return null;

  const nextRound = round + 1;
  const nextIndex = Math.ceil(index / 2);
  const nextMatchId = `${prefix}${nextRound}_m${nextIndex}`;
  const slot = index % 2 === 1 ? "teamA" : "teamB";
  const nextMatchRef = matchesRef.doc(nextMatchId);
  return tx.get(nextMatchRef).then((nextMatchSnap) => {
    if (!nextMatchSnap.exists) {
      tx.set(nextMatchRef, {
        round: nextRound,
        status: "waiting",
        stage,
        [slot]: winner,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      const nextMatch = nextMatchSnap.data() || {};
      const merged = {
        teamA: slot === "teamA" ? winner : nextMatch.teamA || null,
        teamB: slot === "teamB" ? winner : nextMatch.teamB || null,
      };
      tx.set(
        nextMatchRef,
        {
          ...merged,
          status: merged.teamA && merged.teamB ? "pending" : "waiting",
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
    return nextMatchId;
  });
  });
}

function getVetoScript(bestOf = 1) {
  if (toInt(bestOf, 1) === 3) {
    return ["ban", "ban", "ban", "ban", "pick", "pick", "ban", "ban", "ban", "decider"];
  }
  if (toInt(bestOf, 1) === 5) {
    return ["ban", "ban", "pick", "pick", "ban", "ban", "pick", "pick", "ban", "decider"];
  }
  return [];
}

function buildSeriesMaps(bestOf = 1, picks = [], decider = "") {
  if (toInt(bestOf, 1) === 1) return decider ? [decider] : [];
  const out = [];
  normalizeMapPool(picks).forEach((name) => out.push(name));
  if (decider && !out.includes(decider)) out.push(decider);
  return out;
}

function initVetoState(match = {}, mapPool = DEFAULT_MAP_POOL, now = Date.now()) {
  const teamAId = String(match?.teamA?.teamId || "");
  const teamBId = String(match?.teamB?.teamId || "");
  const bestOf = [1, 3, 5].includes(toInt(match?.bestOf, 1)) ? toInt(match.bestOf, 1) : 1;
  const script = getVetoScript(bestOf);
  const existing = match?.veto || {};
  const ready = match?.readyCheck || {};
  const vetoOpensAt = toInt(ready.vetoOpensAt, toInt(existing.openedAt, now));

  const availableMaps = normalizeMapPool(existing.availableMaps || mapPool);
  const history = Array.isArray(existing.bans) ? [...existing.bans] : [];
  const picks = normalizeMapPool(existing.picks || []);
  const decider = String(existing.decider || existing.pick || "");
  const rawStep = toInt(existing.stepIndex, history.length);
  const stepIndex = Math.max(0, Math.min(rawStep, script.length || rawStep));
  const nextActionFromScript = script.length ? script[stepIndex] || "done" : "";
  const nextAction = String(
    existing.nextAction ||
      nextActionFromScript ||
      (availableMaps.length > 1 ? "ban" : "decider")
  );
  const done = nextAction === "done" || Boolean(decider && (bestOf === 1 || script.length > 0));

  return {
    bestOf,
    script,
    teamAId,
    teamBId,
    availableMaps,
    history,
    picks,
    decider,
    stepIndex,
    nextAction,
    nextTeamId: String(existing.nextTeamId || teamAId),
    openedAt: toInt(existing.openedAt, vetoOpensAt),
    turnStartedAt: toInt(existing.turnStartedAt, toInt(existing.updatedAt, vetoOpensAt)),
    done,
    status: done ? "done" : "in_progress",
    updatedAt: toInt(existing.updatedAt, now),
  };
}

function serializeVetoState(state) {
  const seriesMaps = buildSeriesMaps(state.bestOf, state.picks, state.decider);
  const finalPick = state.done
    ? (state.decider || (state.bestOf === 1 ? seriesMaps[0] || "" : ""))
    : "";
  return {
    mode: `bo${state.bestOf}`,
    bestOf: state.bestOf,
    status: state.done ? "done" : "in_progress",
    availableMaps: state.availableMaps,
    bans: state.history,
    picks: state.picks,
    decider: state.decider || "",
    seriesMaps,
    pick: finalPick,
    nextTeamId: state.done ? "" : state.nextTeamId,
    nextAction: state.done ? "done" : state.nextAction,
    stepIndex: state.stepIndex,
    openedAt: state.openedAt,
    turnStartedAt: state.done ? null : state.turnStartedAt,
    updatedAt: state.updatedAt,
    teamAId: state.teamAId,
    teamBId: state.teamBId,
  };
}

function finalizeDeciderIfNeeded(state, at, uid = "system:decider") {
  let changed = false;
  if (state.done) return changed;

  if (state.script.length > 0) {
    while (state.nextAction === "decider") {
      if (state.availableMaps.length !== 1) break;
      const map = state.availableMaps[0];
      state.decider = map;
      state.history.push({
        idx: state.history.length + 1,
        action: "decider",
        map,
        teamId: state.nextTeamId || "",
        uid,
        auto: true,
        at,
      });
      state.stepIndex += 1;
      state.nextAction = state.script[state.stepIndex] || "done";
      changed = true;
      if (state.nextAction === "done") {
        state.done = true;
        state.status = "done";
        state.nextTeamId = "";
        state.turnStartedAt = null;
      }
    }
    return changed;
  }

  if (state.availableMaps.length === 1 && !state.decider) {
    const map = state.availableMaps[0];
    state.decider = map;
    state.history.push({
      idx: state.history.length + 1,
      action: "decider",
      map,
      teamId: state.nextTeamId || "",
      uid,
      auto: true,
      at,
    });
    state.done = true;
    state.status = "done";
    state.nextAction = "done";
    state.nextTeamId = "";
    state.turnStartedAt = null;
    changed = true;
  }
  return changed;
}

function applyVetoStep(state, mapName, { action, teamId, uid, at, auto = false }) {
  const nextAction = String(state.nextAction || "");
  if (!["ban", "pick"].includes(nextAction)) {
    return { ok: false, error: "Ban/pick already completed" };
  }
  if (action && action !== nextAction) {
    return { ok: false, error: `Expected action ${nextAction}` };
  }
  if (String(teamId || "") !== String(state.nextTeamId || "")) {
    return { ok: false, error: "It is not your turn" };
  }
  if (!state.availableMaps.includes(mapName)) {
    return { ok: false, error: "Map is not available for veto" };
  }

  state.history.push({
    idx: state.history.length + 1,
    action: nextAction,
    map: mapName,
    teamId: state.nextTeamId,
    uid,
    auto,
    at,
  });
  state.availableMaps = state.availableMaps.filter((m) => m !== mapName);
  if (nextAction === "pick" && !state.picks.includes(mapName)) {
    state.picks.push(mapName);
  }

  state.stepIndex += 1;
  state.nextTeamId = state.nextTeamId === state.teamAId ? state.teamBId : state.teamAId;
  state.nextAction = state.script.length > 0
    ? state.script[state.stepIndex] || "done"
    : (state.availableMaps.length > 1 ? "ban" : "decider");
  state.turnStartedAt = at;
  state.updatedAt = at;

  finalizeDeciderIfNeeded(state, at, "system:auto_decider");
  return { ok: true };
}

function advanceTimedVeto(match = {}, mapPoolInput = DEFAULT_MAP_POOL, now = Date.now()) {
  const teamAId = String(match?.teamA?.teamId || "");
  const teamBId = String(match?.teamB?.teamId || "");
  if (!teamAId || !teamBId) return { veto: match?.veto || null, changed: false };

  const ready = match?.readyCheck || {};
  const teamAReady = ready.teamAReady === true;
  const teamBReady = ready.teamBReady === true;
  const vetoOpensAt = toInt(ready.vetoOpensAt, null);
  if (!teamAReady || !teamBReady || !vetoOpensAt || now < vetoOpensAt) {
    return { veto: match?.veto || null, changed: false };
  }

  const mapPool = normalizeMapPool(mapPoolInput || DEFAULT_MAP_POOL);
  if (mapPool.length < 2) return { veto: match?.veto || null, changed: false };

  const state = initVetoState(match, mapPool, now);
  let changed = !(match?.veto && Object.keys(match.veto || {}).length > 0);

  if (!state.turnStartedAt || state.turnStartedAt < state.openedAt) {
    state.turnStartedAt = state.openedAt;
    changed = true;
  }

  changed = finalizeDeciderIfNeeded(state, now) || changed;

  while (!state.done && ["ban", "pick"].includes(state.nextAction) && now >= state.turnStartedAt + VETO_TURN_MS) {
    const timeoutAt = state.turnStartedAt + VETO_TURN_MS;
    if (!state.availableMaps.length) break;
    const idx = Math.floor(Math.random() * state.availableMaps.length);
    const mapName = state.availableMaps[idx];
    const outcome = applyVetoStep(state, mapName, {
      action: state.nextAction,
      teamId: state.nextTeamId,
      uid: "system:auto",
      at: timeoutAt,
      auto: true,
    });
    if (!outcome.ok) break;
    changed = true;
    if (!state.done && ["ban", "pick"].includes(state.nextAction)) {
      state.turnStartedAt = timeoutAt;
    }
  }

  state.updatedAt = now;
  return { veto: serializeVetoState(state), changed };
}

function applyManualVetoMove(match = {}, mapPoolInput = DEFAULT_MAP_POOL, payload = {}) {
  const mapPool = normalizeMapPool(mapPoolInput || DEFAULT_MAP_POOL);
  const now = toInt(payload?.now, Date.now());
  const mapName = String(payload?.mapName || "").trim();
  const teamId = String(payload?.teamId || "");
  const uid = String(payload?.uid || "");
  const action = String(payload?.action || "").toLowerCase();
  if (!mapName || !teamId || !uid) return { ok: false, error: "Invalid params" };

  const state = initVetoState(match, mapPool, now);
  finalizeDeciderIfNeeded(state, now);
  if (state.done) return { ok: false, error: "Ban/pick already completed" };
  if (!["ban", "pick"].includes(state.nextAction)) {
    return { ok: false, error: "Invalid veto state" };
  }
  const outcome = applyVetoStep(state, mapName, {
    action,
    teamId,
    uid,
    at: now,
    auto: false,
  });
  if (!outcome.ok) return outcome;
  return { ok: true, veto: serializeVetoState(state) };
}

export {
  ALLOWED_TEAM_FORMATS,
  TEAM_ROSTER_FORMATS,
  ALLOWED_BRACKET_TYPES,
  ALLOWED_MAX_TEAMS,
  MAX_TEAM_AVATAR_URL_LENGTH,
  DEFAULT_MAP_POOL,
  VETO_READY_DELAY_MS,
  VETO_TURN_MS,
  toInt,
  toMillis,
  toAnyMillis,
  isAdminUser,
  teamSizeByFormat,
  normalizeTeamFormat,
  inferTeamFormatFromMaxMembers,
  getTeamFormatForTeamDoc,
  getTeamMaxMembersForFormat,
  getTeamRosterConfig,
  normalizeUidList,
  normalizeTeamCountry,
  normalizeFragpunkId,
  getProfileFragpunkId,
  normalizeMapPool,
  resolveProfileAvatarUrl,
  getTournamentStatus,
  findActiveTeamTournamentRegistration,
  serializeTournament,
  serializeTeam,
  parseRoundAndIndex,
  normalizeTeamFromRegistration,
  nextPowerOfTwo,
  buildEliminationTreeMatches,
  buildGroups,
  rankGroup,
  advanceTreeMatch,
  getVetoScript,
  advanceTimedVeto,
  applyManualVetoMove,
};

