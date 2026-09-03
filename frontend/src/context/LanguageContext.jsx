import { createContext, useContext, useMemo, useState } from "react";
import { translations } from "../i18n/translations";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem("gramsoft_lang") || "en");

  function toggleLanguage() {
    setLanguage((prev) => {
      const next = prev === "en" ? "mr" : "en";
      localStorage.setItem("gramsoft_lang", next);
      return next;
    });
  }

  const t = useMemo(() => {
    const dict = translations[language] || translations.en;
    // Falls back to the English string (never a raw key) if a translation
    // is ever missing, so a gap in the dictionary shows readable English
    // instead of a literal "someKey" on screen.
    return (key) => dict[key] ?? translations.en[key] ?? key;
  }, [language]);

  const value = useMemo(() => ({ language, toggleLanguage, t }), [language, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
