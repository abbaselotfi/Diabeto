"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { migrateLegacyGlymizeStorage } from "../lib/glymize-brand-migration";
import styles from "./page.module.css";

type Locale = "fa" | "en";

type Copy = {
  clinicianLabel: string;
  intelligence: string;
  headline: string;
  description: string;
  start: string;
  how: string;
  disclaimer: string;
  patientTitle: string;
  patientBody: string;
  guidelineTitle: string;
  guidelineBody: string;
  coverageTitle: string;
  coverageBody: string;
  resultTitle: string;
  resultBody: string;
};

const COPY: Record<Locale, Copy> = {
  fa: {
    clinicianLabel: "ویژه پزشکان",
    intelligence: "هوش تجویز در دیابت",
    headline: "از عوامل فردی بیمار تا برنامه درمانی بهینه.",
    description:
      "توصیه‌هایی مبتنی بر شواهد و منطبق با دستورالعمل‌های بالینی، فهرست دارویی، پوشش بیمه و ملاحظات هزینه.",
    start: "شروع ارزیابی بالینی",
    how: "مشاهده نحوه عملکرد",
    disclaimer:
      "پشتیبانی تصمیم بالینی جایگزین قضاوت پزشک نیست و مسئولیت نهایی تصمیم درمانی بر عهده پزشک است.",
    patientTitle: "مشخصات بیمار",
    patientBody: "اطلاعات بالینی، ترجیحات و شرایط فردی",
    guidelineTitle: "دستورالعمل‌ها",
    guidelineBody: "توصیه‌های مبتنی بر شواهد و راهنماهای بالینی",
    coverageTitle: "پوشش و هزینه",
    coverageBody: "پوشش بیمه، دسترسی و ملاحظات هزینه",
    resultTitle: "برنامه درمانی بهینه",
    resultBody: "پیشنهاد شخصی‌سازی‌شده برای بررسی پزشک",
  },
  en: {
    clinicianLabel: "For clinicians",
    intelligence: "Diabetes Prescribing Intelligence",
    headline: "From patient factors to an optimized treatment plan.",
    description:
      "Evidence-aligned recommendations informed by clinical guidelines, formulary, coverage, and cost.",
    start: "Start clinical assessment",
    how: "See how it works",
    disclaimer:
      "For healthcare professionals. Clinical decision support does not replace physician judgment.",
    patientTitle: "Patient profile",
    patientBody: "Clinical data, preferences, and individual factors",
    guidelineTitle: "Guidelines",
    guidelineBody: "Evidence-aligned clinical recommendations",
    coverageTitle: "Coverage & cost",
    coverageBody: "Insurance, access, and affordability",
    resultTitle: "Optimized regimen",
    resultBody: "A personalized option set for clinician review",
  },
};

const storageKey = "glymize-ui-language";

function publicAsset(path: string): string {
  const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${configuredBasePath}${path}`;
}

function PatientIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="14" r="8" />
      <path d="M10 40c0-8 6.3-14 14-14s14 6 14 14" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 39c-4-4-9-6-16-6V9c7 0 12 2 16 6v24Z" />
      <path d="M24 39c4-4 9-6 16-6V9c-7 0-12 2-16 6v24Z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 12h27a5 5 0 0 1 5 5v22H12a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6h23" />
      <path d="M31 22h11v10H31a5 5 0 0 1 0-10Z" />
      <circle cx="33" cy="27" r="1.5" className={styles.iconFill} />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="10" y="7" width="27" height="34" rx="3" />
      <path d="m15 17 3 3 5-6M26 17h6M15 29l3 3 5-6M26 29h6" />
      <path d="m31 38 4 4 8-9" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 27 7v8c0 7-4.5 11.5-11 14-6.5-2.5-11-7-11-14V7l11-4Z" />
      <path d="m11 16 3 3 7-8" />
    </svg>
  );
}

function ArrowIcon({ rtl }: { rtl: boolean }) {
  return (
    <svg
      className={rtl ? styles.arrowRtl : undefined}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 12h14M14 6l6 6-6 6" />
    </svg>
  );
}

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("fa");

  useEffect(() => {
    migrateLegacyGlymizeStorage();
    const savedLocale = window.localStorage.getItem(storageKey);
    if (savedLocale === "fa" || savedLocale === "en") {
      setLocale(savedLocale);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    window.localStorage.setItem(storageKey, locale);
  }, [locale]);

  const copy = useMemo(() => COPY[locale], [locale]);
  const isRtl = locale === "fa";

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <header className={styles.header}>
        <a className={styles.brandLink} href="/" aria-label="GLYMIZE home">
          <img
            className={styles.wordmark}
            src={publicAsset("/glymize-logo.png")}
            alt="GLYMIZE"
          />
        </a>

        <div className={styles.headerActions}>
          <div className={styles.languageSwitch} aria-label="Language selector">
            <button
              type="button"
              className={locale === "fa" ? styles.languageActive : undefined}
              aria-pressed={locale === "fa"}
              onClick={() => setLocale("fa")}
            >
              FA
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className={locale === "en" ? styles.languageActive : undefined}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>

          <div className={styles.clinicianPill}>
            <PatientIcon />
            <span>{copy.clinicianLabel}</span>
          </div>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="glymize-headline">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <img
              className={styles.eyebrowIcon}
              src={publicAsset("/glymize-app-icon.png")}
              alt=""
              aria-hidden="true"
            />
            <span>{copy.intelligence}</span>
          </div>

          <h1 id="glymize-headline">{copy.headline}</h1>
          <p className={styles.description}>{copy.description}</p>

          <div className={styles.ctaRow}>
            <Link className={styles.primaryCta} href="/type-2">
              <span>{copy.start}</span>
              <ArrowIcon rtl={isRtl} />
            </Link>

            <button
              type="button"
              className={styles.secondaryCta}
              onClick={() =>
                document
                  .getElementById("how-it-works")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              <span>{copy.how}</span>
              <ArrowIcon rtl={isRtl} />
            </button>
          </div>

          <div className={styles.disclaimer}>
            <ShieldIcon />
            <p>{copy.disclaimer}</p>
          </div>
        </div>

        <div
          className={styles.diagram}
          id="how-it-works"
          aria-label={copy.resultTitle}
        >
          <div className={styles.diagramGlow} aria-hidden="true" />

          <div className={styles.inputCards}>
            <article className={styles.inputCard}>
              <div className={styles.cardIcon}>
                <PatientIcon />
              </div>
              <h2>{copy.patientTitle}</h2>
              <p>{copy.patientBody}</p>
            </article>

            <article className={styles.inputCard}>
              <div className={styles.cardIcon}>
                <BookIcon />
              </div>
              <h2>{copy.guidelineTitle}</h2>
              <p>{copy.guidelineBody}</p>
            </article>

            <article className={styles.inputCard}>
              <div className={styles.cardIcon}>
                <WalletIcon />
              </div>
              <h2>{copy.coverageTitle}</h2>
              <p>{copy.coverageBody}</p>
            </article>
          </div>

          <div className={styles.flowStage} aria-hidden="true">
            <svg
              className={styles.flowGraphic}
              viewBox="0 0 820 520"
              preserveAspectRatio="xMidYMid meet"
              role="presentation"
              focusable="false"
            >
              <defs>
                <linearGradient
                  id="glymize-flow-y-gradient"
                  x1="316"
                  y1="448"
                  x2="508"
                  y2="170"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="#075d76" />
                  <stop offset="0.48" stopColor="#008d91" />
                  <stop offset="1" stopColor="#00d2be" />
                </linearGradient>
              </defs>

              <g className={styles.flowConnectors}>
                <path d="M136 14v118c0 31 21 52 61 52h73c28 0 47 13 58 38" />
                <path d="M410 14v206" />
                <path d="M684 14v118c0 31-21 52-61 52h-73c-28 0-47 13-58 38" />
                <circle cx="136" cy="14" r="7" />
                <circle cx="410" cy="14" r="7" />
                <circle cx="684" cy="14" r="7" />
              </g>

              <path
                className={styles.flowY}
                pathLength="1"
                d="M300 220 L410 330 L520 220 M410 330 V470"
              />

              <g className={styles.flowOutput}>
                <path d="M410 470v36" />
                <circle cx="410" cy="470" r="7" />
                <circle cx="410" cy="506" r="7" />
              </g>
            </svg>
          </div>

          <article className={styles.resultCard}>
            <div className={styles.resultIcon}>
              <ChecklistIcon />
            </div>
            <div>
              <h2>{copy.resultTitle}</h2>
              <p>{copy.resultBody}</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
