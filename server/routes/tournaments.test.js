import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTournamentRoutes } from "./tournaments.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTournamentRoutes(app, deps);
  return app;
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getCollectionDocs(store, collectionPath) {
  const prefix = `${collectionPath}/`;
  return [...store.entries()]
    .filter(([path]) => {
      if (!path.startsWith(prefix)) return false;
      const rest = path.slice(prefix.length);
      return rest.length > 0 && !rest.includes("/");
    })
    .map(([path, data]) => ({
      id: path.slice(prefix.length),
      data: deepClone(data),
    }));
}

class FakeDocRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this.id = path.split("/").pop();
  }

  collection(name) {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }
}

class FakeQueryRef {
  constructor(store, collectionPath, filters = [], queryLimit = null) {
    this.store = store;
    this.collectionPath = collectionPath;
    this.filters = filters;
    this.queryLimit = queryLimit;
  }

  where(field, op, value) {
    return new FakeQueryRef(this.store, this.collectionPath, [
      ...this.filters,
      { field, op, value },
    ]);
  }

  limit(queryLimit) {
    return new FakeQueryRef(this.store, this.collectionPath, this.filters, queryLimit);
  }

  async get() {
    let docs = getCollectionDocs(this.store, this.collectionPath).map((row) => ({
      id: row.id,
      data: () => deepClone(row.data),
    }));
    for (const f of this.filters) {
      if (f.op !== "==") continue;
      docs = docs.filter((doc) => {
        const data = doc.data() || {};
        return data[f.field] === f.value;
      });
    }
    if (Number.isFinite(this.queryLimit)) {
      docs = docs.slice(0, this.queryLimit);
    }
    return { docs };
  }
}

class FakeCollectionRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this.store, `${this.path}/${id}`);
  }

  where(field, op, value) {
    return new FakeQueryRef(this.store, this.path, [{ field, op, value }]);
  }

  orderBy() {
    return this;
  }

  limit(queryLimit) {
    return new FakeQueryRef(this.store, this.path, [], queryLimit);
  }

  async get() {
    const docs = getCollectionDocs(this.store, this.path).map((row) => ({
      id: row.id,
      data: () => deepClone(row.data),
    }));
    return { docs };
  }
}

class FakeTransaction {
  constructor(store) {
    this.store = store;
  }

  async get(ref) {
    if (ref instanceof FakeDocRef) {
      const data = this.store.get(ref.path);
      return {
        exists: data !== undefined,
        id: ref.id,
        data: () => deepClone(data),
      };
    }
    if (ref instanceof FakeQueryRef) {
      return ref.get();
    }
    throw new Error("Unsupported reference in tx.get");
  }

  set(ref, value, options = {}) {
    const prev = this.store.get(ref.path);
    if (options?.merge && prev && typeof prev === "object") {
      this.store.set(ref.path, { ...deepClone(prev), ...deepClone(value) });
      return;
    }
    this.store.set(ref.path, deepClone(value));
  }

  update(ref, value) {
    const prev = this.store.get(ref.path) || {};
    this.store.set(ref.path, { ...deepClone(prev), ...deepClone(value) });
  }
}

function createFirestoreDb(seed = {}) {
  const store = new Map(Object.entries(deepClone(seed)));
  const db = {
    _store: store,
    collection(name) {
      return new FakeCollectionRef(store, name);
    },
    async runTransaction(cb) {
      const tx = new FakeTransaction(store);
      return cb(tx);
    },
  };
  return db;
}

describe("tournament routes", () => {
  it("returns 400 for invalid tournaments limit", async () => {
    const app = createApp({
      admin: {},
      db: {
        collection: () => ({
          orderBy: () => ({
            limit: () => ({
              get: async () => ({ docs: [] }),
            }),
          }),
        }),
      },
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      parseIntParam: () => null,
      isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
    });

    const res = await request(app).get("/tournaments?status=upcoming&limit=oops");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid limit");
  });

  it("returns upcoming tournaments list", async () => {
    const app = createApp({
      admin: {},
      db: {
        collection: () => ({
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                docs: [
                  {
                    id: "t1",
                    data: () => ({
                      title: "Cup A",
                      startsAt: Date.now() + 10_000,
                      endsAt: Date.now() + 20_000,
                      maxTeams: 16,
                      registeredTeams: 2,
                      requirements: { minElo: 1000, minMatches: 20 },
                    }),
                  },
                ],
              }),
            }),
          }),
        }),
      },
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
    });

    const res = await request(app).get("/tournaments?status=upcoming");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].title).toBe("Cup A");
  });

  it("forbids create tournament for non-admin", async () => {
    const app = createApp({
      admin: {},
      db: {},
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "u1", admin: false };
        next();
      },
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
    });

    const res = await request(app).post("/tournaments").send({
      title: "Cup B",
      startsAt: Date.now() + 1_000_000,
      endsAt: Date.now() + 2_000_000,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("stops playoff progression at final and sets champion for group_playoff", async () => {
    const db = createFirestoreDb({
      "tournaments/t1": {
        id: "t1",
        title: "Playoff Cup",
        bracketType: "group_playoff",
      },
      "tournaments/t1/matches/p2_m1": {
        id: "p2_m1",
        stage: "playoff",
        round: 2,
        status: "pending",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
      },
      // Empty placeholder in the same round must not force next round creation.
      "tournaments/t1/matches/p2_m2": {
        id: "p2_m2",
        stage: "playoff",
        round: 2,
        status: "waiting",
        teamA: null,
        teamB: null,
      },
    });

    const app = createApp({
      admin: { firestore: { FieldValue: { serverTimestamp: () => 123456 } } },
      db,
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "admin-1", admin: true };
        next();
      },
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
    });

    const res = await request(app).post("/tournaments/t1/matches/p2_m1/result").send({
      winnerTeamId: "team-a",
      teamAScore: 2,
      teamBScore: 0,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, nextMatchId: null });
    expect(db._store.get("tournaments/t1/matches/p3_m1")).toBeUndefined();
    expect(db._store.get("tournaments/t1").champion).toEqual({
      teamId: "team-a",
      teamName: "A",
    });
  });

  it("returns 503 in production when tournaments query path fails", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const app = createApp({
        admin: {},
        db: {
          collection: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  get: async () => {
                    throw new Error("index-missing");
                  },
                }),
              }),
            }),
            orderBy: () => ({
              limit: () => ({
                get: async () => {
                  throw new Error("index-missing");
                },
              }),
            }),
            limit: () => ({
              get: async () => {
                throw new Error("index-missing");
              },
            }),
          }),
        },
        logger: { warn: vi.fn(), error: vi.fn() },
        statsLimiter: (_req, _res, next) => next(),
        authLimiter: (_req, _res, next) => next(),
        requireAuth: (_req, _res, next) => next(),
        parseIntParam: (v, fallback) => {
          if (v === undefined) return fallback;
          const n = Number.parseInt(v, 10);
          return Number.isFinite(n) ? n : null;
        },
        isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
      });

      const res = await request(app).get("/tournaments?status=upcoming&limit=20");
      expect(res.status).toBe(503);
      expect(String(res.body.error || "")).toContain("temporarily unavailable");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });
});
