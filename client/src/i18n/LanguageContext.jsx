import { createContext, useContext, useEffect, useState } from "react";
import ru from "./ru";
import en from "./en";
import de from "./de";
import fr from "./fr";

const translations = { ru, en, de, fr };

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    localStorage.getItem("lang") || "ru"
  );

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
