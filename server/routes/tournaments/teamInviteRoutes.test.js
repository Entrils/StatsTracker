import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTeamInviteRoutes } from "./teamInviteRoutes.js";

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
    admin: { firestore: { FieldValue: { serverTimestamp: () => 123 } } },
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
});
