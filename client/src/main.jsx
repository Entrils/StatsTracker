import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { LanguageProvider } from "@/i18n/LanguageContext";
import "@/index.css";
import { AuthProvider } from "@/auth/AuthContext";
import { createClientErrorReporter } from "@/utils/clientErrors/reporter";
import ErrorBoundary from "@/components/ErrorBoundary/ErrorBoundary";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const reporter = createClientErrorReporter({
  backendUrl: BACKEND_URL,
  getUid: () => window.__FP_UID,
});

window.addEventListener("error", (event) => {
  reporter.reportWindowError(event);
});

window.addEventListener("unhandledrejection", (event) => {
  reporter.reportUnhandledRejection(event);
});


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <LanguageProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </LanguageProvider>
    </AuthProvider>
  </React.StrictMode>
);


