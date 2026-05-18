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

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const valid = ["zh-CN", "zh-XG", "en"].includes(e.newValue);
        if (valid) {
          setLocaleState(e.newValue as Locale);
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        listen<{ locale: string }>("locale-changed", (event) => {
          const valid = ["zh-CN", "zh-XG", "en"].includes(event.payload.locale);
          if (valid) {
            setLocaleState(event.payload.locale as Locale);
          }
        })
          .then((fn) => {
            unlisten = fn;
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (unlisten) unlisten();
    };
  }, []);

  const setLocale = useCallback(async (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("locale-changed", { locale: l });
    } catch {
      // console.warn("Failed to emit locale-changed event:", err);
    }
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
    [messages, loaded]
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
