import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setClaims(null);
        setLoading(false);
        return;
      }

      const tokenResult = await firebaseUser.getIdTokenResult(true);

      setUser(firebaseUser);
      setClaims(tokenResult.claims);
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
