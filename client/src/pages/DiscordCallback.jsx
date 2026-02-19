import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/firebase";

const DISCORD_OAUTH_STATE_KEY = "discord_oauth_state";
const DISCORD_OAUTH_STATE_TS_KEY = "discord_oauth_state_ts";
const DISCORD_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export default function DiscordCallback() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const storedState = sessionStorage.getItem(DISCORD_OAUTH_STATE_KEY);
    const stateTs = Number.parseInt(
      sessionStorage.getItem(DISCORD_OAUTH_STATE_TS_KEY) || "",
      10
    );
    const stateAgeMs = Number.isFinite(stateTs) ? Date.now() - stateTs : Number.NaN;
    const isStateValid =
      Boolean(state) &&
      Boolean(storedState) &&
      state === storedState &&
      Number.isFinite(stateAgeMs) &&
      stateAgeMs >= 0 &&
      stateAgeMs <= DISCORD_OAUTH_STATE_MAX_AGE_MS;

    if (!code || !isStateValid) {
      sessionStorage.removeItem(DISCORD_OAUTH_STATE_KEY);
      sessionStorage.removeItem(DISCORD_OAUTH_STATE_TS_KEY);
      navigate("/", { replace: true });
      return;
    }

    sessionStorage.removeItem(DISCORD_OAUTH_STATE_KEY);
    sessionStorage.removeItem(DISCORD_OAUTH_STATE_TS_KEY);

    const usedCode = sessionStorage.getItem("discord_oauth_code");
    if (usedCode === code) {
      navigate("/", { replace: true });
      return;
    }

    sessionStorage.setItem("discord_oauth_code", code);

    const login = async () => {
      try {
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
        const res = await fetch(`${backendUrl}/auth/discord`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
        });

        const text = await res.text();

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("Backend returned invalid JSON");
        }

        if (!res.ok) {
          throw new Error("Backend auth failed");
        }

        if (!data.firebaseToken) {
          throw new Error("Backend did not return firebaseToken");
        }

        await signInWithCustomToken(auth, data.firebaseToken);

        await new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
              unsubscribe();
              resolve(user);
            }
          });
        });

        sessionStorage.removeItem("discord_oauth_code");
        window.history.replaceState({}, document.title, "/");
        navigate("/", { replace: true });
      } catch {
        sessionStorage.removeItem("discord_oauth_code");
        navigate("/", { replace: true });
      }
    };

    login();
  }, [navigate]);

  return <p>Logging in with Discord...</p>;
}
