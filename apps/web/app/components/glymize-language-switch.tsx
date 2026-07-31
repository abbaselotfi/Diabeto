"use client";

import { useGlymizeLocale } from "./use-glymize-locale";

export default function GlymizeLanguageSwitch() {
  const { locale, setLocale } = useGlymizeLocale();

  return (
    <div
      className="glymize-language-switch"
      aria-label="Language selector"
      data-glymize-language-switch="true"
    >
      <button
        type="button"
        className={locale === "fa" ? "active" : undefined}
        aria-pressed={locale === "fa"}
        onClick={() => setLocale("fa")}
      >
        FA
      </button>
      <span aria-hidden="true">|</span>
      <button
        type="button"
        className={locale === "en" ? "active" : undefined}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
