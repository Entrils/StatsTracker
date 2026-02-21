import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTeamInviteRoutes } from "./teamInviteRoutes.js";
import { createFakeFirestore, createAdminMock } from "./testFirestore.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTeamInviteRoutes(app, deps);
  return app;
}

function makeInviteDoc({ teamId, uid, status = "pending", teamName = "Team", captainUid = "captain-1" }) {
  return {
    data: () => ({ uid, status, teamName, captainUid, teamId }),
    ref: {
      parent: {
        parent: {
          id: teamId,
        },
      },
    },
  };
}

function createCollectionGroupDb({ docs = [], throwOnStatusQuery = false } = {}) {
  return {
    collectionGroup: () => {
      const state = { filters: [] };
      const query = {
        where(field, op, value) {
          state.filters.push({ field, op, value });
          return query;
        },
        limit() {
          return query;
        },
        async get() {
          const hasStatusFilter = state.filters.some(
            (f) => f.field === "status" && f.op === "==" && f.value === "pending"
          );
          if (throwOnStatusQuery && hasStatusFilter) {
            throw new Error("missing-index");
          }
          let rows = docs;
          state.filters.forEach((f) => {
            if (f.op !== "==") return;
            rows = rows.filter((doc) => {
              const data = doc.data() || {};
              return data[f.field] === f.value;
            });
          });
          return { docs: rows };
        },
      };
      return query;
    },
  };
}

function baseDeps(overrides = {}) {
  return {
    admin: createAdminMock(),
    db: createCollectionGroupDb(),
    logger: { warn: vi.fn(), error: vi.fn() },
    authLimiter: (_req, _res, next) => next(),
    requireAuth: (req, _res, next) => {
      req.user = { uid: "u1" };
      next();
    },
    isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
    findUserTeamInFormat: vi.fn(),
    invalidateTeamsCaches: vi.fn(),
    invalidateTournamentCaches: vi.fn(),
    userTournamentContextRef: () => ({ set: () => Promise.resolve(), delete: () => Promise.resolve() }),
    ...overrides,
  };
}

describe("team invite routes", () => {
  it("invite endpoint resolves nickname to uid", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
        teamFormat: "2x2",
        maxMembers: 3,
      },
      "leaderboard_users/discord:777": {
        name: "CoolNick",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u1" };
          next();
        },
        findUserTeamInFormat: vi.fn().mockResolvedValue(null),
      })
    );

    const res = await request(app)
      .post("/teams/team1/invite")
      .send({ uid: "CoolNick" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db._store.get("teams/team1/invites/discord:777")).toBeTruthy();
    expect(db._store.get("users/discord:777/team_invites/team1")).toBeTruthy();
  });

  it("invite endpoint returns 404 for ambiguous nickname", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
        teamFormat: "2x2",
        maxMembers: 3,
      },
      "leaderboard_users/u10": {
        name: "SameNick",
      },
      "leaderboard_users/u11": {
        name: "SameNick",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u1" };
          next();
        },
      })
    );

    const res = await request(app)
      .post("/teams/team1/invite")
      .send({ uid: "SameNick" });

    expect(res.status).toBe(404);
    expect(String(res.body.error || "")).toContain("Multiple players found");
  });

  it("lists pending invites for captain by team", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "leaderboard_users/u3": {
        name: "Player Three",
      },
      "teams/team1/invites/u3": {
        uid: "u3",
        status: "pending",
        teamId: "team1",
        teamName: "Alpha",
        captainUid: "u1",
      },
      "teams/team1/invites/u4": {
        uid: "u4",
        status: "accepted",
        teamId: "team1",
        teamName: "Alpha",
        captainUid: "u1",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u1" };
          next();
        },
      })
    );

    const res = await request(app).get("/teams/team1/invites");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].uid).toBe("u3");
    expect(res.body.rows[0].name).toBe("Player Three");
  });

  it("blocks listing team invites for non-captain", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
      })
    );

    const res = await request(app).get("/teams/team1/invites");
    expect(res.status).toBe(403);
    expect(String(res.body.error || "")).toContain("Only captain can view invites");
  });

  it("cancels pending invite for captain", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "teams/team1/invites/u3": {
        uid: "u3",
        status: "pending",
        teamId: "team1",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u1" };
          next();
        },
      })
    );

    const res = await request(app).post("/teams/team1/invites/u3/cancel").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((db._store.get("teams/team1/invites/u3") || {}).status).toBe("cancelled");
  });

  it("blocks cancel invite for non-captain", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "teams/team1/invites/u3": {
        uid: "u3",
        status: "pending",
        teamId: "team1",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
      })
    );

    const res = await request(app).post("/teams/team1/invites/u3/cancel").send({});
    expect(res.status).toBe(403);
    expect(String(res.body.error || "")).toContain("Only captain can cancel invites");
  });

  it("invite endpoint works even if active-registration group lookup is unavailable", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
        teamFormat: "2x2",
        maxMembers: 3,
      },
    });
    db.collectionGroup = () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            get: async () => {
              throw new Error("missing-index");
            },
          }),
        }),
      }),
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u1" };
          next();
        },
        findUserTeamInFormat: vi.fn().mockResolvedValue(null),
      })
    );

    const res = await request(app)
      .post("/teams/team1/invite")
      .send({ uid: "u3" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const invite = db._store.get("teams/team1/invites/u3") || {};
    expect(String(invite.status || "")).toBe("pending");
  });

  it("invite endpoint blocks non-captain", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "captain-1",
        memberUids: ["captain-1", "u2"],
        teamFormat: "2x2",
        maxMembers: 3,
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
      })
    );

    const res = await request(app)
      .post("/teams/team1/invite")
      .send({ uid: "u3" });

    expect(res.status).toBe(403);
    expect(String(res.body.error || "")).toContain("Only captain can invite");
  });

  it("invite endpoint does not resolve target for non-captain (no enumeration leak)", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "captain-1",
        memberUids: ["captain-1", "u2"],
        teamFormat: "2x2",
        maxMembers: 3,
      },
    });
    const baseCollection = db.collection.bind(db);
    db.collection = (name) => {
      if (String(name) === "leaderboard_users") {
        return {
          doc: () => ({
            get: async () => {
              throw new Error("target-lookup-should-not-run");
            },
          }),
          where: () => ({
            limit: () => ({
              get: async () => {
                throw new Error("target-lookup-should-not-run");
              },
            }),
          }),
        };
      }
      return baseCollection(name);
    };

    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
      })
    );

    const res = await request(app)
      .post("/teams/team1/invite")
      .send({ uid: "u3" });

    expect(res.status).toBe(403);
    expect(String(res.body.error || "")).toContain("Only captain can invite");
  });

  it("invite endpoint accepts direct uid even without leaderboard profile", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
        teamFormat: "2x2",
        maxMembers: 3,
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u1" };
          next();
        },
        findUserTeamInFormat: vi.fn().mockResolvedValue(null),
      })
    );

    const res = await request(app)
      .post("/teams/team1/invite")
      .send({ uid: "fresh-user-uid" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db._store.get("teams/team1/invites/fresh-user-uid")).toBeTruthy();
    expect(db._store.get("users/fresh-user-uid/team_invites/team1")).toBeTruthy();
  });

  it("returns only pending invites from primary query", async () => {
    const docs = [
      makeInviteDoc({ teamId: "t1", uid: "u1", status: "pending", teamName: "Alpha" }),
      makeInviteDoc({ teamId: "t2", uid: "u1", status: "pending", teamName: "Beta" }),
      makeInviteDoc({ teamId: "t3", uid: "u1", status: "accepted", teamName: "Gamma" }),
    ];
    const app = createApp(
      baseDeps({
        db: createCollectionGroupDb({ docs, throwOnStatusQuery: false }),
      })
    );

    const res = await request(app).get("/teams/invites/my");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows.map((r) => r.teamId).sort()).toEqual(["t1", "t2"]);
  });

  it("falls back when status-filter query fails and still returns only pending", async () => {
    const docs = [
      makeInviteDoc({ teamId: "t1", uid: "u1", status: "accepted" }),
      makeInviteDoc({ teamId: "t2", uid: "u1", status: "pending" }),
      makeInviteDoc({ teamId: "t3", uid: "u1", status: "rejected" }),
      makeInviteDoc({ teamId: "t4", uid: "u1", status: "pending" }),
      makeInviteDoc({ teamId: "t5", uid: "u2", status: "pending" }),
    ];
    const app = createApp(
      baseDeps({
        db: createCollectionGroupDb({ docs, throwOnStatusQuery: true }),
      })
    );

    const res = await request(app).get("/teams/invites/my");
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r) => r.teamId).sort()).toEqual(["t2", "t4"]);
  });

  it("returns empty rows when both primary and fallback queries fail", async () => {
    const brokenDb = {
      collectionGroup: () => ({
        where: () => ({
          where: () => ({
            limit: () => ({
              get: async () => {
                throw new Error("primary-failed");
              },
            }),
          }),
          limit: () => ({
            get: async () => {
              throw new Error("fallback-failed");
            },
          }),
        }),
      }),
    };
    const app = createApp(
      baseDeps({
        db: brokenDb,
      })
    );

    const res = await request(app).get("/teams/invites/my");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rows: [] });
  });

  it("my invites matches legacy uid format for discord users", async () => {
    const db = createFakeFirestore({
      "teams/team1/invites/12345": {
        uid: "12345",
        teamId: "team1",
        teamName: "Alpha",
        captainUid: "u1",
        status: "pending",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "discord:12345" };
          next();
        },
      })
    );

    const res = await request(app).get("/teams/invites/my");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].teamId).toBe("team1");
  });

  it("my invites reads materialized user inbox when collectionGroup is unavailable", async () => {
    const db = createFakeFirestore({
      "users/discord:777/team_invites/team1": {
        uid: "discord:777",
        teamId: "team1",
        teamName: "Alpha",
        captainUid: "u1",
        status: "pending",
      },
    });
    db.collectionGroup = () => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => {
              throw new Error("collectionGroup unavailable");
            },
          }),
        }),
        limit: () => ({
          get: async () => {
            throw new Error("collectionGroup unavailable");
          },
        }),
      }),
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "discord:777" };
          next();
        },
      })
    );

    const res = await request(app).get("/teams/invites/my");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].teamId).toBe("team1");
  });

  it("returns 401 when auth user is missing", async () => {
    const app = createApp(
      baseDeps({
        requireAuth: (_req, _res, next) => next(),
      })
    );
    const res = await request(app).get("/teams/invites/my");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("accept invite adds member and marks invite as accepted", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "captain-1",
        memberUids: ["captain-1"],
        maxMembers: 3,
        teamFormat: "2x2",
      },
      "teams/team1/invites/u2": {
        uid: "u2",
        status: "pending",
        teamId: "team1",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
      })
    );

    const res = await request(app).post("/teams/team1/invites/u2/accept").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((db._store.get("teams/team1") || {}).memberUids).toContain("u2");
    expect((db._store.get("teams/team1/invites/u2") || {}).status).toBe("accepted");
  });

  it("accept invite rejects when team is already full", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "captain-1",
        memberUids: ["captain-1", "u3", "u4"],
        maxMembers: 3,
        teamFormat: "2x2",
      },
      "teams/team1/invites/u2": {
        uid: "u2",
        status: "pending",
        teamId: "team1",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
      })
    );

    const res = await request(app).post("/teams/team1/invites/u2/accept").send({});
    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Team is full");
  });

  it("accept invite rejects when user already has same-format team", async () => {
    const db = createFakeFirestore({
      "teams/team1": {
        name: "Alpha",
        captainUid: "captain-1",
        memberUids: ["captain-1"],
        maxMembers: 3,
        teamFormat: "2x2",
      },
      "teams/team1/invites/u2": {
        uid: "u2",
        status: "pending",
        teamId: "team1",
      },
    });
    const app = createApp(
      baseDeps({
        db,
        requireAuth: (req, _res, next) => {
          req.user = { uid: "u2" };
          next();
        },
        findUserTeamInFormat: vi.fn().mockResolvedValue({ id: "team-other" }),
      })
    );

    const res = await request(app).post("/teams/team1/invites/u2/accept").send({});
    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("another team of this format");
  });
});
