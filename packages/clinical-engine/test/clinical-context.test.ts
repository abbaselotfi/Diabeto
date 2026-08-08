import { afterEach, describe, expect, it } from "vitest";
import {
  activateApprovedClinicalRulePack,
  buildType2MedicationConsiderations,
  buildType2PathwayRecommendation,
  bundledClinicalRulePack,
  getActiveClinicalRulePack,
  resetClinicalRulePackForTests,
  resolveType2Workflow,
  validateClinicalRulePack,
} from "../src/index.js";

const metformin = {
  id: "metformin",
  canonicalName: "Metformin",
  persianName: "متفورمین",
  className: "Biguanide",
  therapyGroup: "oral_glucose_lowering" as const,
  administrationRoute: "oral" as const,
};

const empagliflozin = {
  id: "empagliflozin",
  canonicalName: "Empagliflozin",
  persianName: "امپاگلیفلوزین",
  className: "SGLT2 inhibitor",
  therapyGroup: "oral_glucose_lowering" as const,
  administrationRoute: "oral" as const,
};

afterEach(() => resetClinicalRulePackForTests());

describe("current medication aware Type 2 workflow", () => {
  it("infers intensification when an active current medication is present", () => {
    const request = {
      currentHba1c: 8,
      targetHba1c: 7,
      currentMedications: [{ genericMedicationId: "metformin", genericName: "Metformin", status: "active" as const }],
      factors: [],
    };

    expect(resolveType2Workflow(request)).toBe("intensification");
    const recommendation = buildType2PathwayRecommendation(request);
    expect(recommendation.priority).toBe("combination_therapy");
    expect(recommendation.title).toContain("تشدید");
    expect(recommendation.rationale.some((line) => line.includes("1 درمان فعال"))).toBe(true);
  });

  it("marks the current drug for regimen review instead of treating it as a new addition", () => {
    const result = buildType2MedicationConsiderations([metformin, empagliflozin], {
      currentHba1c: 8,
      targetHba1c: 7,
      currentMedications: [{
        genericMedicationId: "metformin",
        genericName: "Metformin",
        doseAmount: 1000,
        doseUnit: "mg",
        frequencyPerDay: 2,
        adherence: "good",
        tolerance: "good",
        status: "active",
      }],
      factors: [],
    });

    const current = result.find((item) => item.genericMedicationId === "metformin");
    const addition = result.find((item) => item.genericMedicationId === "empagliflozin");
    expect(current?.currentMedication).toBe(true);
    expect(current?.therapyAction).toBe("review_current_therapy");
    expect(addition?.therapyAction).toBe("consider_addition");
  });

  it("reads eGFR and CKD status from the structured kidney context and exposes KDIGO provenance", () => {
    const result = buildType2MedicationConsiderations([metformin, empagliflozin], {
      currentHba1c: 8,
      targetHba1c: 7,
      clinicalContext: { kidney: { ckd: true, eGfr: 25, uacrMgG: 300 } },
      factors: [],
    });

    const metforminResult = result.find((item) => item.genericMedicationId === "metformin");
    const empagliflozinResult = result.find((item) => item.genericMedicationId === "empagliflozin");
    expect(metforminResult?.blockedBy?.[0]).toContain("eGFR کمتر از");
    expect(metforminResult?.blockedBy?.[0]).toContain("KDIGO-CKD 2024");
    expect(empagliflozinResult?.rankingReasons.some((reason) => reason.includes("HF/CKD"))).toBe(true);
    expect(empagliflozinResult?.sourceReference).toContain("KDIGO-CKD 2024");
    expect(empagliflozinResult?.considerations.some((line) => line.includes("مرجع علمی این پیشنهاد"))).toBe(true);
  });

  it("attaches IWGDF infection and wound sources when diabetic foot is selected", () => {
    const recommendation = buildType2PathwayRecommendation({
      currentHba1c: 8,
      targetHba1c: 7,
      factors: ["diabetic_foot"],
    });

    expect(recommendation.rationale.some((line) => line.includes("پای دیابتی"))).toBe(true);
    expect(recommendation.sourceReference).toContain("IWGDF-INF 2023");
    expect(recommendation.sourceReference).toContain("IWGDF-WOUND 2023");
  });
});

describe("versioned clinical rule pack", () => {
  it("validates the bundled approved pack", () => {
    expect(validateClinicalRulePack(bundledClinicalRulePack)).toEqual([]);
    expect(getActiveClinicalRulePack().status).toBe("approved");
  });

  it("changes executable thresholds only after an approved pack is activated", () => {
    const candidate = structuredClone(bundledClinicalRulePack);
    candidate.version = "test-9pct-threshold";
    candidate.type2.severeHyperglycemiaA1cThreshold = 9;
    candidate.approvedAt = "2026-08-08";
    candidate.approvedBy = "automated test clinical reviewer";
    activateApprovedClinicalRulePack(candidate);

    const recommendation = buildType2PathwayRecommendation({
      currentHba1c: 9.2,
      targetHba1c: 7,
      factors: [],
    });
    expect(recommendation.priority).toBe("consider_insulin");
    expect(getActiveClinicalRulePack().version).toBe("test-9pct-threshold");
  });

  it("rejects an unapproved candidate from execution", () => {
    const candidate = structuredClone(bundledClinicalRulePack);
    candidate.status = "in_review";
    expect(() => activateApprovedClinicalRulePack(candidate)).toThrow("Only an approved clinical rule pack");
  });
});
