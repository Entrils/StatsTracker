import { createContext, useContext, useEffect, useState } from "react";
import ru from "./ru";
import en from "./en";

const translations = { ru, en };

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    localStorage.getItem("lang") || "ru"
  );

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  const value = {
    lang,
    setLang,
    t: translations[lang],
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
