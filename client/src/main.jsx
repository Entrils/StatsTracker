import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./i18n/LanguageContext";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";

ReactDOM.createRoot(document.getElementById("root")).render(
     <React.StrictMode>
    <AuthProvider>
      <LanguageProvider>
      <App />
      </LanguageProvider>
    </AuthProvider>
  </React.StrictMode>
);
