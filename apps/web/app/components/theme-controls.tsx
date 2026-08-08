"use client";

import { useEffect, useMemo, useState } from "react";
import { useGlymizeLocale } from "./use-glymize-locale";

type GlymizeTheme = "clinical" | "ocean" | "indigo" | "emerald" | "violet";
type GlymizeMode = "light" | "dark";

const THEME_KEY = "glymize-color-theme";
const MODE_KEY = "glymize-color-mode";

const THEMES: Array<{
  id: GlymizeTheme;
  swatch: string;
  fa: string;
  en: string;
}> = [
  { id: "clinical", swatch: "#0c766e", fa: "کلینیکال سبزآبی", en: "Clinical teal" },
  { id: "ocean", swatch: "#237fb8", fa: "آبی اقیانوسی", en: "Ocean blue" },
  { id: "indigo", swatch: "#5b65b7", fa: "ایندیگو", en: "Indigo" },
  { id: "emerald", swatch: "#38936f", fa: "زمردی", en: "Emerald" },
  { id: "violet", swatch: "#8765ad", fa: "بنفش آرام", en: "Soft violet" },
];

function isTheme(value: string | null): value is GlymizeTheme {
  return THEMES.some((theme) => theme.id === value);
}

function isMode(value: string | null): value is GlymizeMode {
  return value === "light" || value === "dark";
}

function applyTheme(theme: GlymizeTheme, mode: GlymizeMode) {
  document.documentElement.dataset.glymizeTheme = theme;
  document.documentElement.dataset.glymizeMode = mode;
  const themeColor = mode === "dark" ? "#0d1719" : "#f4f8f7";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

export default function ThemeControls() {
  const { locale } = useGlymizeLocale();
  const [theme, setTheme] = useState<GlymizeTheme>("clinical");
  const [mode, setMode] = useState<GlymizeMode>("light");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    const savedMode = window.localStorage.getItem(MODE_KEY);
    const nextTheme = isTheme(savedTheme) ? savedTheme : "clinical";
    const nextMode = isMode(savedMode) ? savedMode : "light";
    setTheme(nextTheme);
    setMode(nextMode);
    applyTheme(nextTheme, nextMode);
  }, []);

  useEffect(() => {
    applyTheme(theme, mode);
    window.localStorage.setItem(THEME_KEY, theme);
    window.localStorage.setItem(MODE_KEY, mode);
  }, [theme, mode]);

  const activeTheme = useMemo(() => THEMES.find((item) => item.id === theme)!, [theme]);
  const copy = locale === "fa"
    ? {
        palette: "تم رنگی",
        light: "حالت روز",
        dark: "حالت شب",
        choose: "انتخاب تم رنگی",
      }
    : {
        palette: "Color theme",
        light: "Light mode",
        dark: "Dark mode",
        choose: "Choose color theme",
      };

  return (
    <div className="glymize-theme-controls">
      <button
        className="glymize-mode-toggle"
        type="button"
        aria-label={mode === "light" ? copy.dark : copy.light}
        title={mode === "light" ? copy.dark : copy.light}
        onClick={() => setMode((current) => current === "light" ? "dark" : "light")}
      >
        <span aria-hidden="true">{mode === "light" ? "☾" : "☀"}</span>
      </button>

      <div className="glymize-theme-menu-wrap">
        <button
          className="glymize-palette-toggle"
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={copy.palette}
          title={copy.palette}
          onClick={() => setOpen((current) => !current)}
        >
          <span
            className="glymize-active-swatch"
            style={{ background: activeTheme.swatch }}
            aria-hidden="true"
          />
          <span aria-hidden="true">◉</span>
        </button>

        {open && (
          <div className="glymize-theme-menu" role="menu" aria-label={copy.choose}>
            <strong>{copy.choose}</strong>
            <div className="glymize-theme-options">
              {THEMES.map((item) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === theme}
                  className={item.id === theme ? "selected" : undefined}
                  key={item.id}
                  onClick={() => {
                    setTheme(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="glymize-theme-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                  <span>{item[locale]}</span>
                  <b aria-hidden="true">{item.id === theme ? "✓" : ""}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
