import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";

const AuthContext = createContext(null);

function resolveCypressAuthMock() {
  if (typeof window === "undefined" || !window.Cypress) return null;
  try {
    const raw = window.localStorage.getItem("__cypress_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const uid = String(parsed?.uid || "cypress-user");
    const token = String(parsed?.token || "cypress-token");
    const claims =
      parsed?.claims && typeof parsed.claims === "object"
        ? parsed.claims
        : {};

    return {
      user: {
        uid,
        displayName: parsed?.displayName || "Cypress User",
        email: parsed?.email || `${uid}@example.test`,
        getIdToken: async () => token,
        getIdTokenResult: async () => ({ claims }),
      },
      claims,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cypressAuth = resolveCypressAuthMock();
    if (cypressAuth) {
      setUser(cypressAuth.user);
      setClaims(cypressAuth.claims);
      if (typeof window !== "undefined") {
        window.__FP_UID = cypressAuth.user.uid;
      }
      setLoading(false);
      return () => {};
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setClaims(null);
        if (typeof window !== "undefined") {
          delete window.__FP_UID;
        }
        setLoading(false);
        return;
      }

      const tokenResult = await firebaseUser.getIdTokenResult(true);

      setUser(firebaseUser);
      setClaims(tokenResult.claims);
      if (typeof window !== "undefined") {
        window.__FP_UID = firebaseUser.uid;
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, claims, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
