"use client";

import { engineEvidenceSources } from "@glymize/clinical-engine";
import Link from "next/link";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./dashboard.module.css";

type Locale = "fa" | "en";
type Status = "available" | "foundation" | "planned";

type Tool = {
  href: string;
  icon: string;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  status: Status;
};

const COPY = {
  fa: {
    eyebrow: "GLYMIZE Clinical Workspace",
    title: "داشبورد بالینی",
    intro: "مسیرهای تصمیم‌یار دیابت و ابزارهای تیم درمان از یک فضای واحد و واکنش‌گرا در دسترس هستند.",
    diabetes: "مسیرهای دیابت",
    diabetesHint: "انتخاب مسیر اصلی بر اساس نوع دیابت و وضعیت بیمار",
    tools: "ابزارها و تیم درمان",
    toolsHint: "ابزارهای مستقل و جریان آماده‌سازی بیمار پیش از ویزیت",
    open: "باز کردن",
    available: "فعال",
    foundation: "فونداسیون آماده",
    planned: "در حال آماده‌سازی",
    safetyTitle: "مرز ایمنی نسخه فعلی",
    safetyBody: "محاسبه دوز/تیتراسیون انسولین و ذخیره اطلاعات هویتی بیمار تا تکمیل Ruleهای تاییدشده، RBAC و لایه امنیتی فعال نمی‌شوند.",
    evidenceTitle: "پایه علمی فعال در موتور",
    evidenceHint: "فقط منابعی در این بخش نمایش داده می‌شوند که Rule یا مسیر بالینی مشخصی در موتور GLYMIZE را تغذیه می‌کنند.",
    guideline: "Guideline",
    consensus: "Consensus",
    regulatory: "Regulatory",
    evidenceNote: "به‌روزرسانی منبع به‌تنهایی Rule بالینی را تغییر نمی‌دهد؛ نسخه جدید ابتدا باید بازبینی و تایید شود.",
  },
  en: {
    eyebrow: "GLYMIZE Clinical Workspace",
    title: "Clinical dashboard",
    intro: "Diabetes decision-support pathways and care-team tools are available from one responsive workspace.",
    diabetes: "Diabetes pathways",
    diabetesHint: "Choose the main pathway according to diabetes type and patient context.",
    tools: "Tools and care team",
    toolsHint: "Independent clinical tools and pre-visit preparation workflows.",
    open: "Open",
    available: "Available",
    foundation: "Foundation ready",
    planned: "In preparation",
    safetyTitle: "Current safety boundary",
    safetyBody: "Insulin dosing/titration and identifiable patient-data persistence remain disabled until approved rules, RBAC, and the security layer are complete.",
    evidenceTitle: "Evidence actively used by the engine",
    evidenceHint: "Only sources that feed a defined GLYMIZE clinical rule or pathway are shown here.",
    guideline: "Guideline",
    consensus: "Consensus",
    regulatory: "Regulatory",
    evidenceNote: "A source update never changes a clinical rule automatically; new versions require review and approval first.",
  },
} as const;

const DIABETES_TOOLS: Tool[] = [
  {
    href: "/type-2",
    icon: "T2",
    title: { fa: "دیابت نوع ۲", en: "Type 2 diabetes" },
    description: {
      fa: "ارزیابی HbA1c، درمان فعلی، عوامل قلبی‌ـ‌کلیوی، کبدی، وزن، هزینه و دسترسی.",
      en: "HbA1c, current therapy, cardiorenal, liver, weight, cost, and access assessment.",
    },
    status: "available",
  },
  {
    href: "/type-1",
    icon: "T1",
    title: { fa: "دیابت نوع ۱", en: "Type 1 diabetes" },
    description: {
      fa: "فضای مرور درمان انسولین و مسیر آینده مدیریت و تبدیل رژیم‌های انسولینی.",
      en: "Insulin-therapy review workspace and the future insulin-management pathway.",
    },
    status: "foundation",
  },
  {
    href: "/pregnancy",
    icon: "P",
    title: { fa: "دیابت و بارداری", en: "Diabetes in pregnancy" },
    description: {
      fa: "مسیر پرخطر برای مرور درمان پیش از بارداری، دوران بارداری و پس از زایمان.",
      en: "High-risk review pathway for preconception, pregnancy, and postpartum care.",
    },
    status: "foundation",
  },
];

const WORKSPACE_TOOLS: Tool[] = [
  {
    href: "/insulin-tools",
    icon: "IU",
    title: { fa: "محاسبه و مدیریت انسولین", en: "Insulin tools" },
    description: {
      fa: "تبدیل Basal/Premix/Prandial/FRC و سپس تیتراسیون؛ منطق تاییدشده Insulin-Converter به این بخش منتقل می‌شود.",
      en: "Basal, premix, prandial, and FRC conversion followed by titration; validated converter logic will be ported here.",
    },
    status: "foundation",
  },
  {
    href: "/care-team",
    icon: "RN",
    title: { fa: "دستیار / پرستار", en: "Assistant / nurse" },
    description: {
      fa: "آماده‌سازی پیش از ویزیت، ورود آزمایش‌ها و داروها، اسکن با دوربین و OCR با مرحله Review قبل از تحویل به پزشک.",
      en: "Pre-visit preparation, labs and medications, camera/PDF OCR, and review before physician handoff.",
    },
    status: "planned",
  },
];

function StatusBadge({ status, locale }: { status: Status; locale: Locale }) {
  const copy = COPY[locale];
  return <span className={`${styles.status} ${styles[status]}`}>{copy[status]}</span>;
}

function ToolCard({ tool, locale }: { tool: Tool; locale: Locale }) {
  const copy = COPY[locale];
  return (
    <Link className={styles.toolCard} href={tool.href}>
      <div className={styles.cardTop}>
        <span className={styles.icon} aria-hidden="true">{tool.icon}</span>
        <StatusBadge locale={locale} status={tool.status} />
      </div>
      <div className={styles.cardCopy}>
        <h2>{tool.title[locale]}</h2>
        <p>{tool.description[locale]}</p>
      </div>
      <span className={styles.openLink}>{copy.open} <b aria-hidden="true">←</b></span>
    </Link>
  );
}

export default function DashboardPage() {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];
  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>{copy.diabetes}</h2>
          <p>{copy.diabetesHint}</p>
        </div>
        <div className={styles.gridThree}>
          {DIABETES_TOOLS.map((tool) => <ToolCard key={tool.href} locale={locale} tool={tool} />)}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>{copy.tools}</h2>
          <p>{copy.toolsHint}</p>
        </div>
        <div className={styles.gridTwo}>
          {WORKSPACE_TOOLS.map((tool) => <ToolCard key={tool.href} locale={locale} tool={tool} />)}
        </div>
      </section>

      <section className={styles.safety}>
        <span aria-hidden="true">✓</span>
        <div><strong>{copy.safetyTitle}</strong><p>{copy.safetyBody}</p></div>
      </section>

      <section className={styles.evidenceSection} aria-labelledby="engine-evidence-title">
        <div className={styles.sectionHeading}>
          <h2 id="engine-evidence-title">{copy.evidenceTitle}</h2>
          <p>{copy.evidenceHint}</p>
        </div>
        <div className={styles.evidenceGrid}>
          {engineEvidenceSources.map((source) => (
            <a
              className={styles.evidenceChip}
              href={source.sourceUrl}
              key={source.id}
              rel="noreferrer"
              target="_blank"
              title={locale === "fa" ? source.engineRoleFa : source.engineRoleEn}
            >
              <strong>{source.shortCode}</strong>
              <span>{copy[source.sourceKind]}</span>
            </a>
          ))}
        </div>
        <p className={styles.evidenceNote}>{copy.evidenceNote}</p>
      </section>
    </main>
  );
}
