"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CurrentMedicationInput,
  CurrentMedicationStatus,
  GenericMedication,
  InsuranceProvider,
  MedicationAdherence,
  MedicationTolerance,
  PatientClinicalContext,
  Type2AssessmentResult,
  Type2CostPreference,
  Type2DecisionFactor,
  Type2RoutePreference,
} from "@glymize/contracts";

import { apiFetch } from "../../lib/api-client";
import ClinicalDomainMedications from "../components/clinical-domain-medications";
import MedicationMarketDetails from "../components/medication-market-details";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./type2-v2.module.css";

type Locale = "fa" | "en";

type MedicationRow = {
  id: string;
  genericMedicationId?: string;
  genericName: string;
  strengthPresentation: string;
  doseAmount: string;
  doseUnit: string;
  frequencyPerDay: string;
  adherence: MedicationAdherence;
  tolerance: MedicationTolerance;
  status: CurrentMedicationStatus;
};

type ContextDraft = {
  priorMi: boolean;
  priorStrokeTia: boolean;
  peripheralArteryDisease: boolean;
  priorRevascularization: boolean;
  lvefPercent: string;
  nyhaClass: "" | "I" | "II" | "III" | "IV";
  systolicBloodPressure: string;
  diastolicBloodPressure: string;
  eGfr: string;
  uacrMgG: string;
  potassiumMmolL: string;
  dialysis: boolean;
  kidneyTransplant: boolean;
  recentAki: boolean;
  astUeL: string;
  altUeL: string;
  plateletCount10e9L: string;
  liverStiffnessKpa: string;
  fibrosisStage: "" | "F0" | "F1" | "F2" | "F3" | "F4" | "unknown";
  cirrhosis: boolean;
  decompensatedCirrhosis: boolean;
  weightKg: string;
  heightCm: string;
  waistCircumferenceCm: string;
};

const EMPTY_CONTEXT: ContextDraft = {
  priorMi: false,
  priorStrokeTia: false,
  peripheralArteryDisease: false,
  priorRevascularization: false,
  lvefPercent: "",
  nyhaClass: "",
  systolicBloodPressure: "",
  diastolicBloodPressure: "",
  eGfr: "",
  uacrMgG: "",
  potassiumMmolL: "",
  dialysis: false,
  kidneyTransplant: false,
  recentAki: false,
  astUeL: "",
  altUeL: "",
  plateletCount10e9L: "",
  liverStiffnessKpa: "",
  fibrosisStage: "",
  cirrhosis: false,
  decompensatedCirrhosis: false,
  weightKg: "",
  heightCm: "",
  waistCircumferenceCm: "",
};

const FACTORS: Array<{
  key: Type2DecisionFactor;
  fa: string;
  en: string;
  faHint: string;
  enHint: string;
}> = [
  {
    key: "ascvd",
    fa: "بیماری قلبی‌عروقی آترواسکلروتیک",
    en: "Atherosclerotic cardiovascular disease",
    faHint: "سابقه MI، سکته/TIA، PAD یا revascularization",
    enHint: "Prior MI, stroke/TIA, PAD, or revascularization",
  },
  {
    key: "heart_failure",
    fa: "نارسایی قلبی",
    en: "Heart failure",
    faHint: "LVEF، NYHA و فشارخون در صورت دسترس",
    enHint: "LVEF, NYHA class, and blood pressure when available",
  },
  {
    key: "ckd",
    fa: "بیماری مزمن کلیه",
    en: "Chronic kidney disease",
    faHint: "eGFR، UACR، پتاسیم، دیالیز/پیوند و AKI اخیر",
    enHint: "eGFR, UACR, potassium, dialysis/transplant, and recent AKI",
  },
  {
    key: "masld_mash",
    fa: "MASLD / MASH یا بیماری کبدی متابولیک",
    en: "MASLD / MASH or metabolic liver disease",
    faHint: "AST، ALT، پلاکت، stiffness و مرحله فیبروز",
    enHint: "AST, ALT, platelets, stiffness, and fibrosis stage",
  },
  {
    key: "weight_priority",
    fa: "کاهش وزن در اولویت است",
    en: "Weight reduction is a priority",
    faHint: "وزن و قد برای محاسبه خودکار BMI",
    enHint: "Weight and height for automatic BMI calculation",
  },
  {
    key: "hypoglycemia_risk",
    fa: "ریسک بالای هیپوگلیسمی",
    en: "High hypoglycemia risk",
    faHint: "در رتبه‌بندی داروهای هیپوگلیسمی‌زا لحاظ می‌شود",
    enHint: "Used to down-rank therapies with greater hypoglycemia risk",
  },
  {
    key: "insulin_pathway",
    fa: "بررسی مسیر انسولین یا FRC",
    en: "Consider an insulin or FRC pathway",
    faHint: "در صورت نیاز، بعداً به ابزار تخصصی انسولین متصل می‌شود",
    enHint: "Will connect contextually to the dedicated insulin module",
  },
];

const COPY = {
  fa: {
    back: "بازگشت به داشبورد",
    eyebrow: "پشتیبانی تصمیم دیابت نوع ۲",
    title: "ارزیابی دیابت نوع ۲",
    intro: "درمان فعلی و داده‌های مرتبط بیمار را وارد کنید؛ موتور نوع ارزیابی را از روی درمان فعال به‌صورت خودکار تشخیص می‌دهد.",
    workflowStart: "شروع درمان",
    workflowOptimize: "بهینه‌سازی / تشدید درمان",
    workflowStartHint: "هیچ داروی فعال ثبت نشده است؛ موتور این نشست را به‌عنوان شروع درمان پردازش می‌کند.",
    workflowOptimizeHint: "حداقل یک داروی فعال ثبت شده است؛ موتور این نشست را به‌عنوان بازبینی و تشدید/بهینه‌سازی درمان پردازش می‌کند.",
    glycemicTitle: "کنترل قند",
    glycemicHint: "مقادیر اصلی تصمیم‌گیری را وارد کنید.",
    currentHba1c: "HbA1c فعلی",
    targetHba1c: "HbA1c هدف",
    medsTitle: "درمان فعلی بیمار",
    medsHint: "نام دارو، دوز و دفعات مصرف برای جلوگیری از تکرار درمان و تشخیص مسیر ضروری است.",
    noMeds: "اگر بیمار هنوز دارویی مصرف نمی‌کند، این بخش را خالی بگذارید.",
    addMed: "افزودن داروی فعلی",
    med: "دارو",
    medName: "نام ژنریک / جستجو در کاتالوگ",
    strength: "قدرت / فرم (اختیاری)",
    dose: "دوز هر نوبت",
    unit: "واحد",
    frequency: "دفعات در روز",
    status: "وضعیت",
    adherence: "پایبندی",
    tolerance: "تحمل",
    remove: "حذف",
    active: "فعال",
    held: "موقتاً قطع",
    stopped: "قطع‌شده",
    adherenceGood: "خوب",
    adherencePartial: "نسبی",
    adherencePoor: "ضعیف",
    adherenceUnknown: "نامشخص",
    toleranceGood: "خوب",
    toleranceLimited: "محدود",
    toleranceIntolerant: "عدم تحمل",
    toleranceUnknown: "نامشخص",
    tdd: "دوز کل روزانه محاسبه‌شده",
    costTitle: "هزینه و دسترسی",
    costHint: "هزینه پس از ایمنی و تناسب بالینی در رتبه‌بندی لحاظ می‌شود.",
    routeTitle: "ترجیح مسیر مصرف",
    routeHint: "عدم تمایل به تزریق در فیلتر گزینه‌ها لحاظ می‌شود.",
    factorsTitle: "عوامل تصمیم‌گیری",
    factorsHint: "هر عامل را انتخاب کنید تا فقط اطلاعات مرتبط همان بخش باز شود.",
    urgentHyper: "علائم واضح هایپرگلیسمی",
    urgentCatabolic: "کاهش وزن ناخواسته یا شواهد کاتابولیسم",
    calculate: "محاسبه و نمایش گزینه‌ها",
    calculating: "در حال ارزیابی مسیر و داروهای فعال…",
    calculated: "نتیجه بر اساس درمان فعلی و داده‌های همین نشست آماده شد.",
    failed: "محاسبه انجام نشد؛ ورودی‌ها و اتصال API را بررسی کنید.",
    validation: "HbA1c فعلی و هدف را با عدد معتبر وارد کنید.",
    resultEmpty: "نتیجه اینجا نمایش داده می‌شود",
    resultEmptyHint: "پس از تکمیل اطلاعات ضروری، محاسبه را اجرا کنید.",
    pathway: "اولویت مسیر",
    gap: "فاصله از هدف",
    medicationTitle: "داروها به ترتیب تناسب بالینی، ایمنی و هزینه",
    medicationHint: "داروی فعلی با برچسب بازبینی مشخص می‌شود و به‌عنوان درمان جدید دوباره پیشنهاد نمی‌شود.",
    generic: "نام ژنریک",
    insuranceCovered: "پوشش بیمه ثبت شده",
    insuranceMissing: "پوشش بیمه ثبت نشده",
    risks: "ریسک‌ها و معایب",
    cautions: "احتیاط‌ها",
    lowerPriority: "علت اولویت پایین‌تر",
    source: "مرجع",
    noCatalog: "گزینه فعال و واجد شرایطی در کاتالوگ پیدا نشد.",
    bmi: "BMI محاسبه‌شده",
  },
  en: {
    back: "Back to Dashboard",
    eyebrow: "TYPE 2 DECISION SUPPORT",
    title: "Type 2 Diabetes Assessment",
    intro: "Enter the current regimen and relevant clinical context. The engine infers initiation versus optimization from active therapy automatically.",
    workflowStart: "Treatment initiation",
    workflowOptimize: "Optimization / intensification",
    workflowStartHint: "No active medicine is recorded, so this encounter is processed as treatment initiation.",
    workflowOptimizeHint: "At least one active medicine is recorded, so this encounter is processed as treatment review and optimization/intensification.",
    glycemicTitle: "Glycemic control",
    glycemicHint: "Enter the core values used for this decision.",
    currentHba1c: "Current HbA1c",
    targetHba1c: "Target HbA1c",
    medsTitle: "Current medication regimen",
    medsHint: "Medicine, dose, and frequency help prevent duplicate therapy and determine the correct pathway.",
    noMeds: "Leave this section empty if the patient is not taking glucose-lowering therapy.",
    addMed: "Add current medicine",
    med: "Medicine",
    medName: "Generic name / search catalogue",
    strength: "Strength / form (optional)",
    dose: "Dose per administration",
    unit: "Unit",
    frequency: "Times per day",
    status: "Status",
    adherence: "Adherence",
    tolerance: "Tolerance",
    remove: "Remove",
    active: "Active",
    held: "Held",
    stopped: "Stopped",
    adherenceGood: "Good",
    adherencePartial: "Partial",
    adherencePoor: "Poor",
    adherenceUnknown: "Unknown",
    toleranceGood: "Good",
    toleranceLimited: "Limited",
    toleranceIntolerant: "Intolerant",
    toleranceUnknown: "Unknown",
    tdd: "Calculated total daily dose",
    costTitle: "Cost and access",
    costHint: "Cost is considered after safety and clinical appropriateness.",
    routeTitle: "Route preference",
    routeHint: "A preference to avoid injections is included in filtering.",
    factorsTitle: "Clinical decision factors",
    factorsHint: "Select a factor to reveal only the information relevant to it.",
    urgentHyper: "Clear symptoms of hyperglycemia",
    urgentCatabolic: "Unintentional weight loss or catabolic features",
    calculate: "Calculate and show options",
    calculating: "Assessing the pathway and active medicines…",
    calculated: "The result was generated from the current regimen and this encounter's data.",
    failed: "The calculation failed. Check the inputs and API connection.",
    validation: "Enter valid numeric values for current and target HbA1c.",
    resultEmpty: "Results will appear here",
    resultEmptyHint: "Complete the required information and run the assessment.",
    pathway: "Pathway priority",
    gap: "Gap from target",
    medicationTitle: "Medicines ranked by clinical fit, safety, and cost",
    medicationHint: "Current therapy is marked for review and is not re-proposed as a new treatment.",
    generic: "Generic name",
    insuranceCovered: "Insurance coverage recorded",
    insuranceMissing: "No insurance coverage recorded",
    risks: "Risks and disadvantages",
    cautions: "Cautions",
    lowerPriority: "Why lower priority",
    source: "Source",
    noCatalog: "No active eligible catalogue option was found.",
    bmi: "Calculated BMI",
  },
} as const;

const COST_OPTIONS: Record<Locale, Array<{ value: Type2CostPreference; title: string; hint: string }>> = {
  fa: [
    { value: "no_constraint", title: "محدودیت هزینه ندارد", hint: "رتبه‌بندی عمدتاً بر اساس تناسب بالینی و ایمنی است." },
    { value: "moderate", title: "هزینه مهم است", hint: "هزینه در رتبه‌بندی اثر دارد، اما گزینه‌های مهم بالینی حذف نمی‌شوند." },
    { value: "low_cost_only", title: "گزینه‌های کم‌هزینه‌تر", hint: "گزینه‌های پرهزینه در صورت وجود جایگزین مناسب پایین‌تر قرار می‌گیرند." },
    { value: "insured_only", title: "فقط داروهای دارای پوشش بیمه", hint: "گزینه‌های بدون پوشش ثبت‌شده فیلتر می‌شوند." },
  ],
  en: [
    { value: "no_constraint", title: "No cost limitation", hint: "Ranking is driven mainly by clinical fit and safety." },
    { value: "moderate", title: "Cost matters", hint: "Cost affects ranking without removing clinically important options." },
    { value: "low_cost_only", title: "Lower-cost options", hint: "Higher-cost choices are down-ranked when an appropriate alternative exists." },
    { value: "insured_only", title: "Insurance-covered medicines only", hint: "Options without recorded coverage are filtered out." },
  ],
};

const ROUTE_OPTIONS: Record<Locale, Array<{ value: Type2RoutePreference; title: string; hint: string }>> = {
  fa: [
    { value: "oral_only", title: "فقط خوراکی", hint: "فرآورده‌های تزریقی از گزینه‌های جدید حذف می‌شوند." },
    { value: "oral_and_injectable", title: "خوراکی و تزریقی مجاز", hint: "هر دو مسیر بر اساس اولویت بالینی قابل نمایش هستند." },
  ],
  en: [
    { value: "oral_only", title: "Oral medicines only", hint: "Injectable products are excluded from new options." },
    { value: "oral_and_injectable", title: "Oral and injectable allowed", hint: "Both routes may be shown according to clinical priority." },
  ],
};

const INSURANCE_LABELS: Record<Locale, Record<InsuranceProvider, string>> = {
  fa: {
    social_security: "تأمین اجتماعی",
    health_insurance: "سلامت",
    armed_forces: "نیروهای مسلح",
    other_organizations: "سایر ارگان‌ها",
    supplementary: "تکمیلی",
  },
  en: {
    social_security: "Social Security",
    health_insurance: "Health Insurance",
    armed_forces: "Armed Forces",
    other_organizations: "Other organizations",
    supplementary: "Supplementary",
  },
};

const ACTION_LABELS = {
  fa: {
    consider_initiation: "شروع قابل بررسی",
    consider_addition: "افزودن قابل بررسی",
    review_current_therapy: "بازبینی درمان فعلی",
    consider_switch: "تغییر قابل بررسی",
  },
  en: {
    consider_initiation: "Consider initiation",
    consider_addition: "Consider addition",
    review_current_therapy: "Review current therapy",
    consider_switch: "Consider switch",
  },
} as const;

function numeric(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function makeMedicationRow(): MedicationRow {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    genericName: "",
    strengthPresentation: "",
    doseAmount: "",
    doseUnit: "mg",
    frequencyPerDay: "",
    adherence: "unknown",
    tolerance: "unknown",
    status: "active",
  };
}

function MeasureField(props: {
  label: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <span className={styles.measure}>
        <input
          inputMode="decimal"
          min={props.min}
          max={props.max}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
          step={props.step ?? "any"}
          type="number"
          value={props.value}
        />
        <span className={styles.unit}>{props.unit}</span>
      </span>
    </label>
  );
}

function translateRecommendationTitle(text: string, locale: Locale) {
  if (locale === "fa") return text;
  const titles: Record<string, string> = {
    "انسولین را به‌عنوان درمان تزریقی اولیه بررسی کنید": "Consider insulin as the initial injectable therapy",
    "درمان ترکیبی با اولویت GLP-1 یا GIP/GLP-1 را بررسی کنید": "Consider combination therapy with priority for GLP-1 or GIP/GLP-1 therapy",
    "درمان اولیهٔ فردمحور را انتخاب کنید": "Select an individualized initial treatment",
    "درمان فعلی را تشدید کنید": "Intensify the current treatment",
    "هدف فعلی حفظ شده است؛ پایش و بازبینی ادامه یابد": "The current target is maintained; continue monitoring and review",
  };
  return titles[text] ?? text;
}

export default function Type2V2Client() {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];
  const [catalog, setCatalog] = useState<GenericMedication[]>([]);
  const [currentHba1c, setCurrentHba1c] = useState("");
  const [targetHba1c, setTargetHba1c] = useState("7");
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [selectedFactors, setSelectedFactors] = useState<Type2DecisionFactor[]>([]);
  const [context, setContext] = useState<ContextDraft>(EMPTY_CONTEXT);
  const [costPreference, setCostPreference] = useState<Type2CostPreference>("moderate");
  const [routePreference, setRoutePreference] = useState<Type2RoutePreference>("oral_and_injectable");
  const [hyperglycemiaSymptoms, setHyperglycemiaSymptoms] = useState(false);
  const [catabolicFeatures, setCatabolicFeatures] = useState(false);
  const [result, setResult] = useState<Type2AssessmentResult | null>(null);
  const [requestMessage, setRequestMessage] = useState("");

  useEffect(() => {
    void apiFetch("/v1/catalog/generics")
      .then((response) => response.ok ? response.json() as Promise<GenericMedication[]> : [])
      .then((items) => setCatalog(items))
      .catch(() => setCatalog([]));
  }, []);

  const activeMedicationCount = useMemo(
    () => medications.filter((item) => item.genericName.trim() && item.status === "active").length,
    [medications],
  );

  const bmi = useMemo(() => {
    const weight = numeric(context.weightKg);
    const heightCm = numeric(context.heightCm);
    if (!weight || !heightCm) return undefined;
    const heightM = heightCm / 100;
    return Math.round((weight / (heightM * heightM)) * 10) / 10;
  }, [context.heightCm, context.weightKg]);

  function updateContext<K extends keyof ContextDraft>(key: K, value: ContextDraft[K]) {
    setContext((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function toggleFactor(key: Type2DecisionFactor) {
    setSelectedFactors((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setResult(null);
  }

  function updateMedication(id: string, patch: Partial<MedicationRow>) {
    setMedications((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setResult(null);
  }

  function updateMedicationName(id: string, value: string) {
    const normalized = value.trim().toLocaleLowerCase();
    const match = catalog.find((item) =>
      item.canonicalName.toLocaleLowerCase() === normalized || item.persianName.toLocaleLowerCase() === normalized,
    );
    updateMedication(id, { genericName: value, genericMedicationId: match?.id });
  }

  function currentMedicationPayload(): CurrentMedicationInput[] {
    return medications
      .filter((item) => item.genericName.trim())
      .map((item) => {
        const doseAmount = numeric(item.doseAmount);
        const frequencyPerDay = numeric(item.frequencyPerDay);
        const totalDailyDose = doseAmount !== undefined && frequencyPerDay !== undefined ? doseAmount * frequencyPerDay : undefined;
        return {
          genericMedicationId: item.genericMedicationId,
          genericName: item.genericName.trim(),
          strengthPresentation: item.strengthPresentation.trim() || undefined,
          doseAmount,
          doseUnit: doseAmount !== undefined ? item.doseUnit : undefined,
          frequencyPerDay,
          totalDailyDose,
          totalDailyDoseUnit: totalDailyDose !== undefined ? item.doseUnit : undefined,
          adherence: item.adherence,
          tolerance: item.tolerance,
          status: item.status,
        };
      });
  }

  function clinicalContextPayload(): PatientClinicalContext {
    return {
      cardiovascular: {
        ascvd: selectedFactors.includes("ascvd"),
        priorMi: context.priorMi,
        priorStrokeTia: context.priorStrokeTia,
        peripheralArteryDisease: context.peripheralArteryDisease,
        priorRevascularization: context.priorRevascularization,
        heartFailure: selectedFactors.includes("heart_failure"),
        lvefPercent: numeric(context.lvefPercent),
        nyhaClass: context.nyhaClass || undefined,
        systolicBloodPressure: numeric(context.systolicBloodPressure),
        diastolicBloodPressure: numeric(context.diastolicBloodPressure),
      },
      kidney: {
        ckd: selectedFactors.includes("ckd"),
        eGfr: numeric(context.eGfr),
        uacrMgG: numeric(context.uacrMgG),
        potassiumMmolL: numeric(context.potassiumMmolL),
        dialysis: context.dialysis,
        kidneyTransplant: context.kidneyTransplant,
        recentAki: context.recentAki,
      },
      liver: {
        masldMash: selectedFactors.includes("masld_mash"),
        astUeL: numeric(context.astUeL),
        altUeL: numeric(context.altUeL),
        plateletCount10e9L: numeric(context.plateletCount10e9L),
        liverStiffnessKpa: numeric(context.liverStiffnessKpa),
        fibrosisStage: context.fibrosisStage || undefined,
        cirrhosis: context.cirrhosis,
        decompensatedCirrhosis: context.decompensatedCirrhosis,
      },
      anthropometrics: {
        weightKg: numeric(context.weightKg),
        heightCm: numeric(context.heightCm),
        bmi,
        waistCircumferenceCm: numeric(context.waistCircumferenceCm),
      },
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = Number(currentHba1c);
    const target = Number(targetHba1c);
    if (!Number.isFinite(current) || !Number.isFinite(target) || current < 3 || current > 20 || target < 4 || target > 12) {
      setResult(null);
      setRequestMessage(copy.validation);
      return;
    }

    setRequestMessage(copy.calculating);
    try {
      const response = await apiFetch("/v1/catalog/type-2/considerations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentHba1c: current,
          targetHba1c: target,
          currentMedications: currentMedicationPayload(),
          clinicalContext: clinicalContextPayload(),
          costPreference,
          routePreference,
          hyperglycemiaSymptoms,
          catabolicFeatures,
          factors: selectedFactors,
        }),
      });
      if (!response.ok) throw new Error("assessment_failed");
      setResult(await response.json() as Type2AssessmentResult);
      setRequestMessage(copy.calculated);
    } catch {
      setResult(null);
      setRequestMessage(copy.failed);
    }
  }

  function factorBody(key: Type2DecisionFactor) {
    if (key === "ascvd") {
      return <div className={styles.inlineChecks}>
        <Check label={locale === "fa" ? "سابقه MI" : "Prior MI"} checked={context.priorMi} onChange={(value) => updateContext("priorMi", value)} />
        <Check label={locale === "fa" ? "سکته مغزی / TIA" : "Stroke / TIA"} checked={context.priorStrokeTia} onChange={(value) => updateContext("priorStrokeTia", value)} />
        <Check label={locale === "fa" ? "بیماری شریان محیطی" : "Peripheral artery disease"} checked={context.peripheralArteryDisease} onChange={(value) => updateContext("peripheralArteryDisease", value)} />
        <Check label={locale === "fa" ? "Revascularization قبلی" : "Prior revascularization"} checked={context.priorRevascularization} onChange={(value) => updateContext("priorRevascularization", value)} />
      </div>;
    }

    if (key === "heart_failure") {
      return <div className={styles.fieldGrid}>
        <MeasureField label="LVEF" value={context.lvefPercent} unit="%" min="1" max="90" step="1" placeholder="40" onChange={(value) => updateContext("lvefPercent", value)} />
        <label className={styles.field}>
          <span>NYHA</span>
          <select value={context.nyhaClass} onChange={(event) => updateContext("nyhaClass", event.target.value as ContextDraft["nyhaClass"])}>
            <option value="">—</option><option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option>
          </select>
        </label>
        <MeasureField label={locale === "fa" ? "فشار سیستولیک" : "Systolic BP"} value={context.systolicBloodPressure} unit="mmHg" min="50" max="260" step="1" placeholder="125" onChange={(value) => updateContext("systolicBloodPressure", value)} />
        <MeasureField label={locale === "fa" ? "فشار دیاستولیک" : "Diastolic BP"} value={context.diastolicBloodPressure} unit="mmHg" min="30" max="160" step="1" placeholder="75" onChange={(value) => updateContext("diastolicBloodPressure", value)} />
      </div>;
    }

    if (key === "ckd") {
      return <>
        <div className={styles.fieldGrid}>
          <MeasureField label="eGFR" value={context.eGfr} unit="mL/min/1.73m²" min="1" max="200" step="1" placeholder="58" onChange={(value) => updateContext("eGfr", value)} />
          <MeasureField label="UACR" value={context.uacrMgG} unit="mg/g" min="0" max="10000" step="1" placeholder="120" onChange={(value) => updateContext("uacrMgG", value)} />
          <MeasureField label={locale === "fa" ? "پتاسیم" : "Potassium"} value={context.potassiumMmolL} unit="mmol/L" min="1" max="10" step="0.1" placeholder="4.4" onChange={(value) => updateContext("potassiumMmolL", value)} />
        </div>
        <div className={styles.inlineChecks} style={{ marginTop: 10 }}>
          <Check label={locale === "fa" ? "دیالیز" : "Dialysis"} checked={context.dialysis} onChange={(value) => updateContext("dialysis", value)} />
          <Check label={locale === "fa" ? "پیوند کلیه" : "Kidney transplant"} checked={context.kidneyTransplant} onChange={(value) => updateContext("kidneyTransplant", value)} />
          <Check label={locale === "fa" ? "AKI اخیر" : "Recent AKI"} checked={context.recentAki} onChange={(value) => updateContext("recentAki", value)} />
        </div>
      </>;
    }

    if (key === "masld_mash") {
      return <>
        <div className={styles.fieldGrid}>
          <MeasureField label="AST" value={context.astUeL} unit="U/L" min="0" max="5000" step="1" placeholder="32" onChange={(value) => updateContext("astUeL", value)} />
          <MeasureField label="ALT" value={context.altUeL} unit="U/L" min="0" max="5000" step="1" placeholder="42" onChange={(value) => updateContext("altUeL", value)} />
          <MeasureField label={locale === "fa" ? "پلاکت" : "Platelets"} value={context.plateletCount10e9L} unit="10⁹/L" min="1" max="2000" step="1" placeholder="220" onChange={(value) => updateContext("plateletCount10e9L", value)} />
          <MeasureField label={locale === "fa" ? "Liver stiffness" : "Liver stiffness"} value={context.liverStiffnessKpa} unit="kPa" min="0" max="100" step="0.1" placeholder="8.2" onChange={(value) => updateContext("liverStiffnessKpa", value)} />
          <label className={styles.field}>
            <span>{locale === "fa" ? "مرحله فیبروز" : "Fibrosis stage"}</span>
            <select value={context.fibrosisStage} onChange={(event) => updateContext("fibrosisStage", event.target.value as ContextDraft["fibrosisStage"])}>
              <option value="">—</option><option value="F0">F0</option><option value="F1">F1</option><option value="F2">F2</option><option value="F3">F3</option><option value="F4">F4</option><option value="unknown">Unknown</option>
            </select>
          </label>
        </div>
        <div className={styles.inlineChecks} style={{ marginTop: 10 }}>
          <Check label={locale === "fa" ? "سیروز" : "Cirrhosis"} checked={context.cirrhosis} onChange={(value) => updateContext("cirrhosis", value)} />
          <Check label={locale === "fa" ? "سیروز دکامپنسیه" : "Decompensated cirrhosis"} checked={context.decompensatedCirrhosis} onChange={(value) => updateContext("decompensatedCirrhosis", value)} />
        </div>
      </>;
    }

    if (key === "weight_priority") {
      return <>
        <div className={styles.fieldGrid}>
          <MeasureField label={locale === "fa" ? "وزن" : "Weight"} value={context.weightKg} unit="kg" min="20" max="400" step="0.1" placeholder="82" onChange={(value) => updateContext("weightKg", value)} />
          <MeasureField label={locale === "fa" ? "قد" : "Height"} value={context.heightCm} unit="cm" min="100" max="240" step="0.1" placeholder="173" onChange={(value) => updateContext("heightCm", value)} />
          <MeasureField label={locale === "fa" ? "دور کمر" : "Waist circumference"} value={context.waistCircumferenceCm} unit="cm" min="30" max="250" step="0.1" placeholder="98" onChange={(value) => updateContext("waistCircumferenceCm", value)} />
        </div>
        {bmi !== undefined && <div className={styles.bmiNote}><strong>{copy.bmi}:</strong><span dir="ltr">{bmi.toFixed(1)} kg/m²</span></div>}
      </>;
    }

    return <p className={styles.meta}>{FACTORS.find((item) => item.key === key)?.[locale === "fa" ? "faHint" : "enHint"]}</p>;
  }

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <Link className={styles.backLink} href="/">{isRtl ? "→" : "←"} {copy.back}</Link>

      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <span className={styles.versionBadge}>ADA 2026</span>
      </header>

      <section className={styles.workflowBanner} aria-live="polite">
        <div>
          <strong>{activeMedicationCount > 0 ? copy.workflowOptimize : copy.workflowStart}</strong>
          <small>{activeMedicationCount > 0 ? copy.workflowOptimizeHint : copy.workflowStartHint}</small>
        </div>
        <span className={styles.workflowBadge}>{activeMedicationCount} {locale === "fa" ? "داروی فعال" : "active medicines"}</span>
      </section>

      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={submit}>
          <SectionHeader number="1" title={copy.glycemicTitle} hint={copy.glycemicHint} />
          <div className={styles.fieldGrid}>
            <MeasureField label={copy.currentHba1c} value={currentHba1c} unit="%" min="3" max="20" step="0.1" placeholder="8.7" onChange={(value) => { setCurrentHba1c(value); setResult(null); }} />
            <MeasureField label={copy.targetHba1c} value={targetHba1c} unit="%" min="4" max="12" step="0.1" placeholder="7.0" onChange={(value) => { setTargetHba1c(value); setResult(null); }} />
          </div>

          <div className={styles.divider} />
          <SectionHeader number="2" title={copy.medsTitle} hint={copy.medsHint} />
          <div className={styles.medList}>
            {medications.length === 0 && <div className={styles.medEmpty}>{copy.noMeds}</div>}
            {medications.map((item, index) => {
              const dose = numeric(item.doseAmount);
              const frequency = numeric(item.frequencyPerDay);
              const tdd = dose !== undefined && frequency !== undefined ? dose * frequency : undefined;
              return <article className={styles.medRow} key={item.id}>
                <div className={styles.medRowHeader}>
                  <div><strong>{copy.med} {index + 1}</strong><small>{item.status === "active" ? (locale === "fa" ? "در محاسبه مسیر فعال است" : "Counts as active therapy") : (locale === "fa" ? "در تشخیص مسیر فعال محسوب نمی‌شود" : "Does not count as active therapy")}</small></div>
                  <button className={styles.removeButton} type="button" onClick={() => setMedications((current) => current.filter((row) => row.id !== item.id))}>{copy.remove}</button>
                </div>
                <div className={styles.medFields}>
                  <label className={styles.field}>
                    <span>{copy.medName}</span>
                    <input list="glymize-current-medications" dir="auto" value={item.genericName} onChange={(event) => updateMedicationName(item.id, event.target.value)} placeholder={locale === "fa" ? "مثلاً Metformin" : "e.g., Metformin"} />
                  </label>
                  <label className={styles.field}><span>{copy.strength}</span><input dir="auto" value={item.strengthPresentation} onChange={(event) => updateMedication(item.id, { strengthPresentation: event.target.value })} placeholder="500 mg" /></label>
                  <MeasureField label={copy.dose} value={item.doseAmount} unit={item.doseUnit} min="0" step="0.1" placeholder="500" onChange={(value) => updateMedication(item.id, { doseAmount: value })} />
                  <label className={styles.field}>
                    <span>{copy.unit}</span>
                    <select dir="ltr" value={item.doseUnit} onChange={(event) => updateMedication(item.id, { doseUnit: event.target.value })}>
                      <option value="mg">mg</option><option value="g">g</option><option value="mcg">mcg</option><option value="unit">unit</option><option value="mL">mL</option>
                    </select>
                  </label>
                </div>
                <div className={styles.medFieldsSecondary}>
                  <label className={styles.field}><span>{copy.frequency}</span><input dir="ltr" inputMode="decimal" min="0" max="12" step="0.5" type="number" value={item.frequencyPerDay} onChange={(event) => updateMedication(item.id, { frequencyPerDay: event.target.value })} placeholder="2" /></label>
                  <label className={styles.field}><span>{copy.status}</span><select value={item.status} onChange={(event) => updateMedication(item.id, { status: event.target.value as CurrentMedicationStatus })}><option value="active">{copy.active}</option><option value="held">{copy.held}</option><option value="stopped">{copy.stopped}</option></select></label>
                  <label className={styles.field}><span>{copy.adherence}</span><select value={item.adherence} onChange={(event) => updateMedication(item.id, { adherence: event.target.value as MedicationAdherence })}><option value="good">{copy.adherenceGood}</option><option value="partial">{copy.adherencePartial}</option><option value="poor">{copy.adherencePoor}</option><option value="unknown">{copy.adherenceUnknown}</option></select></label>
                  <label className={styles.field}><span>{copy.tolerance}</span><select value={item.tolerance} onChange={(event) => updateMedication(item.id, { tolerance: event.target.value as MedicationTolerance })}><option value="good">{copy.toleranceGood}</option><option value="limited">{copy.toleranceLimited}</option><option value="intolerant">{copy.toleranceIntolerant}</option><option value="unknown">{copy.toleranceUnknown}</option></select></label>
                </div>
                {tdd !== undefined && <div className={styles.tddNote}>{copy.tdd}: <b dir="ltr">{tdd} {item.doseUnit}/day</b></div>}
              </article>;
            })}
          </div>
          <datalist id="glymize-current-medications">{catalog.map((item) => <option key={item.id} value={item.canonicalName}>{item.persianName}</option>)}</datalist>
          <button className={styles.addButton} type="button" onClick={() => setMedications((current) => [...current, makeMedicationRow()])}>＋ {copy.addMed}</button>

          <div className={styles.divider} />
          <SectionHeader number="3" title={copy.costTitle} hint={copy.costHint} />
          <div className={styles.radioList}>{COST_OPTIONS[locale].map((option) => <label className={styles.radioCard} key={option.value}><input checked={costPreference === option.value} name="costPreference" type="radio" value={option.value} onChange={() => { setCostPreference(option.value); setResult(null); }} /><span><strong>{option.title}</strong><small>{option.hint}</small></span></label>)}</div>

          <div className={styles.divider} />
          <SectionHeader number="4" title={copy.routeTitle} hint={copy.routeHint} />
          <div className={styles.radioList}>{ROUTE_OPTIONS[locale].map((option) => <label className={styles.radioCard} key={option.value}><input checked={routePreference === option.value} name="routePreference" type="radio" value={option.value} onChange={() => { setRoutePreference(option.value); setResult(null); }} /><span><strong>{option.title}</strong><small>{option.hint}</small></span></label>)}</div>

          <div className={styles.divider} />
          <SectionHeader number="5" title={copy.factorsTitle} hint={copy.factorsHint} />
          <div className={styles.factorGrid}>
            {FACTORS.map((factor) => {
              const selected = selectedFactors.includes(factor.key);
              return <section className={`${styles.factorCard} ${selected ? styles.factorCardActive : ""}`} key={factor.key}>
                <button aria-expanded={selected} className={styles.factorButton} type="button" onClick={() => toggleFactor(factor.key)}>
                  <span className={styles.factorCheck}>{selected ? "✓" : ""}</span>
                  <span><strong>{factor[locale === "fa" ? "fa" : "en"]}</strong><small>{factor[locale === "fa" ? "faHint" : "enHint"]}</small></span>
                  <span className={styles.chevron}>⌄</span>
                </button>
                {selected && <div className={styles.factorBody}>{factorBody(factor.key)}</div>}
              </section>;
            })}
          </div>

          <div className={styles.urgentBox}>
            <Check label={copy.urgentHyper} checked={hyperglycemiaSymptoms} onChange={(value) => { setHyperglycemiaSymptoms(value); setResult(null); }} />
            <Check label={copy.urgentCatabolic} checked={catabolicFeatures} onChange={(value) => { setCatabolicFeatures(value); setResult(null); }} />
          </div>

          <p className={styles.formMessage} role="status">{requestMessage}</p>
          <button className={styles.primaryButton} type="submit">{copy.calculate}</button>
        </form>

        <aside className={styles.resultPanel} aria-live="polite">
          {!result ? <div className={styles.resultEmpty}><div><div className={styles.resultEmptyIcon}>⌁</div><h2>{copy.resultEmpty}</h2><p>{copy.resultEmptyHint}</p></div></div> : <div className={styles.resultContent}>
            <span className={styles.eyebrow}>{copy.pathway}</span>
            <h2>{translateRecommendationTitle(result.recommendation.title, locale)}</h2>
            <div className={`${styles.rationale} ${result.recommendation.urgentReview ? styles.rationaleDanger : ""}`}>
              <strong>{copy.gap}: <span dir="ltr">{result.recommendation.hba1cGap.toFixed(1)}%</span></strong>
              <ul>{result.recommendation.rationale.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <a className={styles.sourceLink} href={result.recommendation.sourceUrl} rel="noreferrer" target="_blank">{result.recommendation.sourceReference}</a>
          </div>}
        </aside>
      </div>

      {result && <section className={styles.resultsSection}>
        <div className={styles.resultsHeader}><div><h2>{copy.medicationTitle}</h2><p>{copy.medicationHint}</p></div><span className={styles.countBadge}>{result.medications.length} {locale === "fa" ? "دارو" : "medicines"}</span></div>
        {result.medications.length > 0 ? <div className={styles.medGrid}>{result.medications.map((item, index) => <article className={`${styles.medCard} ${styles[item.priorityTier]}`} key={item.cardId ?? `${item.genericMedicationId}-${index}`}>
          <div className={styles.cardTop}><span className={styles.countBadge}>#{index + 1}</span>{item.therapyAction && <span className={styles.actionBadge}>{ACTION_LABELS[locale][item.therapyAction]}</span>}</div>
          <h3>{item.displayName ?? item.persianName}</h3>
          {item.selectedBrandName && <p className={styles.meta}>{copy.generic}: {item.persianName}</p>}
          <p className={styles.meta}>{item.therapeuticClass}</p>
          {item.rankingReasons.length > 0 && <p className={styles.ranking}>{item.rankingReasons.join(" · ")}</p>}
          <div className={`${styles.insurance} ${item.insuranceCoverages.length ? styles.insuranceCovered : ""}`}><strong>{item.insuranceCoverages.length ? `✓ ${copy.insuranceCovered}` : copy.insuranceMissing}</strong>{item.insuranceCoverages.map((entry) => <span key={entry.provider}>{INSURANCE_LABELS[locale][entry.provider]}: <b dir="ltr">{entry.percent}%</b></span>)}</div>
          <MedicationMarketDetails brandRegistryCode={item.brandRegistryCode} coverages={item.insuranceCoverages} genericRegistryCode={item.genericRegistryCode} locale={locale} marketBadge={item.marketBadge} price={item.price} selectedBrands={item.selectedBrands} />
          {item.considerations.length > 0 && <ul className={styles.noteList}>{item.considerations.map((note) => <li key={note}>{note}</li>)}</ul>}
          <div className={styles.riskBox}><strong>{copy.risks}</strong><ul>{item.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div>
          {item.cautions.length > 0 && <div className={styles.cautionBox}><strong>{copy.cautions}</strong><ul>{item.cautions.map((note) => <li key={note}>{note}</li>)}</ul></div>}
          {item.blockedBy && item.blockedBy.length > 0 && <div className={styles.blockedBox}><strong>{copy.lowerPriority}</strong><ul>{item.blockedBy.map((note) => <li key={note}>{note}</li>)}</ul></div>}
          <a className={styles.sourceLink} href={item.sourceUrl} rel="noreferrer" target="_blank">{copy.source}</a>
        </article>)}</div> : <div className={styles.medEmpty}>{copy.noCatalog}</div>}
      </section>}

      <ClinicalDomainMedications />
    </main>
  );
}

function SectionHeader({ number, title, hint }: { number: string; title: string; hint: string }) {
  return <div className={styles.sectionHeader}><span className={styles.sectionNumber}>{number}</span><div><strong>{title}</strong><small>{hint}</small></div></div>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={styles.check}><input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
