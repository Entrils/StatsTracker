import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export async function fetchUserMatches(uid) {
  const matchesSnap = await getDocs(
    query(
      collection(db, "users", uid, "matches"),
      orderBy("createdAt", "asc"),
      limit(2000)
    )
  );
  return matchesSnap.docs.map((matchDoc) => matchDoc.data());
}

export async function fetchFriendsMeta(idToken) {
  try {
    const friendsRes = await fetch(`${BACKEND_URL}/friends/list`, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
    });
    const friendsJson = await friendsRes.json().catch(() => null);
    const friendRows = Array.isArray(friendsJson?.rows) ? friendsJson.rows : [];
    return {
      friendCount: friendRows.length,
      friendDates: friendRows.map((f) => f?.createdAt).filter(Boolean),
    };
  } catch {
    return { friendCount: 0, friendDates: [] };
  }
}

export async function requestOcr(base64Image, lang, idToken) {
  const headers = {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
  return fetch(`${BACKEND_URL}/ocr`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base64Image, lang }),
  });
}

export async function userMatchExists(uid, matchId) {
  const userMatchRef = doc(db, "users", uid, "matches", matchId);
  return (await getDoc(userMatchRef)).exists();
}

export async function ensureMatchDocument(matchId, matchResult) {
  const matchRef = doc(db, "matches", matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) {
    await setDoc(matchRef, {
      createdAt: Date.now(),
      result: matchResult ?? null,
    });
    return;
  }

  const existingResult = matchSnap.data()?.result ?? null;
  if (!existingResult && (matchResult === "victory" || matchResult === "defeat")) {
    await setDoc(
      matchRef,
      { result: matchResult },
      { merge: true }
    );
  }
}

export async function ensurePlayerDocument(matchId, uid, parsed) {
  const playerRef = doc(db, "matches", matchId, "players", uid);
  if (!(await getDoc(playerRef)).exists()) {
    await setDoc(playerRef, parsed);
  }
}

export async function saveUserMatch(uid, matchId, finalMatch) {
  const userMatchRef = doc(db, "users", uid, "matches", matchId);
  await setDoc(userMatchRef, finalMatch);
}

export async function triggerLeaderboardUpdate(matchId, idToken) {
  try {
    const headers = {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    };
    await fetch(`${BACKEND_URL}/leaderboard/update`, {
      method: "POST",
      headers,
      body: JSON.stringify({ matchId }),
    });
  } catch {
    // best-effort update
  }
}

