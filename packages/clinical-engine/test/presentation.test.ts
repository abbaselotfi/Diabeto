import { describe, expect, it } from "vitest";
import { buildType2MedicationConsiderations, buildType2PathwayRecommendation, gateClinicalOutput, resolveMedicationPresentation, selectDiabetesPathway } from "../src/index.js";

const medication = {
  id: "empagliflozin",
  canonicalName: "Empagliflozin",
  persianName: "امپاگلیفلوزین"
};

describe("diabetes pathway selection", () => {
  it("makes every anonymous pathway available in web mode", () => {
    expect(selectDiabetesPathway("pregnancy")).toEqual({
      diabetesType: "pregnancy",
      contentStatus: "enabled",
      patientDataPolicy: "anonymous_only"
    });
  });
});

describe("clinical protocol gate", () => {
  it("exposes a bundled protocol without an approval gate", () => {
    expect(gateClinicalOutput({
      id: "draft", title: "draft", diabetesType: "type_2", scope: "treatment_initiation",
      sourceUrl: "https://example.test", sourceReference: "test", publishedAt: "2026-01-01",
      status: "draft", clinicalReviewRequired: true
    })).toEqual({ enabled: true });
  });
});

describe("medication presentation", () => {
  it("uses generic-first by default even when a preferred brand exists", () => {
    const result = resolveMedicationPresentation({
      medication,
      displayMode: "generic_first",
      brands: [
        {
          id: "brand-a",
          genericMedicationId: "empagliflozin",
          brandName: "Example brand",
          manufacturerName: "Example manufacturer",
          market: "IR",
          availability: "active",
          reviewState: "published",
          sourceUrl: "https://example.invalid/catalog",
          sourceReference: "EX-001",
          observedAt: "2026-07-27T00:00:00.000Z",
          verifiedAt: "2026-07-27T00:00:00.000Z"
        }
      ],
      preferences: [{ organizationId: "org-1", genericMedicationId: "empagliflozin", brandMarketEntryId: "brand-a", priority: 1 }]
    });

    expect(result.primaryName).toBe("امپاگلیفلوزین");
    expect(result.selectedBrand?.id).toBe("brand-a");
  });
});

describe("type 2 consideration layer", () => {
  it("returns a review block instead of a treatment order when eGFR is below the metformin threshold", () => {
    const [result] = buildType2MedicationConsiderations([
      { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { currentHba1c: 8, targetHba1c: 7, workflow: "initiation", eGfr: 25, factors: [] });

    expect(result.outputStatus).toBe("information_only");
    expect(result.blockedBy?.[0]).toContain("eGFR کمتر از");
    expect(result.blockedBy?.[0]).toContain("KDIGO-CKD 2024");
  });

  it("flags TZD for physician review when heart failure is selected", () => {
    const [result] = buildType2MedicationConsiderations([
      { id: "pioglitazone", canonicalName: "Pioglitazone", persianName: "پیوگلیتازون", className: "Thiazolidinedione", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { currentHba1c: 8, targetHba1c: 7, workflow: "intensification", factors: ["heart_failure"] });

    expect(result.blockedBy?.[0]).toContain("پیشنهاد خودکار مسدود");
    expect(result.blockedBy?.[0]).toContain("ESC-DM-CVD 2023");
  });

  it("prioritizes insulin review above the ADA severe hyperglycemia threshold", () => {
    const result = buildType2PathwayRecommendation({
      currentHba1c: 10.1,
      targetHba1c: 7,
      workflow: "initiation",
      factors: []
    });

    expect(result.priority).toBe("consider_insulin");
    expect(result.urgentReview).toBe(true);
  });

  it("prioritizes GLP-1 based combination therapy when A1C is at least 1.5 above goal without severe hyperglycemia", () => {
    const result = buildType2PathwayRecommendation({
      currentHba1c: 8.6,
      targetHba1c: 7,
      workflow: "intensification",
      factors: ["weight_priority"]
    });

    expect(result.priority).toBe("glp1_based_therapy");
    expect(result.hba1cGap).toBe(1.6);
  });

  it("filters high-cost GLP-1 options when low-cost-only is selected", () => {
    const result = buildType2MedicationConsiderations([
      { id: "semaglutide", canonicalName: "Semaglutide", persianName: "سماگلوتاید", className: "GLP-1 receptor agonist", therapyGroup: "glp_1_receptor_agonist", administrationRoute: "subcutaneous" },
      { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { currentHba1c: 8.8, targetHba1c: 7, workflow: "initiation", costPreference: "low_cost_only", factors: ["weight_priority"] });

    expect(result.map((item) => item.genericMedicationId)).toEqual(["metformin"]);
    expect(result[0]?.relativeCost).toBe("low");
  });

  it("ranks SGLT2 first when HF/CKD is selected", () => {
    const result = buildType2MedicationConsiderations([
      { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
      { id: "empagliflozin", canonicalName: "Empagliflozin", persianName: "امپاگلیفلوزین", className: "SGLT2 inhibitor", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { currentHba1c: 8, targetHba1c: 7, workflow: "intensification", costPreference: "moderate", factors: ["heart_failure", "ckd"] });

    expect(result[0]?.genericMedicationId).toBe("empagliflozin");
    expect(result[0]?.priorityTier).toBe("recommended");
  });

  it("filters injectables for an oral-only patient preference", () => {
    const result = buildType2MedicationConsiderations([
      { id: "glargine", canonicalName: "Insulin glargine", persianName: "گلارژین", className: "Insulin", therapyGroup: "basal_insulin_analog", administrationRoute: "subcutaneous" },
      { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { currentHba1c: 10.2, targetHba1c: 7, workflow: "intensification", routePreference: "oral_only", factors: [] });
    expect(result.map((item) => item.genericMedicationId)).toEqual(["metformin"]);
  });

  it("keeps insured medicines and uses coverage in insured-only ranking", () => {
    const result = buildType2MedicationConsiderations([
      { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
      { id: "empagliflozin", canonicalName: "Empagliflozin", persianName: "امپاگلیفلوزین", className: "SGLT2 inhibitor", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { currentHba1c: 8, targetHba1c: 7, workflow: "intensification", costPreference: "insured_only", insuranceCoverageByMedicationId: { empagliflozin: [{ provider: "health_insurance", percent: 80 }] }, factors: [] });
    expect(result.map((item) => item.genericMedicationId)).toEqual(["empagliflozin"]);
    expect(result[0]?.insuranceCoverages[0]?.percent).toBe(80);
  });
});
