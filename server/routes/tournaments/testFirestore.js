function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getByPath(obj, path) {
  const parts = String(path || "").split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(target, path, value) {
  const parts = String(path || "").split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function applyPatch(prev, patch, { merge = false } = {}) {
  const base = merge && prev && typeof prev === "object" ? deepClone(prev) : {};
  const input = deepClone(patch) || {};
  Object.entries(input).forEach(([key, value]) => {
    const current = key.includes(".") ? getByPath(base, key) : base[key];
    let nextValue = value;
    if (value && typeof value === "object" && value.__op === "arrayUnion") {
      const arr = Array.isArray(current) ? [...current] : [];
      value.vals.forEach((v) => {
        if (!arr.includes(v)) arr.push(v);
      });
      nextValue = arr;
    } else if (value && typeof value === "object" && value.__op === "arrayRemove") {
      const arr = Array.isArray(current) ? [...current] : [];
      nextValue = arr.filter((v) => !value.vals.includes(v));
    }
    if (key.includes(".")) setByPath(base, key, nextValue);
    else base[key] = nextValue;
  });
  return base;
}

class FakeDocSnapshot {
  constructor(ref, rawData) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = rawData !== undefined;
    this._data = deepClone(rawData);
  }

  data() {
    return deepClone(this._data);
  }
}

class FakeQuerySnapshot {
  constructor(docs = []) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

class FakeDocumentReference {
  constructor(db, path, parent = null) {
    this._db = db;
    this.path = path;
    this.parent = parent;
    this.id = path.split("/").pop();
  }

  collection(name) {
    return new FakeCollectionReference(this._db, `${this.path}/${name}`, this);
  }

  async get() {
    return new FakeDocSnapshot(this, this._db._store.get(this.path));
  }

  async set(data, options = {}) {
    const prev = this._db._store.get(this.path);
    const next = applyPatch(prev, data, { merge: options?.merge === true });
    this._db._store.set(this.path, next);
  }

  async update(data) {
    const prev = this._db._store.get(this.path) || {};
    const next = applyPatch(prev, data, { merge: true });
    this._db._store.set(this.path, next);
  }

  async delete() {
    this._db._store.delete(this.path);
  }
}

class FakeQuery {
  constructor(db, sourceFn, options = {}) {
    this._db = db;
    this._sourceFn = sourceFn;
    this._filters = options.filters || [];
    this._order = options.order || null;
    this._limit = options.limit ?? null;
    this._startAfter = options.startAfter ?? null;
  }

  _clone(patch = {}) {
    return new FakeQuery(this._db, this._sourceFn, {
      filters: patch.filters ?? this._filters,
      order: patch.order ?? this._order,
      limit: patch.limit ?? this._limit,
      startAfter: patch.startAfter ?? this._startAfter,
    });
  }

  where(field, op, value) {
    return this._clone({
      filters: [...this._filters, { field, op, value }],
    });
  }

  orderBy(field, direction = "asc") {
    return this._clone({
      order: { field, direction: String(direction || "asc").toLowerCase() === "desc" ? "desc" : "asc" },
    });
  }

  limit(value) {
    return this._clone({ limit: Number(value) });
  }

  startAfter(docOrValue) {
    const key = typeof docOrValue === "string"
      ? docOrValue
      : docOrValue?.ref?.path || docOrValue?.path || docOrValue?.id || null;
    return this._clone({ startAfter: key });
  }

  async get() {
    let docs = this._sourceFn();

    for (const filter of this._filters) {
      docs = docs.filter((doc) => {
        const data = doc.data() || {};
        const fieldValue = getByPath(data, filter.field);
        if (filter.op === "==") return fieldValue === filter.value;
        if (filter.op === ">=") return Number(fieldValue) >= Number(filter.value);
        if (filter.op === "array-contains") {
          return Array.isArray(fieldValue) && fieldValue.includes(filter.value);
        }
        if (filter.op === "array-contains-any") {
          return (
            Array.isArray(fieldValue) &&
            Array.isArray(filter.value) &&
            fieldValue.some((v) => filter.value.includes(v))
          );
        }
        return false;
      });
    }

    if (this._order) {
      const { field, direction } = this._order;
      const dir = direction === "desc" ? -1 : 1;
      docs.sort((a, b) => {
        const av = field === "__name__" ? a.ref.path : getByPath(a.data() || {}, field);
        const bv = field === "__name__" ? b.ref.path : getByPath(b.data() || {}, field);
        if (av === bv) return 0;
        if (av === undefined || av === null) return -1 * dir;
        if (bv === undefined || bv === null) return 1 * dir;
        return av > bv ? dir : -dir;
      });
    }

    if (this._startAfter) {
      const idx = docs.findIndex((doc) => doc.ref.path === this._startAfter || doc.id === this._startAfter);
      docs = idx >= 0 ? docs.slice(idx + 1) : docs;
    }

    if (Number.isFinite(this._limit)) {
      docs = docs.slice(0, Math.max(0, Number(this._limit)));
    }

    return new FakeQuerySnapshot(docs);
  }
}

class FakeCollectionReference {
  constructor(db, path, parent = null) {
    this._db = db;
    this.path = path;
    this.parent = parent;
    this.id = path.split("/").pop();
  }

  doc(id) {
    return new FakeDocumentReference(this._db, `${this.path}/${id}`, this);
  }

  async add(data) {
    const id = `auto_${Math.random().toString(36).slice(2, 10)}`;
    const ref = this.doc(id);
    await ref.set(data);
    return ref;
  }

  _query() {
    const prefix = `${this.path}/`;
    return new FakeQuery(this._db, () => {
      const docs = [];
      for (const [path, raw] of this._db._store.entries()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (!rest || rest.includes("/")) continue;
        const ref = this.doc(rest);
        docs.push(new FakeDocSnapshot(ref, raw));
      }
      return docs;
    });
  }

  where(field, op, value) {
    return this._query().where(field, op, value);
  }

  orderBy(field, direction) {
    return this._query().orderBy(field, direction);
  }

  limit(value) {
    return this._query().limit(value);
  }

  async get() {
    return this._query().get();
  }
}

class FakeWriteBatch {
  constructor(db) {
    this._db = db;
    this._ops = [];
  }

  set(ref, data, options = {}) {
    this._ops.push(() => ref.set(data, options));
    return this;
  }

  update(ref, data) {
    this._ops.push(() => ref.update(data));
    return this;
  }

  delete(ref) {
    this._ops.push(() => ref.delete());
    return this;
  }

  async commit() {
    for (const op of this._ops) {
      // eslint-disable-next-line no-await-in-loop
      await op();
    }
  }
}

class FakeTransaction {
  constructor(db) {
    this._db = db;
  }

  async get(refOrQuery) {
    return refOrQuery.get();
  }

  async getAll(...refs) {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  set(ref, data, options = {}) {
    return ref.set(data, options);
  }

  update(ref, data) {
    return ref.update(data);
  }

  delete(ref) {
    return ref.delete();
  }
}

export function createFakeFirestore(seed = {}) {
  const store = new Map(Object.entries(deepClone(seed)));
  const db = {
    _store: store,
    collection(name) {
      return new FakeCollectionReference(db, String(name || ""));
    },
    collectionGroup(name) {
      const groupName = String(name || "");
      return new FakeQuery(db, () => {
        const docs = [];
        for (const [path, raw] of store.entries()) {
          const parts = path.split("/");
          if (parts.length < 2) continue;
          const collectionName = parts[parts.length - 2];
          if (collectionName !== groupName) continue;
          const parentPath = parts.slice(0, parts.length - 1).join("/");
          const parentCollection = new FakeCollectionReference(db, parentPath);
          const ref = parentCollection.doc(parts[parts.length - 1]);
          docs.push(new FakeDocSnapshot(ref, raw));
        }
        return docs;
      });
    },
    batch() {
      return new FakeWriteBatch(db);
    },
    async runTransaction(cb) {
      const tx = new FakeTransaction(db);
      return cb(tx);
    },
    async getAll(...refs) {
      return Promise.all(refs.map((ref) => ref.get()));
    },
  };
  return db;
}

export function createAdminMock() {
  return {
    firestore: {
      FieldValue: {
        serverTimestamp: () => Date.now(),
        arrayUnion: (...vals) => ({ __op: "arrayUnion", vals }),
        arrayRemove: (...vals) => ({ __op: "arrayRemove", vals }),
      },
    },
  };
}
