import { createContext, useContext, useEffect, useState } from "react";
import ru from "@/i18n/ru";
import en from "@/i18n/en";
import de from "@/i18n/de";
import fr from "@/i18n/fr";

const translations = { ru, en, de, fr };

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem("lang");
    if (saved && translations[saved]) return saved;
    const nav =
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      "";
    const code = nav.toLowerCase().slice(0, 2);
    return translations[code] ? code : "en";
  });

  useEffect(() => {
    localStorage.setItem("lang", lang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dataset.lang = lang;
    }
  }, [lang]);

  const value = {
    lang,
    setLang,
    t: translations[lang] || translations.ru,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
