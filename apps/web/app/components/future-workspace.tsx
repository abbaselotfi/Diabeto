"use client";

import Link from "next/link";
import { useGlymizeLocale } from "./use-glymize-locale";
import styles from "./future-workspace.module.css";

type WorkspaceKind = "insulin" | "care_team";

type WorkspaceCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  status: string;
  safety: string;
  items: Array<{ title: string; body: string }>;
};

const COPY: Record<WorkspaceKind, { fa: WorkspaceCopy; en: WorkspaceCopy }> = {
  insulin: {
    fa: {
      eyebrow: "Insulin Management",
      title: "محاسبه و مدیریت انسولین",
      intro: "این فضا محل یکپارچه تبدیل رژیم انسولین، مرور درمان فعلی و در فاز بعد تیتراسیون مبتنی بر Ruleهای تاییدشده خواهد بود.",
      status: "فونداسیون طراحی شده؛ موتور تبدیل هنوز به GLYMIZE منتقل نشده است.",
      safety: "تا تکمیل انتقال و تست regression، این صفحه هیچ دوز، تبدیل واحد یا دستور تیتراسیون تولید نمی‌کند.",
      items: [
        { title: "Insulin conversion", body: "Basal، Premix، Prandial و FRC با قواعد جهت‌دار و کنترل‌های ایمنی." },
        { title: "Contextual launch", body: "اگر درمان فعلی بیمار شامل انسولین باشد، ابزار با رژیم، دوز و دفعات مصرف از Type 1/Type 2 باز می‌شود." },
        { title: "Dose & titration", body: "پس از تکمیل Dose Knowledge Base، تیتراسیون فقط از Rule نسخه‌بندی‌شده و تاییدشده اجرا می‌شود." },
      ],
    },
    en: {
      eyebrow: "Insulin Management",
      title: "Insulin calculation and management",
      intro: "This workspace will unify insulin-regimen conversion, current-therapy review, and later titration using approved rules.",
      status: "The workspace foundation is designed; conversion logic has not yet been ported into GLYMIZE.",
      safety: "Until the port and regression tests are complete, this page produces no doses, unit conversions, or titration instructions.",
      items: [
        { title: "Insulin conversion", body: "Basal, premix, prandial, and FRC pathways with direction-specific rules and safety controls." },
        { title: "Contextual launch", body: "When current therapy contains insulin, this tool can open from Type 1/Type 2 with regimen, dose, and frequency prefilled." },
        { title: "Dose & titration", body: "After the Dose Knowledge Base is complete, titration will run only from versioned, approved rules." },
      ],
    },
  },
  care_team: {
    fa: {
      eyebrow: "Pre-Visit Workspace",
      title: "پنل دستیار / پرستار",
      intro: "فضای آماده‌سازی بیمار پیش از ویزیت برای ثبت اطلاعات پایه، علائم حیاتی، آزمایش‌ها و داروهای فعلی و تحویل ساختاریافته به پزشک.",
      status: "طراحی محصول مشخص است؛ ذخیره اطلاعات بیمار تا تکمیل RBAC و امنیت فعال نمی‌شود.",
      safety: "OCR فقط ابزار ورود داده است. نتیجه اسکن باید Review و تایید شود و مقدار کم‌اطمینان نباید خودکار وارد Recommendation Engine شود.",
      items: [
        { title: "Pre-visit intake", body: "جستجو/ایجاد Patient Code، اطلاعات پایه، vitals، داروهای فعلی و سابقه بالینی." },
        { title: "Lab scan + OCR", body: "عکس مستقیم با موبایل یا PDF، استخراج نام آزمایش، مقدار، واحد، رنج مرجع و تاریخ همراه confidence." },
        { title: "Physician handoff", body: "داده‌ها با وضعیت unverified/confirmed و audit trail به پزشک تحویل می‌شوند و پزشک قبل از تصمیم آنها را مرور می‌کند." },
      ],
    },
    en: {
      eyebrow: "Pre-Visit Workspace",
      title: "Assistant / nurse panel",
      intro: "A pre-visit workspace for structured demographics, vitals, labs, current medications, and physician handoff.",
      status: "The product flow is defined; patient-data persistence remains disabled until RBAC and security are complete.",
      safety: "OCR is an input aid, not a clinical source of truth. Scanned values require review, and low-confidence fields must never silently enter the recommendation engine.",
      items: [
        { title: "Pre-visit intake", body: "Find/create a Patient Code and enter basic data, vitals, current medications, and history." },
        { title: "Lab scan + OCR", body: "Mobile camera or PDF capture with test name, value, unit, reference range, date, and field-level confidence." },
        { title: "Physician handoff", body: "Data is handed to the physician with unverified/confirmed state and audit trail for review before clinical use." },
      ],
    },
  },
};

export default function FutureWorkspace({ kind }: { kind: WorkspaceKind }) {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[kind][locale];
  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <Link className={styles.back} href="/dashboard">{isRtl ? "→" : "←"} {locale === "fa" ? "بازگشت به داشبورد" : "Back to dashboard"}</Link>
      <header className={styles.header}>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <span className={styles.status}>{copy.status}</span>
      </header>
      <section className={styles.grid}>
        {copy.items.map((item, index) => (
          <article className={styles.card} key={item.title}>
            <span className={styles.number}>{index + 1}</span>
            <div><h2>{item.title}</h2><p>{item.body}</p></div>
          </article>
        ))}
      </section>
      <section className={styles.safety}><strong>{locale === "fa" ? "مرز ایمنی" : "Safety boundary"}</strong><p>{copy.safety}</p></section>
    </main>
  );
}
