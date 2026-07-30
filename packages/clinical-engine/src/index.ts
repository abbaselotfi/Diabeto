import type {
  BrandDisplayMode,
  BrandMarketEntry,
  ClinicalProtocolBundle,
  DiabetesType,
  GenericMedication,
  OrganizationBrandPreference,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration
} from "@diabeto/contracts";

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

const ada2026Section9 = {
  sourceUrl: "https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment",
  sourceReference: "ADA Standards of Care in Diabetes—2026, Section 9"
} as const;

function roundGap(value: number) {
  return Math.round(value * 10) / 10;
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
  const group = medication.therapyGroup ?? "oral_glucose_lowering";
  const className = medication.className?.toLocaleLowerCase() ?? "";
  const name = medication.canonicalName.toLocaleLowerCase();
  const isInsulin = ["human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin"].includes(group);
  const isGlp = ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(group);
  const isSglt2 = className.includes("sglt2");
  const isDpp4 = className.includes("dpp-4");
  const isMetformin = name === "metformin";
  const isHypoglycemiaProne = isInsulin || className.includes("sulfonylurea") || className.includes("meglitinide");
  const isTzd = className.includes("thiazolidinedione");
  let score = 50;

  if (pathway.priority === "consider_insulin" && isInsulin) { score += 30; reasons.push("هماهنگ با مسیر انسولین در هایپرگلیسمی شدید"); }
  if (pathway.priority === "glp1_based_therapy" && isGlp) { score += 30; reasons.push("هماهنگ با اولویت درمان مبتنی بر GLP-1 در این مسیر"); }
  if (request.factors.includes("heart_failure") || request.factors.includes("ckd")) {
    if (isSglt2) { score += 28; reasons.push("اولویت قلبی‌ـ‌کلیوی برای HF/CKD"); }
    if (isGlp && request.factors.includes("ckd")) { score += 10; reasons.push("قابل بررسی با توجه به منفعت قلبی‌ـ‌کلیوی"); }
  }
  if (request.factors.includes("ascvd") && isGlp) { score += 20; reasons.push("اولویت فرآورده‌های دارای شواهد پیامد قلبی‌عروقی"); }
  if (request.factors.includes("weight_priority")) {
    if (isGlp) { score += 22; reasons.push("اثر مطلوب‌تر بر وزن"); }
    else if (isSglt2) { score += 10; reasons.push("اثر وزن‌خنثی تا کاهنده"); }
    else if (isInsulin || isTzd || className.includes("sulfonylurea")) score -= 12;
  }
  if (request.factors.includes("hypoglycemia_risk")) {
    if (isMetformin || isSglt2 || isDpp4 || isGlp) { score += 14; reasons.push("ریسک ذاتی پایین‌تر هیپوگلیسمی"); }
    if (isHypoglycemiaProne) score -= 28;
  }
  if (request.factors.includes("heart_failure") && isTzd) score -= 45;
  if (request.eGfr !== undefined && request.eGfr < 30 && isMetformin) score -= 60;

  const costPreference = request.costPreference ?? "no_constraint";
  if (costPreference === "low_cost_only") {
    if (relativeCost === "low") { score += 22; reasons.push("در گروه کم‌هزینه‌تر گایدلاین"); }
    if (relativeCost === "medium") score -= 5;
  } else if (costPreference === "moderate") {
    if (relativeCost === "low") { score += 10; reasons.push("تناسب بهتر با محدودیت هزینه"); }
    if (relativeCost === "high") score -= 18;
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Produces a traceable pathway priority, not a prescription or dose.
 * Thresholds follow ADA Standards of Care in Diabetes—2026, Section 9.
 */
export function buildType2PathwayRecommendation(request: Type2ConsiderationRequest): Type2AssessmentResult["recommendation"] {
  const hba1cGap = roundGap(request.currentHba1c - request.targetHba1c);
  const urgentReview = Boolean(request.hyperglycemiaSymptoms || request.catabolicFeatures || request.currentHba1c > 10);
  const rationale = [
    `HbA1c فعلی ${request.currentHba1c.toFixed(1)}٪ و هدف فردی ${request.targetHba1c.toFixed(1)}٪ است؛ فاصله ${hba1cGap.toFixed(1)} واحد درصد.`
  ];

  if (urgentReview) {
    rationale.push("HbA1c بالاتر از ۱۰٪، علائم واضح هایپرگلیسمی یا شواهد کاتابولیسم از معیارهای بررسی انسولین به‌عنوان اولین درمان تزریقی هستند.");
    rationale.push("نیاز به رد کتوز، کمبود انسولین و وضعیت حاد باید همان روز توسط پزشک ارزیابی شود.");
    return {
      priority: "consider_insulin",
      title: "انسولین را به‌عنوان درمان تزریقی اولیه بررسی کنید",
      rationale,
      hba1cGap,
      urgentReview,
      ...ada2026Section9
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
      ...ada2026Section9
    };
  }

  if (hba1cGap > 0) {
    rationale.push("HbA1c بالاتر از هدف است؛ درمان فعلی، پایبندی، تحمل‌پذیری و بیماری‌های همراه برای تشدید مرحله‌ای مرور شوند.");
    return {
      priority: request.workflow === "initiation" ? "single_or_stepwise_therapy" : "combination_therapy",
      title: request.workflow === "initiation" ? "درمان اولیهٔ فردمحور را انتخاب کنید" : "درمان فعلی را تشدید کنید",
      rationale,
      hba1cGap,
      urgentReview,
      ...ada2026Section9
    };
  }

  rationale.push("HbA1c در محدودهٔ هدف ثبت‌شده است؛ اثربخشی، عوارض و بار درمانی بازبینی و پایش دوره‌ای ادامه یابد.");
  return {
    priority: "maintain_and_monitor",
    title: "هدف فعلی حفظ شده است؛ پایش و بازبینی ادامه یابد",
    rationale,
    hba1cGap,
    urgentReview,
    ...ada2026Section9
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
 * This layer exposes only class-level clinical considerations for review. It
 * deliberately has no dose, no order set and no patient-specific prescription
 * output. An approved protocol is still required before any treatment output.
 */
export function buildType2MedicationConsiderations(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest
): Type2MedicationConsideration[] {
  const pathway = buildType2PathwayRecommendation(request);
  return medications.flatMap((medication) => {
    const relativeCost = relativeCostFor(medication);
    const costPreference = request.costPreference ?? "no_constraint";
    if (costPreference === "low_cost_only" && relativeCost === "high") return [];
    const considerations: string[] = [];
    const cautions: string[] = [];
    const blockedBy: string[] = [];
    const className = medication.className ?? "";
    const name = medication.canonicalName.toLocaleLowerCase();

    if (name === "metformin") {
      considerations.push("داروی پایهٔ رایج؛ وضعیت کلیه، تحمل گوارشی و B12 باید در تصمیم پزشک لحاظ شود.");
      if (request.eGfr !== undefined && request.eGfr < 30) blockedBy.push("eGFR کمتر از ۳۰: این ابزار شروع/ادامه را تأیید نمی‌کند؛ برچسب دارو و تصمیم پزشک بررسی شود.");
      else if (request.eGfr !== undefined && request.eGfr < 45) cautions.push("eGFR کمتر از ۴۵: نیاز به بازبینی کلیوی و برچسب فرآورده.");
    }

    if (className.includes("SGLT2")) {
      if (request.factors.includes("heart_failure")) considerations.push("در نارسایی قلبی، گزینه‌های دارای شواهد این کلاس در اولویت بررسی قرار می‌گیرند.");
      if (request.factors.includes("ckd")) considerations.push("در CKD، منفعت قلبی-کلیوی و آستانهٔ eGFR هر فرآورده باید با برچسب و پروتکل بررسی شود.");
      cautions.push("خطرات حجم/فشارخون، عفونت‌های تناسلی-ادراری و وضعیت بالینی حاد باید توسط پزشک مرور شود.");
      if (request.eGfr !== undefined && request.eGfr < 20) cautions.push("eGFR کمتر از ۲۰: برای این ابزار، بررسی تخصصی برچسب و پروتکل لازم است.");
    }

    if (medication.therapyGroup === "glp_1_receptor_agonist" || medication.therapyGroup === "dual_gip_glp_1_receptor_agonist") {
      if (request.factors.includes("ascvd")) considerations.push("در ASCVD، فرآوردهٔ دارای شواهد پیامد قلبی-عروقی در اولویت بررسی قرار می‌گیرد.");
      if (request.factors.includes("weight_priority")) considerations.push("برای هدف مدیریت وزن، اثربخشی و تحمل‌پذیری فرآورده باید در تصمیم مشترک مرور شود.");
      cautions.push("تحمل گوارشی، سابقهٔ پانکراتیت و هشدارهای اختصاصی برچسب باید مرور شود.");
      cautions.push("هم‌زمانی با DPP-4 inhibitor به‌عنوان ترکیب معمول در این ابزار پیشنهاد نمی‌شود.");
    }

    if (className.includes("DPP-4")) {
      considerations.push("گزینهٔ خوراکی با خطر هیپوگلیسمی پایین در نبود ترکیب‌های هیپوگلیسمی‌زا.");
      if (request.factors.includes("heart_failure") && (name === "saxagliptin" || name === "alogliptin")) cautions.push("در نارسایی قلبی، هشدار اختصاصی این فرآورده باید با برچسب و پزشک مرور شود.");
      cautions.push("در اغلب اعضای کلاس، تنظیمات مرتبط با عملکرد کلیه باید بررسی شود.");
    }

    if (className.includes("Sulfonylurea") || className.includes("Meglitinide")) {
      cautions.push("خطر هیپوگلیسمی و افزایش وزن؛ در ریسک بالای هیپوگلیسمی با احتیاط بررسی شود.");
      if (request.factors.includes("hypoglycemia_risk")) blockedBy.push("ریسک بالای هیپوگلیسمی: این کلاس در پیشنهادهای اولویت‌دار نمایش داده نمی‌شود.");
    }

    if (className.includes("Thiazolidinedione")) {
      cautions.push("احتباس مایع، افزایش وزن، شکستگی و هشدارهای اختصاصی برچسب باید مرور شود.");
      if (request.factors.includes("heart_failure")) blockedBy.push("نارسایی قلبی/خطر احتباس مایع: نیاز به بازبینی پزشک و برچسب؛ پیشنهاد خودکار مسدود است.");
    }

    if (medication.therapyGroup === "human_insulin" || medication.therapyGroup === "basal_insulin_analog" || medication.therapyGroup === "prandial_insulin_analog" || medication.therapyGroup === "premixed_insulin") {
      considerations.push("مسیر انسولین با توجه به HbA1c، علائم هایپرگلیسمی، شواهد کاتابولیسم و وضعیت درمان فعلی بررسی می‌شود.");
      cautions.push("این نسخهٔ برنامه هیچ دوز، تیتر کردن یا تبدیل واحد انسولین تولید نمی‌کند.");
      if (request.factors.includes("hypoglycemia_risk")) cautions.push("ریسک هیپوگلیسمی باید در انتخاب فرآورده و طرح پایش لحاظ شود.");
    }

    if (medication.therapyGroup === "fixed_ratio_combination") {
      considerations.push("ترکیب ثابت انسولین/GLP-1 فقط در مسیر اختصاصی FRC و با تطبیق دقیق فرآورده و قدرت بررسی می‌شود.");
      cautions.push("قدرت‌های Soliqua/Suliqua 100/33 و 100/50 باید به‌صورت فرآورده‌های مجزا و بدون تبدیل خودکار ثبت شوند.");
    }

    if (considerations.length === 0) considerations.push("انتخاب این کلاس نیازمند تطبیق با هدف درمان، هم‌ابتلایی، برچسب و ترجیحات بیمار است.");

    if (costPreference !== "no_constraint") {
      considerations.push(relativeCost === "low"
        ? "در گروه گزینه‌های کم‌هزینه‌تر معرفی‌شده در گایدلاین قرار می‌گیرد."
        : "هزینه و پوشش بیمه‌ای این فرآورده باید پیش از انتخاب بررسی شود.");
    }
    const ranking = scoreMedication(medication, request, pathway, relativeCost);
    const priorityTier: Type2MedicationConsideration["priorityTier"] = ranking.score >= 75 ? "recommended" : ranking.score >= 58 ? "preferred" : "consider";
    return [{
      genericMedicationId: medication.id,
      genericName: medication.canonicalName,
      persianName: medication.persianName,
      therapeuticClass: className || "سایر",
      therapyGroup: medication.therapyGroup ?? "oral_glucose_lowering",
      ...ada2026Section9,
      considerations,
      cautions,
      blockedBy: blockedBy.length ? blockedBy : undefined,
      priorityScore: ranking.score,
      priorityTier,
      relativeCost,
      rankingReasons: ranking.reasons.length ? ranking.reasons : ["قابل بررسی پس از تطبیق با شرایط و ترجیحات بیمار"],
      outputStatus: "information_only" as const
    }];
  }).sort((left, right) => right.priorityScore - left.priorityScore || left.persianName.localeCompare(right.persianName, "fa"));
}
