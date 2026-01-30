import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "../firebase";

export default function DiscordCallback() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    // защита от повторного запуска useEffect (StrictMode / rerender)
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      navigate("/", { replace: true });
      return;
    }

    // защита от повторного использования OAuth code
    const usedCode = sessionStorage.getItem("discord_oauth_code");
    if (usedCode === code) {
      console.warn("Discord OAuth code already used");
      navigate("/", { replace: true });
      return;
    }

    sessionStorage.setItem("discord_oauth_code", code);

    const login = async () => {
      try {
        const res = await fetch("http://localhost:4000/auth/discord", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        });

        const data = await res.json();
        console.log("BACKEND RESPONSE:", data);

        if (!res.ok || !data.firebaseToken) {
          throw new Error("Backend auth failed");
        }
        await signInWithCustomToken(auth, data.firebaseToken);

        window.history.replaceState({}, document.title, "/");

        navigate("/", { replace: true });
      } catch (err) {
        console.error("DISCORD LOGIN ERROR:", err);
        navigate("/", { replace: true });
      }
    };

    login();
  }, [navigate]);

  return <p>Logging in with Discord...</p>;
}
