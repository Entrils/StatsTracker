import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./i18n/LanguageContext";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

function sendClientError(payload) {
  try {
    const uid = window.__FP_UID;
    fetch(`${BACKEND_URL}/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, uid }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

window.addEventListener("error", (event) => {
  sendClientError({
    message: event.message || "Unknown error",
    stack: event.error?.stack || "",
    url: window.location.href,
    source: event.filename || "",
    line: event.lineno || null,
    col: event.colno || null,
    userAgent: navigator.userAgent,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason || {};
  sendClientError({
    message: reason.message || "Unhandled promise rejection",
    stack: reason.stack || "",
    url: window.location.href,
    userAgent: navigator.userAgent,
  });
});


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </AuthProvider>
  </React.StrictMode>
);


