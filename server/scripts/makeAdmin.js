import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/makeAdmin.js <uid>");
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
  console.log(`Admin claim set for ${uid}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to set admin claim:", err);
  process.exit(1);
});
