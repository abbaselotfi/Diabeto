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
  Type2Workflow,
} from "@glymize/contracts";
import {
  evidenceReference,
  primaryEvidenceUrl,
} from "./guideline-registry.js";
import {
  getActiveClinicalRulePack,
  type ClinicalRulePack,
} from "./rule-pack.js";

export * from "./guideline-registry.js";
export * from "./rule-pack.js";

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
    patientDataPolicy: "anonymous_only",
  };
}

export interface MedicationPresentation {
  primaryName: string;
  genericName: string;
  selectedBrand?: BrandMarketEntry;
}

/** The clinical engine consumes the generic id; brand preference remains presentation-only. */
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
      Boolean(brand.verifiedAt),
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
      selectedBrand,
    };
  }
  return {
    primaryName: input.medication.persianName,
    genericName: input.medication.persianName,
    selectedBrand,
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
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
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
    normalizedMedicationIdentity(current.genericName) === medicationName,
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

function contextualPathwayEvidence(request: Type2ConsiderationRequest): string[] {
  const ids: string[] = [EVIDENCE.ada, EVIDENCE.easd];
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
  relativeCost: Type2MedicationConsideration["relativeCost"],
  pack: ClinicalRulePack,
) {
  const reasons: string[] = [];
  const evidenceIds = new Set<string>([EVIDENCE.ada, EVIDENCE.easd]);
  const addEvidence = (...ids: string[]) => ids.forEach((id) => evidenceIds.add(id));
  const weights = pack.type2.weights;
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
    score += weights.severeHyperglycemiaInsulin;
    reasons.push("هماهنگ با مسیر انسولین در هایپرگلیسمی شدید [ADA 2026]");
  }
  if (pathway.priority === "consider_insulin" && isGlargine) {
    score += weights.basalGlargineWithinInsulinPath;
    reasons.push("اولویت انسولین پایه در مسیر فعلی [ADA 2026]");
  }
  if (pathway.priority === "glp1_based_therapy" && isGlp) {
    score += weights.glp1Pathway;
    reasons.push("هماهنگ با اولویت درمان مبتنی بر GLP-1 در این مسیر [ADA 2026 / EASD]");
  }

  if (hasDecisionFactor(request, "heart_failure") || hasDecisionFactor(request, "ckd")) {
    if (isSglt2) {
      score += weights.sglt2Cardiorenal;
      reasons.push("اولویت قلبی‌ـ‌کلیوی برای HF/CKD بر اساس شواهد پیامدی [ADA 2026 / ESC 2023 / KDIGO]");
      if (hasDecisionFactor(request, "heart_failure")) addEvidence(EVIDENCE.escDmCvd);
      if (hasDecisionFactor(request, "ckd")) addEvidence(EVIDENCE.kdigoCkd, EVIDENCE.kdigoDmCkd);
    }
    if (isGlp && hasDecisionFactor(request, "ckd")) {
      score += weights.glp1Ckd;
      reasons.push("قابل بررسی با توجه به منفعت قلبی‌ـ‌کلیوی در دیابت همراه CKD [ADA 2026 / KDIGO 2022/2024]");
      addEvidence(EVIDENCE.kdigoDmCkd, EVIDENCE.kdigoCkd);
    }
  }

  if (hasDecisionFactor(request, "ascvd")) {
    addEvidence(EVIDENCE.escDmCvd);
    if (isGlp) {
      score += weights.glp1Ascvd;
      reasons.push("اولویت فرآورده‌های GLP-1 دارای شواهد پیامد قلبی‌عروقی [ADA 2026 / ESC-DM-CVD 2023]");
    } else if (isSglt2) {
      score += weights.sglt2Ascvd;
      reasons.push("SGLT2 دارای شواهد قلبی‌ـ‌کلیوی در زمینه ASCVD قابل اولویت است [ADA 2026 / ESC-DM-CVD 2023]");
    }
  }

  if (hasDecisionFactor(request, "weight_priority")) {
    if (isGlp) {
      score += weights.glp1Weight;
      reasons.push("اثر مطلوب‌تر بر وزن و تناسب با رویکرد فردمحور [ADA 2026 / ADA-EASD consensus]");
    } else if (isSglt2) {
      score += weights.sglt2Weight;
      reasons.push("اثر وزن‌خنثی تا کاهنده [ADA 2026 / ADA-EASD consensus]");
    } else if (isInsulin || isTzd || className.includes("sulfonylurea")) score -= weights.weightGainPenalty;
  }

  if (hasDecisionFactor(request, "hypoglycemia_risk")) {
    if (isMetformin || isSglt2 || isDpp4 || isGlp) {
      score += weights.lowHypoglycemiaRisk;
      reasons.push("ریسک ذاتی پایین‌تر هیپوگلیسمی [ADA 2026 / ADA-EASD consensus]");
    }
    if (isHypoglycemiaProne) score -= weights.hypoglycemiaPronePenalty;
  }

  if (hasDecisionFactor(request, "heart_failure") && isTzd) {
    score -= weights.tzdHeartFailurePenalty;
    reasons.push("احتباس مایع/نارسایی قلبی، اولویت این کلاس را کاهش می‌دهد [ADA 2026 / ESC-DM-CVD 2023]");
    addEvidence(EVIDENCE.escDmCvd);
  }

  if (eGfr !== undefined && eGfr < pack.type2.metforminContraindicatedBelowEgfr && isMetformin) {
    score -= weights.metforminLowEgfrPenalty;
    reasons.push("محدودیت ایمنی کلیوی در eGFR پایین [ADA 2026 / KDIGO-CKD 2024 / KDIGO-DMCKD 2022]");
    addEvidence(EVIDENCE.kdigoCkd, EVIDENCE.kdigoDmCkd);
  }

  if (hasDecisionFactor(request, "masld_mash")) {
    addEvidence(EVIDENCE.easlMasld);
    if (isGlp) {
      score += weights.masldGlp1Context;
      reasons.push("در MASLD/MASH، درمان دیابت/چاقی با فنوتیپ متابولیک و مرحله کبد تطبیق داده می‌شود [EASL–EASD–EASO 2024 / ADA 2026]");
    }
    if (isResmetirom) {
      addEvidence(EVIDENCE.emaResmetirom);
      const eligibleFibrosis = pack.type2.resmetiromEligibleFibrosisStages.includes(
        liver?.fibrosisStage as "F2" | "F3",
      );
      const cirrhosis = Boolean(liver?.cirrhosis || liver?.decompensatedCirrhosis || liver?.fibrosisStage === "F4");
      if (eligibleFibrosis && !cirrhosis) {
        score += weights.resmetiromEligible;
        reasons.push("MASH غیرسیروتیک با فیبروز F2–F3 با محدوده مجوز EMA برای resmetirom هم‌راستا است [EMA Rezdiffra]");
      } else {
        score -= weights.resmetiromIneligiblePenalty;
        reasons.push("معیارهای مرحله فیبروز/سیروز با محدوده مجوز EMA برای resmetirom هم‌راستا نیست [EMA Rezdiffra]");
      }
    }
  }

  const costPreference = request.costPreference ?? "no_constraint";
  if (costPreference === "low_cost_only") {
    if (relativeCost === "low") { score += weights.lowCostOnlyLow; reasons.push("در گروه گزینه‌های کم‌هزینه‌تر قرار می‌گیرد"); }
    if (relativeCost === "medium") score -= weights.lowCostOnlyMediumPenalty;
  } else if (costPreference === "moderate") {
    if (relativeCost === "low") { score += weights.moderateCostLow; reasons.push("تناسب بهتر با محدودیت هزینه"); }
    if (relativeCost === "high") score -= weights.moderateCostHighPenalty;
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
  if (name === "metformin") risks.push("عدم تحمل گوارشی و کمبود B12؛ منع مصرف در eGFR کمتر از آستانه مصوب Rule Pack");
  if (!risks.length) risks.push("عوارض و منع مصرف اختصاصی برچسب فرآورده باید بررسی شود");
  return risks;
}

/**
 * Produces a traceable pathway priority, not a prescription or dose.
 * Thresholds are read from the active, approved rule pack; contextual sources
 * are attached only when they actually influence this encounter.
 */
export function buildType2PathwayRecommendation(
  request: Type2ConsiderationRequest,
  pack: ClinicalRulePack = getActiveClinicalRulePack(),
): Type2AssessmentResult["recommendation"] {
  const hba1cGap = roundGap(request.currentHba1c - request.targetHba1c);
  const urgentReview = Boolean(
    request.hyperglycemiaSymptoms ||
    request.catabolicFeatures ||
    request.currentHba1c > pack.type2.severeHyperglycemiaA1cThreshold,
  );
  const workflow = resolveType2Workflow(request);
  const currentTherapies = activeCurrentMedications(request);
  const sourceFields = evidenceFields(contextualPathwayEvidence(request));
  const rationale = [
    `HbA1c فعلی ${request.currentHba1c.toFixed(1)}٪ و هدف فردی ${request.targetHba1c.toFixed(1)}٪ است؛ فاصله ${hba1cGap.toFixed(1)} واحد درصد.`,
  ];

  if (currentTherapies.length) {
    rationale.push(`${currentTherapies.length} درمان فعال برای بیمار ثبت شده است؛ موتور این ارزیابی را به‌عنوان بهینه‌سازی/تشدید درمان پردازش می‌کند.`);
  }
  if (hasDecisionFactor(request, "ckd")) {
    rationale.push("عامل CKD فعال است؛ eGFR/UACR و medication stewardship با ADA 2026 و KDIGO-CKD 2024 / KDIGO-DMCKD 2022 در انتخاب و رتبه‌بندی لحاظ می‌شود.");
  }
  if (hasDecisionFactor(request, "masld_mash")) {
    rationale.push("عامل MASLD/MASH فعال است؛ مرحله فیبروز و سیروز طبق EASL–EASD–EASO 2024 و منابع رگولاتوری مرتبط وارد تصمیم می‌شود.");
  }
  if (hasDecisionFactor(request, "diabetic_foot")) {
    rationale.push("پای دیابتی فعال است؛ ارزیابی زخم و عفونت طبق IWGDF/IDSA Infection 2023 و IWGDF Wound Healing 2023 باید موازی انجام شود و رتبه داروی کاهنده قند جایگزین این مسیر نیست.");
  }

  if (urgentReview) {
    rationale.push(`HbA1c بالاتر از ${pack.type2.severeHyperglycemiaA1cThreshold}٪، علائم واضح هایپرگلیسمی یا شواهد کاتابولیسم مسیر بررسی انسولین را فعال می‌کند [ADA 2026].`);
    rationale.push("نیاز به رد کتوز، کمبود انسولین و وضعیت حاد باید همان روز توسط پزشک ارزیابی شود.");
    return { priority: "consider_insulin", title: "انسولین را به‌عنوان درمان تزریقی اولیه بررسی کنید", rationale, hba1cGap, urgentReview, ...sourceFields };
  }

  if (hba1cGap >= pack.type2.combinationTherapyGap) {
    rationale.push(`فاصلهٔ حداقل ${pack.type2.combinationTherapyGap} واحد درصد از هدف، شروع یا تشدید درمان ترکیبی را مطرح می‌کند [ADA 2026].`);
    rationale.push("در نبود هایپرگلیسمی شدید یا شواهد کمبود انسولین، درمان GLP-1-based بر انسولین ترجیح دارد [ADA 2026 / ADA-EASD consensus].");
    return { priority: "glp1_based_therapy", title: "درمان ترکیبی با اولویت GLP-1 یا GIP/GLP-1 را بررسی کنید", rationale, hba1cGap, urgentReview, ...sourceFields };
  }

  if (hba1cGap > 0) {
    rationale.push("HbA1c بالاتر از هدف است؛ درمان فعلی، پایبندی، تحمل‌پذیری و بیماری‌های همراه برای تشدید مرحله‌ای مرور شوند [ADA 2026 / ADA-EASD consensus].");
    return {
      priority: workflow === "initiation" ? "single_or_stepwise_therapy" : "combination_therapy",
      title: workflow === "initiation" ? "درمان اولیهٔ فردمحور را انتخاب کنید" : "درمان فعلی را تشدید کنید",
      rationale,
      hba1cGap,
      urgentReview,
      ...sourceFields,
    };
  }

  rationale.push("HbA1c در محدوده هدف است؛ اثربخشی، عوارض و بار درمانی بازبینی و پایش دوره‌ای ادامه یابد [ADA 2026].");
  return { priority: "maintain_and_monitor", title: "هدف فعلی حفظ شده است؛ پایش و بازبینی ادامه یابد", rationale, hba1cGap, urgentReview, ...sourceFields };
}

export function buildType2Assessment(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest,
  pack: ClinicalRulePack = getActiveClinicalRulePack(),
): Type2AssessmentResult {
  return {
    recommendation: buildType2PathwayRecommendation(request, pack),
    medications: buildType2MedicationConsiderations(medications, request, pack),
  };
}

/**
 * Class-level considerations remain informational. Dose/titration output stays
 * gated until a versioned MedicationDoseRule has been clinically approved.
 */
export function buildType2MedicationConsiderations(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest,
  pack: ClinicalRulePack = getActiveClinicalRulePack(),
): Type2MedicationConsideration[] {
  const pathway = buildType2PathwayRecommendation(request, pack);
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
    const className = medication.className?.toLocaleLowerCase() ?? "";
    const name = medication.canonicalName.toLocaleLowerCase();
    const currentMedication = currentMedicationFor(medication, request);
    const therapyAction: Type2MedicationConsideration["therapyAction"] = currentMedication
      ? "review_current_therapy"
      : workflow === "initiation"
        ? "consider_initiation"
        : "consider_addition";

    if (currentMedication) {
      considerations.push("این دارو در درمان فعلی بیمار ثبت شده است؛ ادامه/تیتراسیون/کاهش یا تعویض باید در لایه دوز بررسی شود.");
      if (currentMedication.adherence === "poor" || currentMedication.adherence === "partial") cautions.push("پایبندی کامل نیست؛ علت عدم پایبندی پیش از تشدید درمان بررسی شود.");
      if (currentMedication.tolerance === "limited" || currentMedication.tolerance === "intolerant") cautions.push("تحمل‌پذیری درمان فعلی محدود است و باید در تصمیم ادامه یا تعویض لحاظ شود.");
    }

    if (name === "metformin") {
      considerations.push("داروی پایه رایج؛ وضعیت کلیه، تحمل گوارشی و B12 باید در تصمیم پزشک لحاظ شود [ADA 2026 / KDIGO].");
      if (eGfr !== undefined && eGfr < pack.type2.metforminContraindicatedBelowEgfr) {
        blockedBy.push(`eGFR کمتر از ${pack.type2.metforminContraindicatedBelowEgfr}: این ابزار شروع/ادامه را تأیید نمی‌کند [ADA 2026 / KDIGO-CKD 2024 / KDIGO-DMCKD 2022].`);
      } else if (eGfr !== undefined && eGfr < pack.type2.metforminReviewBelowEgfr) {
        cautions.push(`eGFR کمتر از ${pack.type2.metforminReviewBelowEgfr}: بازبینی کلیوی و برچسب فرآورده لازم است [ADA 2026 / KDIGO].`);
      }
    }

    if (className.includes("sglt2")) {
      if (hasDecisionFactor(request, "heart_failure")) considerations.push("در HF، گزینه‌های دارای شواهد این کلاس در اولویت بررسی قرار می‌گیرند [ADA 2026 / ESC-DM-CVD 2023].");
      if (hasDecisionFactor(request, "ckd")) considerations.push("در CKD، منفعت قلبی‌ـ‌کلیوی و آستانه eGFR فرآورده بررسی می‌شود [ADA 2026 / KDIGO-CKD 2024 / KDIGO-DMCKD 2022].");
      cautions.push("وضعیت حجم/فشارخون، عفونت تناسلی‌ـ‌ادراری و بیماری حاد باید مرور شود.");
      if (eGfr !== undefined && eGfr < pack.type2.sglt2SpecialistReviewBelowEgfr) cautions.push(`eGFR کمتر از ${pack.type2.sglt2SpecialistReviewBelowEgfr}: تطبیق دقیق برچسب و پروتکل لازم است.`);
    }

    if (medication.therapyGroup === "glp_1_receptor_agonist" || medication.therapyGroup === "dual_gip_glp_1_receptor_agonist") {
      if (hasDecisionFactor(request, "ascvd")) considerations.push("در ASCVD، فرآورده دارای شواهد پیامد قلبی در اولویت است [ADA 2026 / ESC-DM-CVD 2023].");
      if (hasDecisionFactor(request, "weight_priority")) considerations.push("برای هدف وزن، اثربخشی و تحمل‌پذیری در تصمیم مشترک مرور می‌شود [ADA 2026 / ADA-EASD consensus].");
      if (hasDecisionFactor(request, "masld_mash")) considerations.push("در MASLD/MASH این کلاس بر مبنای اندیکاسیون دیابت/چاقی و وضعیت کبدی رتبه‌بندی می‌شود [EASL–EASD–EASO 2024 / ADA 2026].");
      cautions.push("تحمل گوارشی، سابقه پانکراتیت و هشدارهای برچسب بررسی شود.");
      cautions.push("هم‌زمانی معمول با DPP-4 inhibitor پیشنهاد نمی‌شود [ADA 2026].");
    }

    if (className.includes("dpp-4")) {
      considerations.push("گزینه خوراکی با خطر ذاتی پایین هیپوگلیسمی؛ تنظیمات کلیوی اغلب اعضای کلاس باید بررسی شود.");
      if (hasDecisionFactor(request, "heart_failure") && (name === "saxagliptin" || name === "alogliptin")) cautions.push("در HF هشدار اختصاصی فرآورده با برچسب و پزشک مرور شود.");
    }

    if (className.includes("sulfonylurea") || className.includes("meglitinide")) {
      cautions.push("خطر هیپوگلیسمی و افزایش وزن [ADA 2026 / ADA-EASD consensus].");
      if (hasDecisionFactor(request, "hypoglycemia_risk")) blockedBy.push("ریسک بالای هیپوگلیسمی: این کلاس در پیشنهادهای اولویت‌دار پایین آورده می‌شود.");
    }

    if (className.includes("thiazolidinedione")) {
      cautions.push("احتباس مایع، افزایش وزن، شکستگی و هشدارهای برچسب باید مرور شود.");
      if (hasDecisionFactor(request, "heart_failure")) blockedBy.push("HF/خطر احتباس مایع: پیشنهاد خودکار مسدود و بازبینی پزشک لازم است [ADA 2026 / ESC-DM-CVD 2023].");
    }

    if (name.includes("resmetirom")) {
      const liver = request.clinicalContext?.liver;
      const eligibleFibrosis = pack.type2.resmetiromEligibleFibrosisStages.includes(liver?.fibrosisStage as "F2" | "F3");
      const cirrhosis = Boolean(liver?.cirrhosis || liver?.decompensatedCirrhosis || liver?.fibrosisStage === "F4");
      if (hasDecisionFactor(request, "masld_mash") && eligibleFibrosis && !cirrhosis) {
        considerations.push("Resmetirom فقط در MASH غیرسیروتیک با فیبروز F2–F3 قابل بررسی است؛ تطبیق برچسب و ارزیابی تخصصی کبد الزامی است [EMA Rezdiffra].");
      } else {
        blockedBy.push("معیار MASH غیرسیروتیک F2–F3 ثبت نشده یا سیروز مطرح است؛ resmetirom خودکار پیشنهاد نمی‌شود [EMA Rezdiffra].");
      }
    }

    if (["human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin"].includes(medication.therapyGroup ?? "")) {
      considerations.push("مسیر انسولین بر اساس HbA1c، علائم، کاتابولیسم و درمان فعلی بررسی می‌شود [ADA 2026].");
      cautions.push("دوز/تیتراسیون/تبدیل فقط از ماژول اختصاصی Ruleهای نسخه‌بندی‌شده تولید خواهد شد.");
      if (hasDecisionFactor(request, "hypoglycemia_risk")) cautions.push("ریسک هیپوگلیسمی در انتخاب فرآورده و طرح پایش لحاظ شود.");
    }

    if (medication.therapyGroup === "fixed_ratio_combination") {
      considerations.push("FRC انسولین/GLP-1 فقط در مسیر اختصاصی و با تطبیق فرآورده/قدرت بررسی می‌شود.");
    }

    if (considerations.length === 0) considerations.push("انتخاب این کلاس نیازمند تطبیق با هدف درمان، هم‌ابتلایی، برچسب و ترجیحات بیمار است.");
    if (costPreference !== "no_constraint") {
      considerations.push(relativeCost === "low" ? "در گروه گزینه‌های کم‌هزینه‌تر قرار می‌گیرد." : "هزینه و پوشش بیمه پیش از انتخاب بررسی شود.");
    }

    const ranking = scoreMedication(medication, request, pathway, relativeCost, pack);
    if (currentMedication) ranking.reasons.unshift("این دارو بخشی از رژیم فعلی بیمار است و به‌جای افزودن مجدد باید برای ادامه/تیتراسیون/تعویض بازبینی شود");
    const priorityTier: Type2MedicationConsideration["priorityTier"] = ranking.score >= 75 ? "recommended" : ranking.score >= 58 ? "preferred" : "consider";
    const sourceFields = evidenceFields(ranking.evidenceIds);
    considerations.push(`مرجع علمی این پیشنهاد: ${sourceFields.sourceReference}`);

    return [{
      genericMedicationId: medication.id,
      genericName: medication.canonicalName,
      persianName: medication.persianName,
      therapeuticClass: medication.className ?? "سایر",
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
      outputStatus: "information_only" as const,
    }];
  }).sort((left, right) => right.priorityScore - left.priorityScore || left.persianName.localeCompare(right.persianName, "fa"));
}
