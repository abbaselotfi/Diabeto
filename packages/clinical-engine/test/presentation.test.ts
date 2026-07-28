import { describe, expect, it } from "vitest";
import { buildType2MedicationConsiderations, gateClinicalOutput, resolveMedicationPresentation, selectDiabetesPathway } from "../src/index.js";

const medication = {
  id: "empagliflozin",
  canonicalName: "Empagliflozin",
  persianName: "امپاگلیفلوزین"
};

describe("diabetes pathway selection", () => {
  it("does not turn a pathway choice into a clinical recommendation", () => {
    expect(selectDiabetesPathway("pregnancy")).toEqual({
      diabetesType: "pregnancy",
      contentStatus: "not_enabled",
      patientDataPolicy: "anonymous_only"
    });
  });
});

describe("clinical protocol gate", () => {
  it("blocks outputs while a protocol is awaiting clinical review", () => {
    expect(gateClinicalOutput({
      id: "draft", title: "draft", diabetesType: "type_2", scope: "treatment_initiation",
      sourceUrl: "https://example.test", sourceReference: "test", publishedAt: "2026-01-01",
      status: "draft", clinicalReviewRequired: true
    })).toEqual({ enabled: false, reason: "clinical_review_required" });
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
    ], { eGfr: 25, factors: [] });

    expect(result.outputStatus).toBe("requires_approved_protocol");
    expect(result.blockedBy?.[0]).toContain("eGFR کمتر از ۳۰");
  });

  it("flags TZD for physician review when heart failure is selected", () => {
    const [result] = buildType2MedicationConsiderations([
      { id: "pioglitazone", canonicalName: "Pioglitazone", persianName: "پیوگلیتازون", className: "Thiazolidinedione", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" }
    ], { factors: ["heart_failure"] });

    expect(result.blockedBy?.[0]).toContain("نارسایی قلبی");
  });
});
