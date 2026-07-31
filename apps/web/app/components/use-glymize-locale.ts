"use client";

import { useCallback, useEffect, useState } from "react";

export type GlymizeLocale = "fa" | "en";

const LANGUAGE_KEY = "glymize-ui-language";
const LANGUAGE_EVENT = "glymize-language-change";

export function useGlymizeLocale() {
  const [locale, setLocaleState] = useState<GlymizeLocale>("fa");

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    if (saved === "fa" || saved === "en") {
      setLocaleState(saved);
    }

    const syncLocale = (event: Event) => {
      const custom = event as CustomEvent<GlymizeLocale>;
      if (custom.detail === "fa" || custom.detail === "en") {
        setLocaleState(custom.detail);
        return;
      }
      const current = window.localStorage.getItem(LANGUAGE_KEY);
      if (current === "fa" || current === "en") {
        setLocaleState(current);
      }
    };

    window.addEventListener(LANGUAGE_EVENT, syncLocale);
    window.addEventListener("storage", syncLocale);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, syncLocale);
      window.removeEventListener("storage", syncLocale);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    document.body.dir = locale === "fa" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((next: GlymizeLocale) => {
    window.localStorage.setItem(LANGUAGE_KEY, next);
    setLocaleState(next);
    window.dispatchEvent(
      new CustomEvent<GlymizeLocale>(LANGUAGE_EVENT, { detail: next }),
    );
  }, []);

  return {
    locale,
    setLocale,
    isRtl: locale === "fa",
  };
}
