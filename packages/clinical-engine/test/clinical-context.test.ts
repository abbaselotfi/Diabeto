import { describe, expect, it } from "vitest";
import { buildType2MedicationConsiderations, buildType2PathwayRecommendation, resolveType2Workflow } from "../src/index.js";

const metformin = {
  id: "metformin",
  canonicalName: "Metformin",
  persianName: "متفورمین",
  className: "Biguanide",
  therapyGroup: "oral_glucose_lowering" as const,
  administrationRoute: "oral" as const
};

const empagliflozin = {
  id: "empagliflozin",
  canonicalName: "Empagliflozin",
  persianName: "امپاگلیفلوزین",
  className: "SGLT2 inhibitor",
  therapyGroup: "oral_glucose_lowering" as const,
  administrationRoute: "oral" as const
};

describe("current medication aware Type 2 workflow", () => {
  it("infers intensification when an active current medication is present", () => {
    const request = {
      currentHba1c: 8,
      targetHba1c: 7,
      currentMedications: [{ genericMedicationId: "metformin", genericName: "Metformin", status: "active" as const }],
      factors: []
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
        status: "active"
      }],
      factors: []
    });

    const current = result.find((item) => item.genericMedicationId === "metformin");
    const addition = result.find((item) => item.genericMedicationId === "empagliflozin");
    expect(current?.currentMedication).toBe(true);
    expect(current?.therapyAction).toBe("review_current_therapy");
    expect(addition?.therapyAction).toBe("consider_addition");
  });

  it("reads eGFR and CKD status from the structured kidney context", () => {
    const result = buildType2MedicationConsiderations([metformin, empagliflozin], {
      currentHba1c: 8,
      targetHba1c: 7,
      clinicalContext: { kidney: { ckd: true, eGfr: 25, uacrMgG: 300 } },
      factors: []
    });

    const metforminResult = result.find((item) => item.genericMedicationId === "metformin");
    const empagliflozinResult = result.find((item) => item.genericMedicationId === "empagliflozin");
    expect(metforminResult?.blockedBy?.[0]).toContain("eGFR کمتر از ۳۰");
    expect(empagliflozinResult?.rankingReasons.some((reason) => reason.includes("HF/CKD"))).toBe(true);
  });
});
