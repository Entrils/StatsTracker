import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { db } from "@/firebase";

const MATCHES_PAGE_SIZE = 20;

export default function useProfileMatches(uid) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef(null);

  const fetchHistory = useCallback(async (reset = false) => {
    if (!uid) return;
    if (reset) {
      setLoading(true);
      setMatches([]);
      lastDocRef.current = null;
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const base = query(
        collection(db, "users", uid, "matches"),
        orderBy("createdAt", "asc"),
        limit(MATCHES_PAGE_SIZE)
      );
      const cursor = lastDocRef.current;
      const q = !reset && cursor ? query(base, startAfter(cursor)) : base;
      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((d, i) => {
        const m = d.data();
        return {
          index: i + 1,
          id: d.id,
          ...m,
          win: m.result === "victory" ? 1 : 0,
        };
      });

      const nextLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      setMatches((prev) => {
        const merged = reset ? data : [...prev, ...data];
        return merged.map((m, idx) => ({ ...m, index: idx + 1 }));
      });
      lastDocRef.current = nextLastDoc;
      setHasMore(snapshot.docs.length === MATCHES_PAGE_SIZE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    fetchHistory(true);
  }, [fetchHistory, uid]);

  return { matches, loading, loadingMore, hasMore, fetchHistory };
}
