import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

type Locale = "zh-CN" | "zh-XG" | "en";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh-CN",
  setLocale: () => {},
  t: (key: string) => key,
});

const STORAGE_KEY = "hermes-locale";

const translationCache: Record<Locale, Record<string, string>> = {
  "zh-CN": {},
  "zh-XG": {},
  en: {},
};

async function loadLocaleModule(locale: Locale): Promise<Record<string, string>> {
  if (Object.keys(translationCache[locale]).length > 0) {
    return translationCache[locale];
  }
  const mod = await import(`../i18n/${locale}.json`);
  translationCache[locale] = mod.default;
  return mod.default;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "zh-CN";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh-CN" || stored === "zh-XG" || stored === "en") return stored as Locale;
    return "zh-CN";
  });

  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadLocaleModule(locale).then((msgs) => {
      setMessages(msgs);
      setLoaded(true);
    });
  }, [locale]);

  const setLocale = useCallback(async (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      if (!loaded) return key;
      let text = messages[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [messages, loaded],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
