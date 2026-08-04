"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type {
  InsuranceProvider,
  Type2AssessmentResult,
  Type2CostPreference,
  Type2DecisionFactor,
  Type2RoutePreference,
  Type2Workflow,
} from "@glymize/contracts";

import { apiFetch } from "../../lib/api-client";
import MedicationMarketDetails from "../components/medication-market-details";
import ClinicalDomainMedications from "../components/clinical-domain-medications";
import { useGlymizeLocale } from "../components/use-glymize-locale";

type Locale = "fa" | "en";

const WORKFLOW_COPY: Record<
  Locale,
  Record<Type2Workflow, { title: string; description: string }>
> = {
  fa: {
    initiation: {
      title: "شروع درمان",
      description:
        "انتخاب درمان آغازین با توجه به فاصلهٔ HbA1c از هدف و عوامل قلبی، کلیوی و وزن.",
    },
    intensification: {
      title: "تشدید درمان",
      description:
        "مرور کنترل ناکافی و اولویت‌بندی درمان ترکیبی، GLP-1/GIP یا مسیر انسولین.",
    },
  },
  en: {
    initiation: {
      title: "Treatment initiation",
      description:
        "Select initial therapy according to the HbA1c gap, individualized target, and cardiovascular, kidney, and weight-related factors.",
    },
    intensification: {
      title: "Treatment intensification",
      description:
        "Review inadequate control and prioritize combination therapy, a GLP-1/GIP pathway, or an insulin pathway.",
    },
  },
};

const DECISION_FACTORS = [
  {
    key: "ascvd",
    clinicalKey: "ascvd",
    fa: "بیماری قلبی‌عروقی آترواسکلروتیک",
    en: "Atherosclerotic cardiovascular disease",
  },
  {
    key: "heartFailure",
    clinicalKey: "heart_failure",
    fa: "نارسایی قلبی",
    en: "Heart failure",
  },
  {
    key: "ckd",
    clinicalKey: "ckd",
    fa: "بیماری مزمن کلیه",
    en: "Chronic kidney disease",
  },
  {
    key: "hypoglycemia",
    clinicalKey: "hypoglycemia_risk",
    fa: "ریسک بالای هیپوگلیسمی",
    en: "High hypoglycemia risk",
  },
  {
    key: "weight",
    clinicalKey: "weight_priority",
    fa: "کاهش وزن در اولویت است",
    en: "Weight reduction is a priority",
  },
  {
    key: "insulin",
    clinicalKey: "insulin_pathway",
    fa: "بررسی مسیر انسولین یا FRC",
    en: "Consider an insulin or FRC pathway",
  },
] as const;

const COPY = {
  fa: {
    back: "بازگشت به داشبورد",
    eyebrow: "پشتیبانی تصمیم دیابت نوع ۲",
    title: "ارزیابی دیابت نوع ۲",
    intro:
      "HbA1c فعلی و هدف فردی را وارد کنید؛ هیچ نام یا شناسه‌ای از بیمار دریافت نمی‌شود.",
    workflowAria: "نوع ارزیابی",
    currentHba1c: "HbA1c فعلی",
    targetHba1c: "HbA1c هدف (Goal)",
    affordabilityTitle: "توان پرداخت هزینهٔ دارو",
    affordabilitySubtitle:
      "برای حذف گزینه‌های گران و نمایش جایگزین‌های مناسب‌تر",
    routeTitle: "ترجیح مسیر مصرف بیمار",
    routeSubtitle: "عدم تمایل به تزریق در فیلتر داروها لحاظ می‌شود",
    oralOnly: "فقط داروی خوراکی",
    oralOnlyDescription: "تمام فرآورده‌های تزریقی حذف می‌شوند.",
    oralInjectable: "خوراکی و تزریقی مجاز",
    oralInjectableDescription:
      "هر دو مسیر بر اساس اولویت بالینی نمایش داده می‌شوند.",
    factorsTitle: "عوامل تصمیم‌گیری",
    factorsSubtitle: "هر موردی که برای بیمار صدق می‌کند انتخاب شود",
    hyperglycemia: "علائم واضح هایپرگلیسمی",
    catabolic: "کاهش وزن ناخواسته یا شواهد کاتابولیسم",
    calculate: "نمایش مسیر و داروهای فعال",
    emptyTitle: "نتیجه اینجا نمایش داده می‌شود",
    emptyText: "اطلاعات HbA1c و عوامل بالینی را تکمیل کنید.",
    pathwayPriority: "اولویت مسیر",
    gap: "فاصله از هدف",
    selectedFactors: "عوامل انتخاب‌شده",
    tripleEyebrow: "درمان سه‌دارویی",
    tripleTitle: "ترکیب درمانی سه‌دارویی را نیز بررسی کنید",
    tripleText:
      "رژیم سه‌دارویی بر اساس کلاس‌های مناسب بیمار ساخته می‌شود؛ فرآورده یا برند سه‌جزئی بازار ایران باید جداگانه با TTAC تطبیق داده شود.",
    triple1: "متفورمین + SGLT2 + DPP-4",
    triple2: "متفورمین + عامل قلبی‌ـ‌کلیوی + عامل مکمل",
    triple3:
      "در صورت پذیرش تزریق: درمان خوراکی + GLP-1 یا انسولین پایه",
    medicationTitle: "داروها به ترتیب تطابق، ایمنی و هزینه",
    medicationSubtitle:
      "سبز پررنگ یعنی تطابق بیشتر با داده‌های واردشده؛ زرد یعنی نیاز بیشتر به موازنهٔ مزایا، خطرها و هزینه.",
    medicationCount: "دارو",
    genericName: "نام ژنریک",
    insuranceCovered: "دارای پوشش بیمه",
    insuranceMissing: "بدون پوشش بیمه ثبت‌شده",
    risks: "ریسک‌ها و معایب",
    cautions: "احتیاط‌ها",
    lowerPriority: "اولویت پایین‌تر",
    medicineReference: "مرجع دارو",
    emptyCatalogTitle: "هنوز دارویی در کاتالوگ فعال نشده است.",
    emptyCatalogText:
      "مدیر پروژه می‌تواند از مسیر مستقیم /admin وارد صفحهٔ انتخاب دارو شود.",
    validation:
      "HbA1c فعلی و هدف را با عدد معتبر وارد کنید.",
    calculating: "در حال اولویت‌بندی مسیر و داروهای فعال…",
    calculated:
      "نتیجه بر اساس داده‌های همین نشست و داروهای فعال کاتالوگ آماده شد.",
    calculationFailed:
      "محاسبهٔ بالینی انجام نشد؛ صفحه را بازخوانی و دوباره تلاش کنید.",
  },
  en: {
    back: "Back to Dashboard",
    eyebrow: "TYPE 2 DECISION SUPPORT",
    title: "Type 2 Diabetes Assessment",
    intro:
      "Enter the current HbA1c and individualized target. No patient name or identifier is collected.",
    workflowAria: "Assessment workflow",
    currentHba1c: "Current HbA1c",
    targetHba1c: "Target HbA1c (Goal)",
    affordabilityTitle: "Medication affordability and cost",
    affordabilitySubtitle:
      "Use this section to remove costly options and display more suitable alternatives.",
    routeTitle: "Preferred route of administration",
    routeSubtitle:
      "A preference to avoid injections is included in medication filtering.",
    oralOnly: "Oral medicines only",
    oralOnlyDescription: "All injectable products are excluded.",
    oralInjectable: "Oral and injectable medicines",
    oralInjectableDescription:
      "Both routes are displayed according to clinical priority.",
    factorsTitle: "Clinical decision factors",
    factorsSubtitle: "Select every factor that applies to this patient.",
    hyperglycemia: "Clear symptoms of hyperglycemia",
    catabolic: "Unintentional weight loss or evidence of catabolism",
    calculate: "Show pathway and active medicines",
    emptyTitle: "The result will appear here",
    emptyText: "Complete the HbA1c values and clinical factors.",
    pathwayPriority: "Pathway priority",
    gap: "Gap from target",
    selectedFactors: "Selected factors",
    tripleEyebrow: "TRIPLE THERAPY",
    tripleTitle: "Also consider an appropriate three-drug regimen",
    tripleText:
      "A three-drug regimen should be constructed from patient-appropriate classes. Any three-component Iranian product or brand must be verified separately against TTAC.",
    triple1: "Metformin + SGLT2 inhibitor + DPP-4 inhibitor",
    triple2:
      "Metformin + cardiorenal agent + complementary glucose-lowering agent",
    triple3:
      "When injections are acceptable: oral therapy + GLP-1 therapy or basal insulin",
    medicationTitle: "Medicines ranked by clinical fit, safety, and cost",
    medicationSubtitle:
      "Dark green indicates a closer fit with the entered data; yellow indicates a greater need to balance benefits, risks, and cost.",
    medicationCount: "medicines",
    genericName: "Generic name",
    insuranceCovered: "Insurance coverage recorded",
    insuranceMissing: "No insurance coverage recorded",
    risks: "Risks and disadvantages",
    cautions: "Cautions",
    lowerPriority: "Lower priority",
    medicineReference: "Medicine reference",
    emptyCatalogTitle: "No medicines are active in the catalogue yet.",
    emptyCatalogText:
      "A project administrator can open /admin directly to select visible medicines.",
    validation:
      "Enter valid numeric values for the current and target HbA1c.",
    calculating: "Prioritizing the pathway and active medicines…",
    calculated:
      "The result was generated from this session's data and the active catalogue.",
    calculationFailed:
      "The clinical calculation failed. Refresh the page and try again.",
  },
} as const;

const COST_COPY: Record<
  Locale,
  Record<Type2CostPreference, { title: string; description: string }>
> = {
  fa: {
    no_constraint: {
      title: "محدودیت هزینه ندارد",
      description: "رتبه‌بندی عمدتاً بالینی و ایمنی است.",
    },
    moderate: {
      title: "هزینه مهم است",
      description:
        "هزینه در امتیازدهی اثر دارد، اما گزینه‌های مهم حذف نمی‌شوند.",
    },
    low_cost_only: {
      title: "فقط گزینه‌های کم‌هزینه‌تر",
      description:
        "GLP-1، GIP/GLP-1 و ترکیب‌های ثابت پرهزینه فیلتر می‌شوند.",
    },
    insured_only: {
      title: "فقط داروهای دارای پوشش بیمه",
      description:
        "داروهای بدون بیمه حذف و درصد پوشش در رتبه‌بندی لحاظ می‌شود.",
    },
  },
  en: {
    no_constraint: {
      title: "No cost limitation",
      description:
        "Ranking is driven primarily by clinical recommendation and safety.",
    },
    moderate: {
      title: "Cost matters",
      description:
        "Cost affects ranking, but clinically important options are not removed.",
    },
    low_cost_only: {
      title: "Lower-cost options only",
      description:
        "Higher-cost GLP-1, GIP/GLP-1, and fixed-ratio options are filtered out.",
    },
    insured_only: {
      title: "Insurance-covered medicines only",
      description:
        "Uncovered medicines are removed and coverage percentage affects ranking.",
    },
  },
};

const INSURANCE_LABELS: Record<
  Locale,
  Record<InsuranceProvider, string>
> = {
  fa: {
    social_security: "بیمه تأمین اجتماعی",
    health_insurance: "بیمه سلامت",
    armed_forces: "بیمه نیروهای مسلح",
    other_organizations: "سایر ارگان‌ها",
    supplementary: "بیمه تکمیلی",
  },
  en: {
    social_security: "Social Security Insurance",
    health_insurance: "Health Insurance",
    armed_forces: "Armed Forces Insurance",
    other_organizations: "Other organizations",
    supplementary: "Supplementary insurance",
  },
};

const TIER_LABELS = {
  fa: {
    recommended: "پیشنهاد قوی‌تر",
    preferred: "اولویت مناسب",
    consider: "قابل بررسی",
  },
  en: {
    recommended: "Higher-fit option",
    preferred: "Preferred option",
    consider: "Consider",
  },
} as const;

const RELATIVE_COST_LABELS = {
  fa: {
    low: "هزینه نسبی پایین",
    medium: "هزینه نسبی متوسط",
    high: "هزینه نسبی بالا",
  },
  en: {
    low: "Lower relative cost",
    medium: "Moderate relative cost",
    high: "Higher relative cost",
  },
} as const;

const CLINICAL_TRANSLATIONS: Record<string, string> = {
  "هماهنگ با مسیر انسولین در هایپرگلیسمی شدید":
    "Aligned with the insulin pathway in severe hyperglycemia",
  "اولویت انسولین پایه گلارژین":
    "Basal insulin glargine is prioritized",
  "هماهنگ با اولویت درمان مبتنی بر GLP-1 در این مسیر":
    "Aligned with the GLP-1-based treatment priority for this pathway",
  "اولویت قلبی‌ـ‌کلیوی برای HF/CKD":
    "Cardiorenal priority for heart failure or chronic kidney disease",
  "قابل بررسی با توجه به منفعت قلبی‌ـ‌کلیوی":
    "May be considered for potential cardiorenal benefit",
  "اولویت فرآورده‌های دارای شواهد پیامد قلبی‌عروقی":
    "Priority for products with cardiovascular outcome evidence",
  "اثر مطلوب‌تر بر وزن":
    "More favorable effect on weight",
  "اثر وزن‌خنثی تا کاهنده":
    "Weight-neutral to weight-reducing effect",
  "ریسک ذاتی پایین‌تر هیپوگلیسمی":
    "Lower intrinsic risk of hypoglycemia",
  "در گروه کم‌هزینه‌تر گایدلاین":
    "Falls within a lower-cost guideline group",
  "تناسب بهتر با محدودیت هزینه":
    "Better fit with the stated cost preference",
  "ریسک هیپوگلیسمی و احتمال افزایش وزن":
    "Risk of hypoglycemia and possible weight gain",
  "احتباس مایع، افزایش وزن و افزایش ریسک شکستگی؛ در نارسایی قلبی نامناسب":
    "Fluid retention, weight gain, and increased fracture risk; unsuitable in heart failure",
  "عفونت تناسلی‌ـ‌ادراری، کاهش حجم و خطر کتواسیدوز یوگلایسمیک در شرایط مستعد":
    "Genitourinary infection, volume depletion, and euglycemic ketoacidosis risk in susceptible settings",
  "عوارض گوارشی؛ بررسی سابقه پانکراتیت و هشدارهای اختصاصی فرآورده":
    "Gastrointestinal adverse effects; review pancreatitis history and product-specific warnings",
  "بررسی تنظیم دوز کلیوی؛ هشدار نارسایی قلبی برای برخی اعضای کلاس":
    "Review renal dose adjustment; some class members carry heart-failure warnings",
  "عدم تحمل گوارشی و کمبود B12؛ منع مصرف در eGFR کمتر از ۳۰":
    "Gastrointestinal intolerance and vitamin B12 deficiency; contraindicated when eGFR is below 30",
  "عوارض و منع مصرف اختصاصی برچسب فرآورده باید بررسی شود":
    "Product-specific adverse effects and contraindications must be reviewed",
  "داروی پایهٔ رایج؛ وضعیت کلیه، تحمل گوارشی و B12 باید در تصمیم پزشک لحاظ شود.":
    "A commonly used foundational medicine; kidney function, gastrointestinal tolerance, and vitamin B12 status should inform the clinician's decision.",
  "در نارسایی قلبی، گزینه‌های دارای شواهد این کلاس در اولویت بررسی قرار می‌گیرند.":
    "In heart failure, class members with supporting evidence should receive priority consideration.",
  "در CKD، منفعت قلبی-کلیوی و آستانهٔ eGFR هر فرآورده باید با برچسب و پروتکل بررسی شود.":
    "In CKD, cardiorenal benefit and the product-specific eGFR threshold should be checked against the label and protocol.",
  "خطرات حجم/فشارخون، عفونت‌های تناسلی-ادراری و وضعیت بالینی حاد باید توسط پزشک مرور شود.":
    "Volume and blood-pressure effects, genitourinary infections, and acute clinical illness should be reviewed by the clinician.",
  "تحمل گوارشی، سابقهٔ پانکراتیت و هشدارهای اختصاصی برچسب باید مرور شود.":
    "Gastrointestinal tolerability, pancreatitis history, and product-specific label warnings should be reviewed.",
  "هم‌زمانی با DPP-4 inhibitor به‌عنوان ترکیب معمول در این ابزار پیشنهاد نمی‌شود.":
    "Routine combination with a DPP-4 inhibitor is not recommended by this tool.",
  "گزینهٔ خوراکی با خطر هیپوگلیسمی پایین در نبود ترکیب‌های هیپوگلیسمی‌زا.":
    "An oral option with low hypoglycemia risk when not combined with hypoglycemia-prone therapies.",
  "در اغلب اعضای کلاس، تنظیمات مرتبط با عملکرد کلیه باید بررسی شود.":
    "Renal-function-related dose adjustments should be reviewed for most class members.",
  "خطر هیپوگلیسمی و افزایش وزن؛ در ریسک بالای هیپوگلیسمی با احتیاط بررسی شود.":
    "Hypoglycemia and weight-gain risk; use caution when hypoglycemia risk is high.",
  "احتباس مایع، افزایش وزن، شکستگی و هشدارهای اختصاصی برچسب باید مرور شود.":
    "Fluid retention, weight gain, fracture risk, and product-specific label warnings should be reviewed.",
  "مسیر انسولین با توجه به HbA1c، علائم هایپرگلیسمی، شواهد کاتابولیسم و وضعیت درمان فعلی بررسی می‌شود.":
    "The insulin pathway is considered according to HbA1c, hyperglycemia symptoms, catabolic features, and the current treatment regimen.",
  "این نسخهٔ برنامه هیچ دوز، تیتر کردن یا تبدیل واحد انسولین تولید نمی‌کند.":
    "This version does not generate insulin doses, titration instructions, or insulin-unit conversions.",
  "ریسک هیپوگلیسمی باید در انتخاب فرآورده و طرح پایش لحاظ شود.":
    "Hypoglycemia risk should inform product selection and the monitoring plan.",
};

function translateClinicalText(text: string, locale: Locale): string {
  if (locale === "fa") return text;

  const exact = CLINICAL_TRANSLATIONS[text];
  if (exact) return exact;

  const coverageMatch = text.match(/^پوشش بیمه تا (\d+)٪$/);
  if (coverageMatch) {
    return `Insurance coverage up to ${coverageMatch[1]}%`;
  }

  const hba1cMatch = text.match(
    /^HbA1c فعلی ([\d.]+)٪ و هدف فردی ([\d.]+)٪ است؛ فاصله ([\d.]+) واحد درصد\.$/,
  );
  if (hba1cMatch) {
    return `Current HbA1c is ${hba1cMatch[1]}%, the individualized target is ${hba1cMatch[2]}%, and the gap is ${hba1cMatch[3]} percentage points.`;
  }

  return text;
}

function translateRecommendationTitle(text: string, locale: Locale): string {
  if (locale === "fa") return text;

  const titles: Record<string, string> = {
    "انسولین را به‌عنوان درمان تزریقی اولیه بررسی کنید":
      "Consider insulin as the initial injectable therapy",
    "درمان ترکیبی با اولویت GLP-1 یا GIP/GLP-1 را بررسی کنید":
      "Consider combination therapy with priority for GLP-1 or GIP/GLP-1 therapy",
    "درمان اولیهٔ فردمحور را انتخاب کنید":
      "Select an individualized initial treatment",
    "درمان فعلی را تشدید کنید": "Intensify the current treatment",
    "هدف فعلی حفظ شده است؛ پایش و بازبینی ادامه یابد":
      "The current target is maintained; continue monitoring and review",
  };
  return titles[text] ?? text;
}

export default function Type2Page() {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];
  const workflowCopy = WORKFLOW_COPY[locale];

  const [workflow, setWorkflow] =
    useState<Type2Workflow>("initiation");
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [result, setResult] = useState<Type2AssessmentResult | null>(null);
  const [requestMessage, setRequestMessage] = useState("");

  const selectedLabels = useMemo(
    () =>
      DECISION_FACTORS.filter(({ key }) =>
        selectedFactors.includes(key),
      ).map((factor) => factor[locale]),
    [locale, selectedFactors],
  );

  const sortedMedications = result?.medications ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentHba1c = Number(form.get("currentHba1c"));
    const targetHba1c = Number(form.get("targetHba1c"));
    const eGfrRaw = String(form.get("egfr") ?? "").trim();
    const eGfr = eGfrRaw ? Number(eGfrRaw) : undefined;

    if (
      !Number.isFinite(currentHba1c) ||
      !Number.isFinite(targetHba1c) ||
      currentHba1c < 3 ||
      currentHba1c > 20 ||
      targetHba1c < 4 ||
      targetHba1c > 12
    ) {
      setRequestMessage(copy.validation);
      setResult(null);
      return;
    }

    const factors = DECISION_FACTORS.filter(({ key }) =>
      selectedFactors.includes(key),
    ).map(({ clinicalKey }) => clinicalKey) as Type2DecisionFactor[];

    setRequestMessage(copy.calculating);

    try {
      const response = await apiFetch(
        "/v1/catalog/type-2/considerations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            currentHba1c,
            targetHba1c,
            workflow,
            costPreference: String(
              form.get("costPreference"),
            ) as Type2CostPreference,
            routePreference: String(
              form.get("routePreference"),
            ) as Type2RoutePreference,
            eGfr: Number.isFinite(eGfr) ? eGfr : undefined,
            hyperglycemiaSymptoms:
              form.get("hyperglycemiaSymptoms") === "on",
            catabolicFeatures: form.get("catabolicFeatures") === "on",
            factors,
          }),
        },
      );

      if (!response.ok) throw new Error("API unavailable");

      setResult((await response.json()) as Type2AssessmentResult);
      setRequestMessage(copy.calculated);
    } catch {
      setResult(null);
      setRequestMessage(copy.calculationFailed);
    }
  }

  function toggleFactor(key: string) {
    setSelectedFactors((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  return (
    <main
      className="type2-page"
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
    >
      <Link className="back-button" href="/">
        {isRtl ? "→" : "←"} {copy.back}
      </Link>

      <header className="page-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <span className="version-badge">ADA 2026</span>
      </header>

      <section
        className="workflow-switch"
        aria-label={copy.workflowAria}
      >
        {(Object.keys(workflowCopy) as Type2Workflow[]).map((key) => (
          <button
            className={workflow === key ? "selected" : "secondary"}
            key={key}
            onClick={() => {
              setWorkflow(key);
              setResult(null);
            }}
            type="button"
          >
            {workflowCopy[key].title}
          </button>
        ))}
      </section>

      <div className="assessment-layout">
        <form className="calculator-card" onSubmit={submit}>
          <div className="form-section-title">
            <span>1</span>
            <div>
              <strong>{workflowCopy[workflow].title}</strong>
              <small>{workflowCopy[workflow].description}</small>
            </div>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>{copy.currentHba1c}</span>
              <span className="input-with-unit glymize-numeric-field">
                <input
                  inputMode="decimal"
                  min="3"
                  max="20"
                  name="currentHba1c"
                  placeholder="8.7"
                  required
                  step="0.1"
                  type="number"
                />
                <b>%</b>
              </span>
            </label>

            <label className="field">
              <span>{copy.targetHba1c}</span>
              <span className="input-with-unit glymize-numeric-field">
                <input
                  defaultValue="7"
                  inputMode="decimal"
                  min="4"
                  max="12"
                  name="targetHba1c"
                  required
                  step="0.1"
                  type="number"
                />
                <b>%</b>
              </span>
            </label>

            <label className="field">
              <span>eGFR</span>
              <span className="input-with-unit glymize-numeric-field">
                <input
                  inputMode="decimal"
                  min="1"
                  max="200"
                  name="egfr"
                  placeholder="58"
                  type="number"
                />
                <b>mL/min</b>
              </span>
            </label>
          </div>

          <div className="form-divider" />

          <div className="form-section-title">
            <span>2</span>
            <div>
              <strong>{copy.affordabilityTitle}</strong>
              <small>{copy.affordabilitySubtitle}</small>
            </div>
          </div>

          <div className="cost-options">
            {(
              Object.entries(COST_COPY[locale]) as [
                Type2CostPreference,
                { title: string; description: string },
              ][]
            ).map(([value, option]) => (
              <label className="cost-option" key={value}>
                <input
                  defaultChecked={value === "moderate"}
                  name="costPreference"
                  type="radio"
                  value={value}
                />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>

          <div className="form-divider" />

          <div className="form-section-title">
            <span>3</span>
            <div>
              <strong>{copy.routeTitle}</strong>
              <small>{copy.routeSubtitle}</small>
            </div>
          </div>

          <div className="route-options">
            <label className="cost-option">
              <input
                name="routePreference"
                type="radio"
                value="oral_only"
              />
              <span>
                <strong>{copy.oralOnly}</strong>
                <small>{copy.oralOnlyDescription}</small>
              </span>
            </label>

            <label className="cost-option">
              <input
                defaultChecked
                name="routePreference"
                type="radio"
                value="oral_and_injectable"
              />
              <span>
                <strong>{copy.oralInjectable}</strong>
                <small>{copy.oralInjectableDescription}</small>
              </span>
            </label>
          </div>

          <div className="form-divider" />

          <div className="form-section-title">
            <span>4</span>
            <div>
              <strong>{copy.factorsTitle}</strong>
              <small>{copy.factorsSubtitle}</small>
            </div>
          </div>

          <div className="check-grid">
            {DECISION_FACTORS.map((factor) => (
              <label className="checkbox-card" key={factor.key}>
                <input
                  checked={selectedFactors.includes(factor.key)}
                  onChange={() => toggleFactor(factor.key)}
                  type="checkbox"
                />
                <span>{factor[locale]}</span>
              </label>
            ))}

            <label className="checkbox-card urgent">
              <input
                name="hyperglycemiaSymptoms"
                type="checkbox"
              />
              <span>{copy.hyperglycemia}</span>
            </label>

            <label className="checkbox-card urgent">
              <input name="catabolicFeatures" type="checkbox" />
              <span>{copy.catabolic}</span>
            </label>
          </div>

          <p className="form-message" role="status">
            {requestMessage}
          </p>

          <button
            className="primary-button calculate-button"
            type="submit"
          >
            <span>{copy.calculate}</span>
            <span>{isRtl ? "←" : "→"}</span>
          </button>
        </form>

        <aside className="result-panel" aria-live="polite">
          {!result ? (
            <div className="empty-result">
              <div className="result-placeholder">⌁</div>
              <h2>{copy.emptyTitle}</h2>
              <p>{copy.emptyText}</p>
            </div>
          ) : (
            <div className="result-content">
              <span className="result-label">
                {copy.pathwayPriority}
              </span>
              <h2>
                {translateRecommendationTitle(
                  result.recommendation.title,
                  locale,
                )}
              </h2>

              <div
                className={
                  result.recommendation.urgentReview
                    ? "clinical-warning danger"
                    : "clinical-warning"
                }
              >
                <strong>
                  {copy.gap}:{" "}
                  {result.recommendation.hba1cGap.toFixed(1)}%
                </strong>
                <ul>
                  {result.recommendation.rationale.map((item) => (
                    <li key={item}>
                      {translateClinicalText(item, locale)}
                    </li>
                  ))}
                </ul>
              </div>

              {selectedLabels.length > 0 && (
                <p className="muted">
                  {copy.selectedFactors}:{" "}
                  {selectedLabels.join(isRtl ? "، " : ", ")}
                </p>
              )}

              <a
                className="source-link"
                href={result.recommendation.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {result.recommendation.sourceReference}
              </a>
            </div>
          )}
        </aside>
      </div>

      {result && result.recommendation.hba1cGap >= 1.5 && (
        <section className="triple-therapy-panel">
          <span className="eyebrow">{copy.tripleEyebrow}</span>
          <h2>{copy.tripleTitle}</h2>
          <p>{copy.tripleText}</p>
          <div className="triple-options">
            <span>{copy.triple1}</span>
            <span>{copy.triple2}</span>
            <span>{copy.triple3}</span>
          </div>
        </section>
      )}

      {result && (
        <section className="medication-results">
          <div className="section-heading">
            <div>
              <h2>{copy.medicationTitle}</h2>
              <p>{copy.medicationSubtitle}</p>
            </div>
            <span className="version-badge">
              {sortedMedications.length} {copy.medicationCount}
            </span>
          </div>

          {sortedMedications.length > 0 ? (
            <div className="consideration-grid">
              {sortedMedications.map((item, index) => (
                <article
                  className={`consideration-card priority-${item.priorityTier}`}
                  key={item.cardId ?? item.genericMedicationId}
                >
                  <div className="priority-row">
                    <span className="priority-badge">
                      #{index + 1} ·{" "}
                      {TIER_LABELS[locale][item.priorityTier]}
                    </span>
                    <span className="cost-chip">
                      {
                        RELATIVE_COST_LABELS[locale][
                          item.relativeCost
                        ]
                      }
                    </span>
                  </div>

                  <h3>
                    {item.displayName ?? item.persianName}
                  </h3>

                  {item.selectedBrandName && (
                    <p className="generic-name-note">
                      {copy.genericName}: {item.persianName}
                    </p>
                  )}

                  <p className="muted">
                    {item.therapeuticClass}
                  </p>

                  <p className="ranking-reason">
                    {item.rankingReasons
                      .map((reason) =>
                        translateClinicalText(reason, locale),
                      )
                      .join(" · ")}
                  </p>

                  <div
                    className={
                      item.insuranceCoverages.length
                        ? "insurance-summary covered"
                        : "insurance-summary"
                    }
                  >
                    <strong>
                      {item.insuranceCoverages.length
                        ? `✓ ${copy.insuranceCovered}`
                        : copy.insuranceMissing}
                    </strong>

                    {item.insuranceCoverages.map((entry) => (
                      <span key={entry.provider}>
                        {
                          INSURANCE_LABELS[locale][
                            entry.provider
                          ]
                        }
                        : {entry.percent}%
                      </span>
                    ))}
                  </div>

                  <MedicationMarketDetails
                    brandRegistryCode={item.brandRegistryCode}
                    coverages={item.insuranceCoverages}
                    genericRegistryCode={item.genericRegistryCode}
                    locale={locale}
                    marketBadge={item.marketBadge}
                    price={item.price}
                    selectedBrands={item.selectedBrands}
                  />

                  <ul>
                    {item.considerations.map((note) => (
                      <li key={note}>
                        {translateClinicalText(note, locale)}
                      </li>
                    ))}
                  </ul>

                  <div className="risk-box">
                    <strong>{copy.risks}</strong>
                    <ul>
                      {item.risks.map((risk) => (
                        <li key={risk}>
                          {translateClinicalText(risk, locale)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {item.cautions.length > 0 && (
                    <div className="caution">
                      <strong>{copy.cautions}</strong>
                      <ul>
                        {item.cautions.map((note) => (
                          <li key={note}>
                            {translateClinicalText(note, locale)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.blockedBy && (
                    <div className="blocked">
                      <strong>{copy.lowerPriority}</strong>
                      <ul>
                        {item.blockedBy.map((note) => (
                          <li key={note}>
                            {translateClinicalText(note, locale)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <a
                    href={item.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {copy.medicineReference}
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-catalog">
              <strong>{copy.emptyCatalogTitle}</strong>
              <p>{copy.emptyCatalogText}</p>
            </div>
          )}
        </section>
      )}
      <ClinicalDomainMedications />
    </main>
  );
}
