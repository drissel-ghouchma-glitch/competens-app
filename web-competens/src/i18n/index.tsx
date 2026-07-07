import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { translations, type Lang } from "./translations";

const LANG_KEY = "competens-lang";
const PICKED_KEY = "competens-lang-picked"; // session flag — gate shows once per app open

type Vars = Record<string, string | number>;

interface I18nContextType {
  lang: Lang;
  dir: "rtl" | "ltr";
  /** True once the user has passed the language gate for this session. */
  picked: boolean;
  setLang: (l: Lang) => void;
  /** Confirm the language choice and dismiss the gate for this session. */
  markPicked: () => void;
  /** Re-arm the gate (e.g. on logout) so it shows again before next login. */
  resetPicked: () => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function readLang(): Lang {
  if (typeof window === "undefined") return "fr";
  const stored = localStorage.getItem(LANG_KEY);
  return stored === "ar" ? "ar" : "fr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const [picked, setPicked] = useState<boolean>(
    () => typeof window !== "undefined" && sessionStorage.getItem(PICKED_KEY) === "1"
  );

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  // Reflect language + direction on <html> for global RTL support
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("dir", dir);
    root.setAttribute("lang", lang);
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_KEY, l);
  }, []);

  const markPicked = useCallback(() => {
    sessionStorage.setItem(PICKED_KEY, "1");
    setPicked(true);
  }, []);

  const resetPicked = useCallback(() => {
    sessionStorage.removeItem(PICKED_KEY);
    setPicked(false);
  }, []);

  const t = useCallback((key: string, vars?: Vars): string => {
    const table = translations[lang];
    let str = table[key] ?? translations.fr[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, dir, picked, setLang, markPicked, resetPicked, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}
