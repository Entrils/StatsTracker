import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "../firebase";

export default function DiscordCallback() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    console.log("[DEBUG] OAuth code from URL:", code);

    if (!code) {
      console.warn("[DEBUG] No code in URL, redirecting");
      navigate("/", { replace: true });
      return;
    }

    const usedCode = sessionStorage.getItem("discord_oauth_code");
    console.log("[DEBUG] Previously used code:", usedCode);

    if (usedCode === code) {
      console.warn("[DEBUG] Code already used, redirecting");
      navigate("/", { replace: true });
      return;
    }

    sessionStorage.setItem("discord_oauth_code", code);

    const login = async () => {
      try {
        console.log("[DEBUG] Sending code to backend...");
        const res = await fetch("http://localhost:4000/auth/discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const text = await res.text(); // получаем raw text для дебага
        console.log("[DEBUG] Backend raw response text:", text);

        let data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          console.error("[DEBUG] Failed to parse JSON:", parseErr);
          throw new Error("Backend returned invalid JSON");
        }

        console.log("[DEBUG] Backend parsed response:", data);

        if (!res.ok) {
          console.error("[DEBUG] Backend returned non-OK status:", res.status);
          throw new Error("Backend auth failed");
        }

        if (!data.firebaseToken) {
          console.error("[DEBUG] No firebaseToken in backend response");
          throw new Error("Backend did not return firebaseToken");
        }

        console.log("[DEBUG] Signing in with Firebase token...");
        await signInWithCustomToken(auth, data.firebaseToken);

        console.log("[DEBUG] Firebase signInWithCustomToken successful");
        console.log("[DEBUG] Current user after login:", auth.currentUser);

        // Ждём, пока Firebase обновит user
        await new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            console.log("[DEBUG] onAuthStateChanged triggered, user:", user);
            if (user) {
              unsubscribe();
              resolve(user);
            }
          });
        });

        console.log("[DEBUG] User fully logged in, redirecting");
        window.history.replaceState({}, document.title, "/");
        navigate("/", { replace: true });
      } catch (err) {
        console.error("[DEBUG] DISCORD LOGIN ERROR:", err);
        navigate("/", { replace: true });
      }
    };

    login();
  }, [navigate]);

  return <p>Logging in with Discord...</p>;
}
