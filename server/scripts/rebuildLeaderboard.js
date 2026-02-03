import dotenv from "dotenv";
import admin from "firebase-admin";
import pino from "pino";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : null;

admin.initializeApp({
  credential: serviceAccountJson
    ? admin.credential.cert(serviceAccountJson)
    : admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function deleteCollection(collRef) {
  const snap = await collRef.limit(500).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return deleteCollection(collRef);
}

async function rebuild() {
  logger.info("Rebuilding leaderboard_users from users/*/matches...");

  const players = new Map();
  let lastDoc = null;
  const baseQuery = db
    .collectionGroup("matches")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(1000);

  while (true) {
    const query = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const m = doc.data() || {};
      const uid =
        doc.ref?.parent?.parent?.id || m.ownerUid || m.uid || m.userId;
      if (!uid) continue;

      const prev = players.get(uid) || {
        uid,
        name: "Unknown",
        score: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        damageShare: 0,
        wins: 0,
        losses: 0,
        matches: 0,
      };

      if ((m.name || m.playerName || m.username) && prev.name === "Unknown") {
        prev.name = m.name || m.playerName || m.username;
      }

      prev.score += m.score || 0;
      prev.kills += m.kills || 0;
      prev.deaths += m.deaths || 0;
      prev.assists += m.assists || 0;
      prev.damage += m.damage || 0;
      prev.damageShare += m.damageShare || 0;
      if (m.result === "victory") prev.wins += 1;
      else if (m.result === "defeat") prev.losses += 1;
      prev.matches += 1;

      players.set(uid, prev);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  logger.info(
    { count: players.size },
    "Found players. Clearing old leaderboard_users..."
  );
  await deleteCollection(db.collection("leaderboard_users"));

  logger.info("Writing leaderboard_users...");
  const batchSize = 500;
  let batch = db.batch();
  let i = 0;

  for (const p of players.values()) {
    const ref = db.collection("leaderboard_users").doc(p.uid);
    batch.set(ref, {
      name: p.name,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      damage: p.damage,
      damageShare: p.damageShare,
      wins: p.wins,
      losses: p.losses,
      matches: p.matches,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    i += 1;
    if (i % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  if (i % batchSize !== 0) {
    await batch.commit();
  }

  logger.info("Done.");
  process.exit(0);
}

rebuild().catch((err) => {
  logger.error({ err }, "Rebuild failed");
  process.exit(1);
});
