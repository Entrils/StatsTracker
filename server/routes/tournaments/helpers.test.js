import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeFragpunkId,
  getTournamentStatus,
  buildGroups,
  buildEliminationTreeMatches,
  advanceTimedVeto,
  applyManualVetoMove,
  findActiveTeamTournamentRegistration,
} from "./helpers.js";

function makeRegDoc(tournamentId) {
  return {
    ref: {
      parent: {
        parent: {
          id: tournamentId,
        },
      },
    },
  };
}

function makeTournamentSnap(id, data) {
  return {
    id,
    exists: Boolean(data),
    data: () => (data ? { ...data } : {}),
  };
}

function createDbForActiveRegistration({
  registrationTournamentIds = [],
  tournamentsById = {},
  withOrderBy = true,
} = {}) {
  const docs = registrationTournamentIds.map((id) => makeRegDoc(id));
  const query = {
    __isQuery: true,
    where: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({ docs }),
  };
  if (withOrderBy) query.orderBy = () => query;

  return {
    collectionGroup: () => query,
    collection: (name) => ({
      doc: (id) => ({
        id,
        get: async () => {
          if (name !== "tournaments") return makeTournamentSnap(id, null);
          return makeTournamentSnap(id, tournamentsById[id] || null);
        },
      }),
    }),
  };
}

describe("tournament helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates fragpunk id format", () => {
    expect(normalizeFragpunkId("Nick_01#EU1")).toBe("Nick_01#EU1");
    expect(normalizeFragpunkId("bad-format")).toBe("");
    expect(normalizeFragpunkId("ab#E1")).toBe("");
  });

  it("detects past by champion regardless of dates", () => {
    const now = Date.now();
    expect(
      getTournamentStatus(
        { startsAt: now + 10_000, endsAt: now + 20_000, champion: { teamId: "t1" } },
        now
      )
    ).toBe("past");
  });

  it("buildGroups avoids singleton groups for 3 participants", () => {
    const regs = [1, 2, 3].map((n) => ({ id: `t${n}`, avgEloSnapshot: 1000 - n }));
    const groups = buildGroups(regs);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(3);
  });

  it("buildEliminationTreeMatches keeps participants with odd count (bye supported)", () => {
    const regs = [1, 2, 3, 4, 5].map((n) => ({
      id: `r${n}`,
      teamId: `t${n}`,
      teamName: `Team ${n}`,
      avgEloSnapshot: 1100 - n,
    }));
    const matches = buildEliminationTreeMatches(regs, "playoff", "p");
    const allTeamIdsInTree = new Set(
      matches.flatMap((m) => [m.teamA?.teamId, m.teamB?.teamId, m.winner?.teamId]).filter(Boolean)
    );
    regs.forEach((r) => expect(allTeamIdsInTree.has(r.teamId)).toBe(true));
  });

  it("advanceTimedVeto does not change state before veto window", () => {
    const now = Date.now();
    const match = {
      teamA: { teamId: "a" },
      teamB: { teamId: "b" },
      bestOf: 1,
      readyCheck: {
        teamAReady: true,
        teamBReady: true,
        vetoOpensAt: now + 60_000,
      },
      veto: null,
    };
    const out = advanceTimedVeto(match, ["Yggdrasil", "Naos", "Dongtian"], now);
    expect(out.changed).toBe(false);
  });

  it("advanceTimedVeto auto-progresses on timeout", () => {
    const now = Date.now();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const match = {
      teamA: { teamId: "a" },
      teamB: { teamId: "b" },
      bestOf: 1,
      readyCheck: {
        teamAReady: true,
        teamBReady: true,
        vetoOpensAt: now - 120_000,
      },
      veto: {
        nextAction: "ban",
        nextTeamId: "a",
        stepIndex: 0,
        openedAt: now - 120_000,
        turnStartedAt: now - 120_000,
        availableMaps: ["Yggdrasil", "Naos", "Dongtian"],
      },
    };
    const out = advanceTimedVeto(match, ["Yggdrasil", "Naos", "Dongtian"], now);
    expect(out.changed).toBe(true);
    expect(out.veto).toBeTruthy();
    expect(Array.isArray(out.veto.bans)).toBe(true);
    expect(out.veto.bans.length).toBeGreaterThan(0);
  });

  it("applyManualVetoMove rejects wrong turn", () => {
    const now = Date.now();
    const out = applyManualVetoMove(
      {
        teamA: { teamId: "a" },
        teamB: { teamId: "b" },
        bestOf: 1,
        readyCheck: {
          teamAReady: true,
          teamBReady: true,
          vetoOpensAt: now - 1000,
        },
        veto: {
          nextAction: "ban",
          nextTeamId: "a",
          stepIndex: 0,
          availableMaps: ["Yggdrasil", "Naos"],
        },
      },
      ["Yggdrasil", "Naos"],
      { now, mapName: "Yggdrasil", teamId: "b", uid: "u-b", action: "ban" }
    );
    expect(out.ok).toBe(false);
    expect(String(out.error || "")).toContain("turn");
  });

  it("applyManualVetoMove applies valid move", () => {
    const now = Date.now();
    const out = applyManualVetoMove(
      {
        teamA: { teamId: "a" },
        teamB: { teamId: "b" },
        bestOf: 1,
        readyCheck: {
          teamAReady: true,
          teamBReady: true,
          vetoOpensAt: now - 1000,
        },
        veto: {
          nextAction: "ban",
          nextTeamId: "a",
          stepIndex: 0,
          availableMaps: ["Yggdrasil", "Naos"],
        },
      },
      ["Yggdrasil", "Naos"],
      { now, mapName: "Yggdrasil", teamId: "a", uid: "u-a", action: "ban" }
    );
    expect(out.ok).toBe(true);
    expect(out.veto).toBeTruthy();
    expect(Array.isArray(out.veto.availableMaps)).toBe(true);
    expect(out.veto.availableMaps).not.toContain("Yggdrasil");
  });

  it("findActiveTeamTournamentRegistration returns active tournament from team.activeTournamentIds", async () => {
    const now = Date.now();
    const db = createDbForActiveRegistration({
      tournamentsById: {
        t1: { title: "Cup 1", startsAt: now + 60_000 },
      },
    });
    const active = await findActiveTeamTournamentRegistration({
      db,
      teamId: "team-1",
      team: { activeTournamentIds: ["t1"] },
      now,
    });
    expect(active).toEqual({
      id: "t1",
      title: "Cup 1",
      status: "upcoming",
    });
  });

  it("findActiveTeamTournamentRegistration returns null when only past tournaments exist", async () => {
    const now = Date.now();
    const db = createDbForActiveRegistration({
      tournamentsById: {
        t1: { title: "Past Cup", endsAt: now - 60_000 },
      },
    });
    const active = await findActiveTeamTournamentRegistration({
      db,
      teamId: "team-1",
      team: { activeTournamentIds: ["t1"] },
      now,
    });
    expect(active).toBeNull();
  });

  it("findActiveTeamTournamentRegistration scans registrations when activeTournamentIds missing", async () => {
    const now = Date.now();
    const db = createDbForActiveRegistration({
      registrationTournamentIds: ["t10", "t11"],
      tournamentsById: {
        t10: { title: "Old", endsAt: now - 1000 },
        t11: { title: "Live", startsAt: now - 1000 },
      },
      withOrderBy: true,
    });
    const active = await findActiveTeamTournamentRegistration({
      db,
      teamId: "team-9",
      team: {},
      now,
    });
    expect(active).toEqual({
      id: "t11",
      title: "Live",
      status: "ongoing",
    });
  });

  it("findActiveTeamTournamentRegistration works with tx.get(query/doc) path", async () => {
    const now = Date.now();
    const db = createDbForActiveRegistration({
      registrationTournamentIds: ["t12"],
      tournamentsById: {
        t12: { title: "Upcoming", startsAt: now + 30_000 },
      },
      withOrderBy: true,
    });
    const tx = {
      get: async (ref) => {
        if (typeof ref?.get === "function") return ref.get();
        return null;
      },
    };
    const active = await findActiveTeamTournamentRegistration({
      db,
      teamId: "team-12",
      team: {},
      tx,
      now,
    });
    expect(active?.id).toBe("t12");
    expect(active?.status).toBe("upcoming");
  });

  it("findActiveTeamTournamentRegistration degrades to null when registrations query fails", async () => {
    const db = {
      collectionGroup: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              get: async () => {
                throw new Error("missing-index");
              },
            }),
          }),
        }),
      }),
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
        }),
      }),
    };
    const logger = { warn: vi.fn() };
    const active = await findActiveTeamTournamentRegistration({
      db,
      teamId: "team-1",
      team: {},
      logger,
      now: Date.now(),
    });

    expect(active).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});
