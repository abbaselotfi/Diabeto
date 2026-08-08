import type {
  BrandDisplayMode,
  BrandMarketEntry,
  ClinicalProtocolBundle,
  DiabetesType,
  GenericMedication,
  OrganizationBrandPreference,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration,
  Type2Workflow
} from "@glymize/contracts";
import {
  evidenceReference,
  primaryEvidenceUrl,
} from "./guideline-registry.js";

export * from "./guideline-registry.js";

const EVIDENCE = {
  ada: "ada-2026",
  easd: "easd-2022",
  kdigoCkd: "kdigo-ckd-2024",
  kdigoDmCkd: "kdigo-dmckd-2022",
  easlMasld: "easl-masld-2024",
  escDmCvd: "esc-dm-cvd-2023",
  iwgdfInfection: "iwgdf-inf-2023",
  iwgdfWound: "iwgdf-wound-2023",
  emaResmetirom: "ema-resmetirom-2025",
} as const;

export interface ProtocolGateResult {
  enabled: boolean;
  reason?: "missing_protocol";
}

/** Prepublication web mode exposes every bundled pathway without an approval gate. */
export function gateClinicalOutput(protocol?: ClinicalProtocolBundle): ProtocolGateResult {
  if (!protocol) return { enabled: false, reason: "missing_protocol" };
  return { enabled: true };
}

export interface PathwaySelection {
  diabetesType: DiabetesType;
  contentStatus: "enabled";
  patientDataPolicy: "anonymous_only";
}

export function selectDiabetesPathway(diabetesType: DiabetesType): PathwaySelection {
  return {
    diabetesType,
    contentStatus: "enabled",
    patientDataPolicy: "anonymous_only"
  };
}

export interface MedicationPresentation {
  primaryName: string;
  genericName: string;
  selectedBrand?: BrandMarketEntry;
}

/**
 * The rule engine consumes only genericMedication.id. This function is UI-only.
 */
export function resolveMedicationPresentation(input: {
  medication: GenericMedication;
  brands: readonly BrandMarketEntry[];
  displayMode: BrandDisplayMode;
  preferences: readonly OrganizationBrandPreference[];
}): MedicationPresentation {
  const eligibleBrands = input.brands.filter(
    (brand) =>
      brand.genericMedicationId === input.medication.id &&
      brand.market === "IR" &&
      brand.availability === "active" &&
      brand.reviewState === "published" &&
      Boolean(brand.verifiedAt)
  );

  const priorities = new Map(input.preferences.map((preference) => [preference.brandMarketEntryId, preference.priority]));
  const selectedBrand = [...eligibleBrands].sort((left, right) => {
    const leftPriority = priorities.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priorities.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.brandName.localeCompare(right.brandName);
  })[0];

  if (input.displayMode === "brand_first" && selectedBrand) {
    return {
      primaryName: selectedBrand.brandNameFa ?? selectedBrand.brandName,
      genericName: input.medication.persianName,
      selectedBrand
    };
  }

  return {
    primaryName: input.medication.persianName,
    genericName: input.medication.persianName,
    selectedBrand
  };
}

function uniqueEvidence(ids: readonly string[]) {
  return [...new Set(ids)];
}

function evidenceFields(ids: readonly string[]) {
  const unique = uniqueEvidence(ids);
  return {
    sourceUrl: primaryEvidenceUrl(unique),
    sourceReference: evidenceReference(unique),
  };
}

function roundGap(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizedMedicationIdentity(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function activeCurrentMedications(request: Type2ConsiderationRequest) {
  return (request.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

/** Current therapy is the authoritative signal for initiation vs intensification. */
export function resolveType2Workflow(request: Type2ConsiderationRequest): Type2Workflow {
  if (activeCurrentMedications(request).length > 0) return "intensification";
  return request.workflow ?? "initiation";
}

function currentMedicationFor(medication: GenericMedication, request: Type2ConsiderationRequest) {
  const medicationName = normalizedMedicationIdentity(medication.canonicalName);
  return activeCurrentMedications(request).find((current) =>
    (current.genericMedicationId && current.genericMedicationId === medication.id) ||
    normalizedMedicationIdentity(current.genericName) === medicationName
  );
}

function effectiveEgfr(request: Type2ConsiderationRequest) {
  return request.clinicalContext?.kidney?.eGfr ?? request.eGfr;
}

function hasDecisionFactor(request: Type2ConsiderationRequest, factor: Type2ConsiderationRequest["factors"][number]) {
  if (request.factors.includes(factor)) return true;
  if (factor === "ascvd") return Boolean(request.clinicalContext?.cardiovascular?.ascvd);
  if (factor === "heart_failure") return Boolean(request.clinicalContext?.cardiovascular?.heartFailure);
  if (factor === "ckd") return Boolean(request.clinicalContext?.kidney?.ckd);
  if (factor === "masld_mash") return Boolean(request.clinicalContext?.liver?.masldMash);
  if (factor === "pregnancy") return Boolean(request.clinicalContext?.pregnancy);
  return false;
}

function contextualPathwayEvidence(request: Type2ConsiderationRequest) {
  const ids = [EVIDENCE.ada, EVIDENCE.easd];
  if (hasDecisionFactor(request, "ascvd") || hasDecisionFactor(request, "heart_failure")) ids.push(EVIDENCE.escDmCvd);
  if (hasDecisionFactor(request, "ckd")) ids.push(EVIDENCE.kdigoCkd, EVIDENCE.kdigoDmCkd);
  if (hasDecisionFactor(request, "masld_mash")) ids.push(EVIDENCE.easlMasld);
  if (hasDecisionFactor(request, "diabetic_foot")) ids.push(EVIDENCE.iwgdfInfection, EVIDENCE.iwgdfWound);
  return uniqueEvidence(ids);
}

function relativeCostFor(medication: GenericMedication): Type2MedicationConsideration["relativeCost"] {
  const group = medication.therapyGroup;
  const className = medication.className?.toLocaleLowerCase() ?? "";
  if (group === "glp_1_receptor_agonist" || group === "dual_gip_glp_1_receptor_agonist" || group === "fixed_ratio_combination") return "high";
  if (group === "basal_insulin_analog" || group === "prandial_insulin_analog" || group === "premixed_insulin" || className.includes("sglt2") || className.includes("dpp-4")) return "medium";
  return "low";
}

function scoreMedication(
  medication: GenericMedication,
  request: Type2ConsiderationRequest,
  pathway: Type2AssessmentResult["recommendation"],
  relativeCost: Type2MedicationConsideration["relativeCost"]
) {
  const reasons: string[] = [];
  const evidenceIds = new Set<string>([EVIDENCE.ada, EVIDENCE.easd]);
  const addEvidence = (...ids: string[]) => ids.forEach((id) => evidenceIds.add(id));
  const group = medication.therapyGroup ?? "oral_glucose_lowering";
  const className = medication.className?.toLocaleLowerCase() ?? "";
  const name = medication.canonicalName.toLocaleLowerCase();
  const isInsulin = ["human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin"].includes(group);
  const isGlp = ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(group);
  const isSglt2 = className.includes("sglt2");
  const isDpp4 = className.includes("dpp-4");
  const isMetformin = name === "metformin";
  const isResmetirom = name.includes("resmetirom");
  const isHypoglycemiaProne = isInsulin || className.includes("sulfonylurea") || className.includes("meglitinide");
  const isTzd = className.includes("thiazolidinedione");
  const isGlargine = name.includes("glargine");
  const coverage = request.insuranceCoverageByMedicationId?.[medication.id] ?? [];
  const eGfr = effectiveEgfr(request);
  const liver = request.clinicalContext?.liver;
  let score = 50;

  if (pathway.priority === "consider_insulin" && isInsulin) {
    score += 30;
    reasons.push("هماهنگ با مسیر انسولین در هایپرگلیسمی شدید [ADA 2026]");
  }
  if (pathway.priority === "consider_insulin" && isGlargine) {
    score += 16;
    reasons.push("اولویت انسولین پایه در مسیر فعلی [ADA 2026]");
  }
  if (pathway.priority === "glp1_based_therapy" && isGlp) {
    score += 30;
    reasons.push("هماهنگ با اولویت درمان مبتنی بر GLP-1 در این مسیر [ADA 2026 / EASD]");
  }

  if (hasDecisionFactor(request, "heart_failure") || hasDecisionFactor(request, "ckd")) {
    if (isSglt2) {
      score += 28;
      reasons.push("اولویت قلبی‌ـ‌کلیوی برای HF/CKD بر اساس شواهد پیامدی");
      if (hasDecisionFactor(request, "heart_failure")) addEvidence(EVIDENCE.escDmCvd);
      if (hasDecisionFactor(request, "ckd")) addEvidence(EVIDENCE.kdigoCkd, EVIDENCE.kdigoDmCkd);
    }
    if (isGlp && hasDecisionFactor(request, "ckd")) {
      score += 10;
      reasons.push("قابل بررسی با توجه به منفعت قلبی‌ـ‌کلیوی در دیابت همراه CKD");
      addEvidence(EVIDENCE.kdigoDmCkd, EVIDENCE.kdigoCkd);
    }
  }

  if (hasDecisionFactor(request, "ascvd")) {
    addEvidence(EVIDENCE.escDmCvd);
    if (isGlp) {
      score += 20;
      reasons.push("اولویت فرآورده‌های GLP-1 دارای شواهد پیامد قلبی‌عروقی [ADA / ESC]");
    } else if (isSglt2) {
      score += 16;
      reasons.push("SGLT2 دارای شواهد قلبی‌ـ‌کلیوی در زمینه ASCVD قابل اولویت است [ADA / ESC]");
    }
  }

  if (hasDecisionFactor(request, "weight_priority")) {
    if (isGlp) {
      score += 22;
      reasons.push("اثر مطلوب‌تر بر وزن و تناسب با رویکرد فردمحور [ADA / EASD]");
    } else if (isSglt2) {
      score += 10;
      reasons.push("اثر وزن‌خنثی تا کاهنده [ADA / EASD]");
    } else if (isInsulin || isTzd || className.includes("sulfonylurea")) score -= 12;
  }

  if (hasDecisionFactor(request, "hypoglycemia_risk")) {
    if (isMetformin || isSglt2 || isDpp4 || isGlp) {
      score += 14;
      reasons.push("ریسک ذاتی پایین‌تر هیپوگلیسمی [ADA / EASD]");
    }
    if (isHypoglycemiaProne) score -= 28;
  }

  if (hasDecisionFactor(request, "heart_failure") && isTzd) {
    score -= 45;
    reasons.push("احتباس مایع/نارسایی قلبی، اولویت این کلاس را کاهش می‌دهد [ADA / ESC]");
    addEvidence(EVIDENCE.escDmCvd);
  }

  if (eGfr !== undefined && eGfr < 30 && isMetformin) {
    score -= 60;
    reasons.push("محدودیت ایمنی کلیوی در eGFR پایین [ADA / KDIGO]");
    addEvidence(EVIDENCE.kdigoCkd, EVIDENCE.kdigoDmCkd);
  }

  if (hasDecisionFactor(request, "masld_mash")) {
    addEvidence(EVIDENCE.easlMasld);
    if (isGlp) {
      score += 8;
      reasons.push("در MASLD/MASH، درمان دیابت/چاقی باید با فنوتیپ متابولیک و مرحله کبد تطبیق داده شود [EASL–EASD–EASO]");
    }
    if (isResmetirom) {
      addEvidence(EVIDENCE.emaResmetirom);
      const eligibleFibrosis = liver?.fibrosisStage === "F2" || liver?.fibrosisStage === "F3";
      const cirrhosis = Boolean(liver?.cirrhosis || liver?.decompensatedCirrhosis || liver?.fibrosisStage === "F4");
      if (eligibleFibrosis && !cirrhosis) {
        score += 35;
        reasons.push("MASH غیرسیروتیک با فیبروز F2–F3 با محدوده مجوز EMA برای resmetirom هم‌راستا است");
      } else {
        score -= 60;
        reasons.push("معیارهای مرحله فیبروز/سیروز با محدوده مجوز EMA برای resmetirom هم‌راستا نیست");
      }
    }
  }

  const costPreference = request.costPreference ?? "no_constraint";
  if (costPreference === "low_cost_only") {
    if (relativeCost === "low") { score += 22; reasons.push("در گروه گزینه‌های کم‌هزینه‌تر قرار می‌گیرد"); }
    if (relativeCost === "medium") score -= 5;
  } else if (costPreference === "moderate") {
    if (relativeCost === "low") { score += 10; reasons.push("تناسب بهتر با محدودیت هزینه"); }
    if (relativeCost === "high") score -= 18;
  } else if (costPreference === "insured_only") {
    const bestCoverage = coverage.reduce((best, item) => Math.max(best, item.percent), 0);
    score += Math.round(bestCoverage / 5);
    reasons.push(`پوشش بیمه تا ${bestCoverage}٪`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    evidenceIds: [...evidenceIds],
  };
}

function medicationRisks(medication: GenericMedication) {
  const className = medication.className?.toLocaleLowerCase() ?? "";
  const name = medication.canonicalName.toLocaleLowerCase();
  const group = medication.therapyGroup;
  const risks: string[] = [];
  if (className.includes("sulfonylurea") || className.includes("meglitinide") || group?.includes("insulin")) risks.push("ریسک هیپوگلیسمی و احتمال افزایش وزن");
  if (className.includes("thiazolidinedione")) risks.push("احتباس مایع، افزایش وزن و افزایش ریسک شکستگی؛ در نارسایی قلبی نامناسب");
  if (className.includes("sglt2")) risks.push("عفونت تناسلی‌ـ‌ادراری، کاهش حجم و خطر کتواسیدوز یوگلایسمیک در شرایط مستعد");
  if (group === "glp_1_receptor_agonist" || group === "dual_gip_glp_1_receptor_agonist") risks.push("عوارض گوارشی؛ بررسی سابقه پانکراتیت و هشدارهای اختصاصی فرآورده");
  if (className.includes("dpp-4")) risks.push("بررسی تنظیم دوز کلیوی؛ هشدار نارسایی قلبی برای برخی اعضای کلاس");
  if (name === "metformin") risks.push("عدم تحمل گوارشی و کمبود B12؛ منع مصرف در eGFR کمتر از ۳۰");
  if (!risks.length) risks.push("عوارض و منع مصرف اختصاصی برچسب فرآورده باید بررسی شود");
  return risks;
}

/**
 * Produces a traceable pathway priority, not a prescription or dose.
 * The pathway is ADA-led, while contextual branches add the relevant source
 * only when that source actually changes or constrains the decision.
 */
export function buildType2PathwayRecommendation(request: Type2ConsiderationRequest): Type2AssessmentResult["recommendation"] {
  const hba1cGap = roundGap(request.currentHba1c - request.targetHba1c);
  const urgentReview = Boolean(request.hyperglycemiaSymptoms || request.catabolicFeatures || request.currentHba1c > 10);
  const workflow = resolveType2Workflow(request);
  const currentTherapies = activeCurrentMedications(request);
  const pathwayEvidence = contextualPathwayEvidence(request);
  const sourceFields = evidenceFields(pathwayEvidence);
  const rationale = [
    `HbA1c فعلی ${request.currentHba1c.toFixed(1)}٪ و هدف فردی ${request.targetHba1c.toFixed(1)}٪ است؛ فاصله ${hba1cGap.toFixed(1)} واحد درصد.`
  ];

  if (currentTherapies.length) {
    rationale.push(`${currentTherapies.length} درمان فعال برای بیمار ثبت شده است؛ موتور این ارزیابی را به‌عنوان بهینه‌سازی/تشدید درمان پردازش می‌کند.`);
  }
  if (hasDecisionFactor(request, "ckd")) {
    rationale.push("عامل CKD فعال است؛ eGFR/UACR و medication stewardship در انتخاب و رتبه‌بندی داروها با قواعد KDIGO لحاظ می‌شود.");
  }
  if (hasDecisionFactor(request, "masld_mash")) {
    rationale.push("عامل MASLD/MASH فعال است؛ مرحله فیبروز و وجود سیروز باید پیش از نسبت‌دادن منفعت یا انتخاب درمان اختصاصی کبدی روشن باشد.");
  }
  if (hasDecisionFactor(request, "diabetic_foot")) {
    rationale.push("عامل پای دیابتی فعال است؛ ارزیابی عفونت و زخم باید طبق مسیر IWGDF/IDSA به‌صورت موازی انجام شود و رتبه داروی کاهنده قند به‌تنهایی جایگزین این مسیر نیست.");
  }

  if (urgentReview) {
    rationale.push("HbA1c بالاتر از ۱۰٪، علائم واضح هایپرگلیسمی یا شواهد کاتابولیسم از معیارهای بررسی انسولین به‌عنوان اولین درمان تزریقی هستند.");
    rationale.push("نیاز به رد کتوز، کمبود انسولین و وضعیت حاد باید همان روز توسط پزشک ارزیابی شود.");
    return {
      priority: "consider_insulin",
      title: "انسولین را به‌عنوان درمان تزریقی اولیه بررسی کنید",
      rationale,
      hba1cGap,
      urgentReview,
      ...sourceFields
    };
  }

  if (hba1cGap >= 1.5) {
    rationale.push("فاصلهٔ حداقل ۱٫۵ واحد درصد از هدف، شروع یا تشدید درمان ترکیبی را مطرح می‌کند.");
    rationale.push("در نبود هایپرگلیسمی شدید یا شواهد کمبود انسولین، درمان مبتنی بر GLP-1 شامل GLP-1 RA یا dual GIP/GLP-1 RA بر انسولین ترجیح دارد.");
    return {
      priority: "glp1_based_therapy",
      title: "درمان ترکیبی با اولویت GLP-1 یا GIP/GLP-1 را بررسی کنید",
      rationale,
      hba1cGap,
      urgentReview,
      ...sourceFields
    };
  }

  if (hba1cGap > 0) {
    rationale.push("HbA1c بالاتر از هدف است؛ درمان فعلی، پایبندی، تحمل‌پذیری و بیماری‌های همراه برای تشدید مرحله‌ای مرور شوند.");
    return {
      priority: workflow === "initiation" ? "single_or_stepwise_therapy" : "combination_therapy",
      title: workflow === "initiation" ? "درمان اولیهٔ فردمحور را انتخاب کنید" : "درمان فعلی را تشدید کنید",
      rationale,
      hba1cGap,
      urgentReview,
      ...sourceFields
    };
  }

  rationale.push("HbA1c در محدودهٔ هدف ثبت‌شده است؛ اثربخشی، عوارض و بار درمانی بازبینی و پایش دوره‌ای ادامه یابد.");
  return {
    priority: "maintain_and_monitor",
    title: "هدف فعلی حفظ شده است؛ پایش و بازبینی ادامه یابد",
    rationale,
    hba1cGap,
    urgentReview,
    ...sourceFields
  };
}

export function buildType2Assessment(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest
): Type2AssessmentResult {
  return {
    recommendation: buildType2PathwayRecommendation(request),
    medications: buildType2MedicationConsiderations(medications, request)
  };
}

/**
 * This layer exposes class-level considerations and the relationship to the
 * patient's current regimen. Dose/titration output remains gated until a
 * versioned MedicationDoseRule is clinically approved.
 */
export function buildType2MedicationConsiderations(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest
): Type2MedicationConsideration[] {
  const pathway = buildType2PathwayRecommendation(request);
  const workflow = resolveType2Workflow(request);
  const eGfr = effectiveEgfr(request);
  return medications.flatMap((medication) => {
    const relativeCost = relativeCostFor(medication);
    const costPreference = request.costPreference ?? "no_constraint";
    const coverage = request.insuranceCoverageByMedicationId?.[medication.id] ?? [];
    if (request.routePreference === "oral_only" && medication.administrationRoute !== "oral") return [];
    if (costPreference === "low_cost_only" && relativeCost === "high") return [];
    if (costPreference === "insured_only" && coverage.length === 0) return [];
    const considerations: string[] = [];
    const cautions: string[] = [];
    const blockedBy: string[] = [];
    const className = medication.className ?? "";
    const name = medication.canonicalName.toLocaleLowerCase();
    const currentMedication = currentMedicationFor(medication, request);
    const therapyAction: Type2MedicationConsideration["therapyAction"] = currentMedication
      ? "review_current_therapy"
      : workflow === "initiation"
        ? "consider_initiation"
        : "consider_addition";

    if (currentMedication) {
      considerations.push("این دارو در درمان فعلی بیمار ثبت شده است؛ ادامه، افزایش دوز، کاهش دوز یا تعویض باید در لایهٔ دوز و تیتراسیون بررسی شود.");
      if (currentMedication.adherence === "poor" || currentMedication.adherence === "partial") cautions.push("پایبندی به درمان فعلی کامل ثبت نشده است؛ پیش از تشدید دارویی علت عدم پایبندی بررسی شود.");
      if (currentMedication.tolerance === "limited" || currentMedication.tolerance === "intolerant") cautions.push("تحمل‌پذیری درمان فعلی محدود ثبت شده است و باید در تصمیم ادامه یا تعویض لحاظ شود.");
    }

    if (name === "metformin") {
      considerations.push("داروی پایهٔ رایج؛ وضعیت کلیه، تحمل گوارشی و B12 باید در تصمیم پزشک لحاظ شود.");
      if (eGfr !== undefined && eGfr < 30) blockedBy.push("eGFR کمتر از ۳۰: این ابزار شروع/ادامه را تأیید نمی‌کند؛ برچسب دارو و تصمیم پزشک بررسی شود.");
      else if (eGfr !== undefined && eGfr < 45) cautions.push("eGFR کمتر از ۴۵: نیاز به بازبینی کلیوی و برچسب فرآورده.");
    }

    if (className.includes("SGLT2")) {
      if (hasDecisionFactor(request, "heart_failure")) considerations.push("در نارسایی قلبی، گزینه‌های دارای شواهد این کلاس طبق ADA/ESC در اولویت بررسی قرار می‌گیرند.");
      if (hasDecisionFactor(request, "ckd")) considerations.push("در CKD، منفعت قلبی-کلیوی و آستانهٔ eGFR هر فرآورده با چارچوب ADA/KDIGO بررسی می‌شود.");
      cautions.push("خطرات حجم/فشارخون، عفونت‌های تناسلی-ادراری و وضعیت بالینی حاد باید توسط پزشک مرور شود.");
      if (eGfr !== undefined && eGfr < 20) cautions.push("eGFR کمتر از ۲۰: برای این ابزار، بررسی تخصصی برچسب و پروتکل لازم است.");
    }

    if (medication.therapyGroup === "glp_1_receptor_agonist" || medication.therapyGroup === "dual_gip_glp_1_receptor_agonist") {
      if (hasDecisionFactor(request, "ascvd")) considerations.push("در ASCVD، فرآوردهٔ دارای شواهد پیامد قلبی-عروقی در اولویت بررسی قرار می‌گیرد.");
      if (hasDecisionFactor(request, "weight_priority")) considerations.push("برای هدف مدیریت وزن، اثربخشی و تحمل‌پذیری فرآورده باید در تصمیم مشترک مرور شود.");
      if (hasDecisionFactor(request, "masld_mash")) considerations.push("در MASLD/MASH، این کلاس صرفاً بر اساس اندیکاسیون دیابت/چاقی و وضعیت کبدی رتبه‌بندی می‌شود و به‌تنهایی به‌عنوان درمان اختصاصی MASH تلقی نمی‌شود.");
      cautions.push("تحمل گوارشی، سابقهٔ پانکراتیت و هشدارهای اختصاصی برچسب باید مرور شود.");
      cautions.push("هم‌زمانی با DPP-4 inhibitor به‌عنوان ترکیب معمول در این ابزار پیشنهاد نمی‌شود.");
    }

    if (className.includes("DPP-4")) {
      considerations.push("گزینهٔ خوراکی با خطر هیپوگلیسمی پایین در نبود ترکیب‌های هیپوگلیسمی‌زا.");
      if (hasDecisionFactor(request, "heart_failure") && (name === "saxagliptin" || name === "alogliptin")) cautions.push("در نارسایی قلبی، هشدار اختصاصی این فرآورده باید با برچسب و پزشک مرور شود.");
      cautions.push("در اغلب اعضای کلاس، تنظیمات مرتبط با عملکرد کلیه باید بررسی شود.");
    }

    if (className.includes("Sulfonylurea") || className.includes("Meglitinide")) {
      cautions.push("خطر هیپوگلیسمی و افزایش وزن؛ در ریسک بالای هیپوگلیسمی با احتیاط بررسی شود.");
      if (hasDecisionFactor(request, "hypoglycemia_risk")) blockedBy.push("ریسک بالای هیپوگلیسمی: این کلاس در پیشنهادهای اولویت‌دار نمایش داده نمی‌شود.");
    }

    if (className.includes("Thiazolidinedione")) {
      cautions.push("احتباس مایع، افزایش وزن، شکستگی و هشدارهای اختصاصی برچسب باید مرور شود.");
      if (hasDecisionFactor(request, "heart_failure")) blockedBy.push("نارسایی قلبی/خطر احتباس مایع: نیاز به بازبینی پزشک و برچسب؛ پیشنهاد خودکار مسدود است.");
    }

    if (name.includes("resmetirom")) {
      const liver = request.clinicalContext?.liver;
      const eligibleFibrosis = liver?.fibrosisStage === "F2" || liver?.fibrosisStage === "F3";
      const cirrhosis = Boolean(liver?.cirrhosis || liver?.decompensatedCirrhosis || liver?.fibrosisStage === "F4");
      if (hasDecisionFactor(request, "masld_mash") && eligibleFibrosis && !cirrhosis) {
        considerations.push("بر اساس مجوز EMA، resmetirom فقط در محدوده MASH غیرسیروتیک با فیبروز F2–F3 قابل بررسی است؛ تطبیق برچسب و ارزیابی تخصصی کبد الزامی است.");
      } else {
        blockedBy.push("معیارهای MASH غیرسیروتیک با فیبروز F2–F3 برای resmetirom ثبت نشده یا وجود سیروز مطرح است؛ پیشنهاد خودکار مسدود است.");
      }
    }

    if (medication.therapyGroup === "human_insulin" || medication.therapyGroup === "basal_insulin_analog" || medication.therapyGroup === "prandial_insulin_analog" || medication.therapyGroup === "premixed_insulin") {
      considerations.push("مسیر انسولین با توجه به HbA1c، علائم هایپرگلیسمی، شواهد کاتابولیسم و وضعیت درمان فعلی بررسی می‌شود.");
      cautions.push("دوز، تیتراسیون و تبدیل واحد انسولین فقط از ماژول اختصاصی دارای قواعد نسخه‌بندی‌شده تولید خواهد شد.");
      if (hasDecisionFactor(request, "hypoglycemia_risk")) cautions.push("ریسک هیپوگلیسمی باید در انتخاب فرآورده و طرح پایش لحاظ شود.");
    }

    if (medication.therapyGroup === "fixed_ratio_combination") {
      considerations.push("ترکیب ثابت انسولین/GLP-1 فقط در مسیر اختصاصی FRC و با تطبیق دقیق فرآورده و قدرت بررسی می‌شود.");
      cautions.push("قدرت‌های Soliqua/Suliqua 100/33 و 100/50 باید به‌صورت فرآورده‌های مجزا و با قواعد اختصاصی تبدیل و شروع ثبت شوند.");
    }

    if (considerations.length === 0) considerations.push("انتخاب این کلاس نیازمند تطبیق با هدف درمان، هم‌ابتلایی، برچسب و ترجیحات بیمار است.");

    if (costPreference !== "no_constraint") {
      considerations.push(relativeCost === "low"
        ? "در گروه گزینه‌های کم‌هزینه‌تر قرار می‌گیرد."
        : "هزینه و پوشش بیمه‌ای این فرآورده باید پیش از انتخاب بررسی شود.");
    }

    const ranking = scoreMedication(medication, request, pathway, relativeCost);
    if (currentMedication) ranking.reasons.unshift("این دارو بخشی از رژیم فعلی بیمار است و باید به‌جای افزودن مجدد، برای ادامه/تیتراسیون/تعویض بازبینی شود");
    const priorityTier: Type2MedicationConsideration["priorityTier"] = ranking.score >= 75 ? "recommended" : ranking.score >= 58 ? "preferred" : "consider";
    const sourceFields = evidenceFields(ranking.evidenceIds);

    return [{
      genericMedicationId: medication.id,
      genericName: medication.canonicalName,
      persianName: medication.persianName,
      therapeuticClass: className || "سایر",
      therapyGroup: medication.therapyGroup ?? "oral_glucose_lowering",
      ...sourceFields,
      considerations,
      cautions,
      blockedBy: blockedBy.length ? blockedBy : undefined,
      priorityScore: ranking.score,
      priorityTier,
      relativeCost,
      rankingReasons: ranking.reasons.length ? ranking.reasons : ["قابل بررسی پس از تطبیق با شرایط و ترجیحات بیمار"],
      risks: medicationRisks(medication),
      insuranceCoverages: coverage,
      therapyAction,
      currentMedication: Boolean(currentMedication),
      outputStatus: "information_only" as const
    }];
  }).sort((left, right) => right.priorityScore - left.priorityScore || left.persianName.localeCompare(right.persianName, "fa"));
}
