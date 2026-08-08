import { activeGuidelineSources } from "./guideline-registry.js";

export type ClinicalRulePackStatus = "draft" | "in_review" | "approved" | "retired";

export interface Type2RuleWeights {
  severeHyperglycemiaInsulin: number;
  basalGlargineWithinInsulinPath: number;
  glp1Pathway: number;
  sglt2Cardiorenal: number;
  glp1Ckd: number;
  glp1Ascvd: number;
  sglt2Ascvd: number;
  glp1Weight: number;
  sglt2Weight: number;
  weightGainPenalty: number;
  lowHypoglycemiaRisk: number;
  hypoglycemiaPronePenalty: number;
  tzdHeartFailurePenalty: number;
  metforminLowEgfrPenalty: number;
  masldGlp1Context: number;
  resmetiromEligible: number;
  resmetiromIneligiblePenalty: number;
  lowCostOnlyLow: number;
  lowCostOnlyMediumPenalty: number;
  moderateCostLow: number;
  moderateCostHighPenalty: number;
}

export interface Type2RuleParameters {
  severeHyperglycemiaA1cThreshold: number;
  combinationTherapyGap: number;
  metforminContraindicatedBelowEgfr: number;
  metforminReviewBelowEgfr: number;
  sglt2SpecialistReviewBelowEgfr: number;
  resmetiromEligibleFibrosisStages: Array<"F2" | "F3">;
  weights: Type2RuleWeights;
}

export interface ClinicalRuleDefinition {
  id: string;
  domain: string;
  descriptionFa: string;
  descriptionEn: string;
  sourceIds: string[];
  engineEffect: string;
}

export interface ClinicalRulePack {
  schemaVersion: 1;
  id: string;
  version: string;
  status: ClinicalRulePackStatus;
  effectiveAt: string;
  approvedAt?: string;
  approvedBy?: string;
  sourceVersions: Record<string, string>;
  type2: Type2RuleParameters;
  rules: ClinicalRuleDefinition[];
}

const evidenceVersionMap = Object.fromEntries(
  activeGuidelineSources.map((source) => [source.id, source.activeVersion]),
);

/**
 * Executable defaults for the current reviewed engine. The important design
 * choice is that thresholds and weights live in a versioned rule pack rather
 * than being scattered through UI or API code. A future guideline update can
 * therefore produce a candidate pack, run regression/safety tests, receive
 * clinical approval, and then be activated without rewriting the engine.
 */
export const bundledClinicalRulePack: ClinicalRulePack = {
  schemaVersion: 1,
  id: "glymize-type2-core",
  version: "2026.08.1",
  status: "approved",
  effectiveAt: "2026-08-08",
  approvedAt: "2026-08-08",
  approvedBy: "GLYMIZE clinical build review",
  sourceVersions: evidenceVersionMap,
  type2: {
    severeHyperglycemiaA1cThreshold: 10,
    combinationTherapyGap: 1.5,
    metforminContraindicatedBelowEgfr: 30,
    metforminReviewBelowEgfr: 45,
    sglt2SpecialistReviewBelowEgfr: 20,
    resmetiromEligibleFibrosisStages: ["F2", "F3"],
    weights: {
      severeHyperglycemiaInsulin: 30,
      basalGlargineWithinInsulinPath: 16,
      glp1Pathway: 30,
      sglt2Cardiorenal: 28,
      glp1Ckd: 10,
      glp1Ascvd: 20,
      sglt2Ascvd: 16,
      glp1Weight: 22,
      sglt2Weight: 10,
      weightGainPenalty: 12,
      lowHypoglycemiaRisk: 14,
      hypoglycemiaPronePenalty: 28,
      tzdHeartFailurePenalty: 45,
      metforminLowEgfrPenalty: 60,
      masldGlp1Context: 8,
      resmetiromEligible: 35,
      resmetiromIneligiblePenalty: 60,
      lowCostOnlyLow: 22,
      lowCostOnlyMediumPenalty: 5,
      moderateCostLow: 10,
      moderateCostHighPenalty: 18,
    },
  },
  rules: [
    {
      id: "T2-GLYCEMIC-001",
      domain: "glycemic_control",
      descriptionFa: "هایپرگلیسمی شدید/علائم یا کاتابولیسم مسیر بررسی انسولین را فعال می‌کند.",
      descriptionEn: "Severe hyperglycemia, symptoms, or catabolism activates insulin review.",
      sourceIds: ["ada-2026"],
      engineEffect: "pathway:consider_insulin",
    },
    {
      id: "T2-GLYCEMIC-002",
      domain: "glycemic_control",
      descriptionFa: "فاصله زیاد از هدف، درمان ترکیبی و در نبود بحران اولویت GLP-1-based therapy را مطرح می‌کند.",
      descriptionEn: "A large A1C gap supports combination therapy and GLP-1-based priority absent crisis.",
      sourceIds: ["ada-2026", "easd-2022"],
      engineEffect: "pathway:combination_or_glp1",
    },
    {
      id: "T2-CKD-001",
      domain: "ckd",
      descriptionFa: "CKD رتبه SGLT2/GLP-1 و محدودیت‌های کلیوی متفورمین را تغییر می‌دهد.",
      descriptionEn: "CKD changes SGLT2/GLP-1 priority and metformin kidney-safety handling.",
      sourceIds: ["ada-2026", "kdigo-ckd-2024", "kdigo-dmckd-2022"],
      engineEffect: "ranking_and_safety:ckd",
    },
    {
      id: "T2-CV-001",
      domain: "ascvd_heart_failure",
      descriptionFa: "ASCVD/HF روی اولویت درمان‌های دارای شواهد پیامد قلبی و محدودیت TZD اثر می‌گذارد.",
      descriptionEn: "ASCVD/HF changes outcome-based therapy priority and TZD handling.",
      sourceIds: ["ada-2026", "esc-dm-cvd-2023"],
      engineEffect: "ranking_and_safety:cardiovascular",
    },
    {
      id: "T2-LIVER-001",
      domain: "masld_mash",
      descriptionFa: "MASLD/MASH مرحله فیبروز و سیروز را وارد تصمیم می‌کند.",
      descriptionEn: "MASLD/MASH introduces fibrosis stage and cirrhosis into decision support.",
      sourceIds: ["ada-2026", "easl-masld-2024"],
      engineEffect: "ranking_and_safety:liver",
    },
    {
      id: "T2-LIVER-002",
      domain: "resmetirom",
      descriptionFa: "Resmetirom فقط در محدوده مجوز رگولاتوری MASH غیرسیروتیک F2–F3 قابل بررسی است.",
      descriptionEn: "Resmetirom is considered only within the non-cirrhotic MASH F2–F3 regulatory indication.",
      sourceIds: ["easl-masld-2024", "ema-resmetirom-2025"],
      engineEffect: "eligibility:resmetirom",
    },
    {
      id: "T2-FOOT-001",
      domain: "diabetic_foot",
      descriptionFa: "وجود پای دیابتی مسیر موازی ارزیابی عفونت و زخم را فعال می‌کند و نباید با رتبه داروی قند جایگزین شود.",
      descriptionEn: "Diabetic foot activates a parallel infection/wound pathway rather than altering glucose-drug ranking artificially.",
      sourceIds: ["iwgdf-inf-2023", "iwgdf-wound-2023"],
      engineEffect: "parallel_pathway:diabetic_foot",
    },
  ],
};

let activeRulePack: ClinicalRulePack = structuredClone(bundledClinicalRulePack);

export function validateClinicalRulePack(pack: ClinicalRulePack): string[] {
  const errors: string[] = [];
  const knownSources = new Set(activeGuidelineSources.map((source) => source.id));

  if (pack.schemaVersion !== 1) errors.push("Unsupported clinical rule-pack schema version.");
  if (!pack.id.trim() || !pack.version.trim()) errors.push("Rule-pack id and version are required.");
  if (pack.status === "approved" && (!pack.approvedAt || !pack.approvedBy)) {
    errors.push("Approved rule packs require approvedAt and approvedBy.");
  }
  if (!(pack.type2.severeHyperglycemiaA1cThreshold > 0 && pack.type2.severeHyperglycemiaA1cThreshold <= 20)) {
    errors.push("Invalid severe-hyperglycemia A1C threshold.");
  }
  if (!(pack.type2.combinationTherapyGap > 0 && pack.type2.combinationTherapyGap <= 5)) {
    errors.push("Invalid combination-therapy A1C gap.");
  }
  if (!(pack.type2.metforminContraindicatedBelowEgfr < pack.type2.metforminReviewBelowEgfr)) {
    errors.push("Metformin kidney thresholds are inconsistent.");
  }

  const ruleIds = new Set<string>();
  for (const rule of pack.rules) {
    if (ruleIds.has(rule.id)) errors.push(`Duplicate clinical rule id: ${rule.id}`);
    ruleIds.add(rule.id);
    if (!rule.sourceIds.length) errors.push(`Clinical rule ${rule.id} has no evidence source.`);
    for (const sourceId of rule.sourceIds) {
      if (!knownSources.has(sourceId)) errors.push(`Clinical rule ${rule.id} references unknown source ${sourceId}.`);
    }
  }
  return errors;
}

export function getActiveClinicalRulePack(): ClinicalRulePack {
  return structuredClone(activeRulePack);
}

/**
 * Activation is intentionally gated. Remote source monitoring may create a
 * candidate pack, but only an already reviewed/approved pack can become
 * executable. This keeps guideline automation out of the direct patient path.
 */
export function activateApprovedClinicalRulePack(pack: ClinicalRulePack): ClinicalRulePack {
  const errors = validateClinicalRulePack(pack);
  if (errors.length) throw new Error(`Clinical rule pack rejected: ${errors.join(" | ")}`);
  if (pack.status !== "approved") throw new Error("Only an approved clinical rule pack can be activated.");
  activeRulePack = structuredClone(pack);
  return getActiveClinicalRulePack();
}

export function resetClinicalRulePackForTests() {
  activeRulePack = structuredClone(bundledClinicalRulePack);
}
