import dotenv from "dotenv";
import admin from "firebase-admin";
import pino from "pino";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const uid = process.argv[2];
if (!uid) {
  logger.error("Usage: node scripts/makeAdmin.js <uid>");
  process.exit(1);
}

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : null;

admin.initializeApp({
  credential: serviceAccountJson
    ? admin.credential.cert(serviceAccountJson)
    : admin.credential.applicationDefault(),
});

async function run() {
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  logger.info({ uid }, "Admin claim set");
  process.exit(0);
}

run().catch((err) => {
  logger.error({ err }, "Failed to set admin claim");
  process.exit(1);
});
