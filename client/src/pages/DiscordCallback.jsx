import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/firebase";

export default function DiscordCallback() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      navigate("/", { replace: true });
      return;
    }

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
          body: JSON.stringify({ code }),
        });

        const text = await res.text(); // РїРѕР»СѓС‡Р°РµРј raw text РґР»СЏ РґРµР±Р°РіР°

        let data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          throw new Error("Backend returned invalid JSON");
        }


        if (!res.ok) {
          throw new Error("Backend auth failed");
        }

        if (!data.firebaseToken) {
          throw new Error("Backend did not return firebaseToken");
        }

        await signInWithCustomToken(auth, data.firebaseToken);


        // Р–РґС‘Рј, РїРѕРєР° Firebase РѕР±РЅРѕРІРёС‚ user
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
      } catch (err) {
        sessionStorage.removeItem("discord_oauth_code");
        navigate("/", { replace: true });
      }
    };

    login();
  }, [navigate]);

  return <p>Logging in with Discord...</p>;
}
