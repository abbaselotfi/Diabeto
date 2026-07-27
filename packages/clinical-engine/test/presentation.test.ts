import { describe, expect, it } from "vitest";
import { resolveMedicationPresentation, selectDiabetesPathway } from "../src/index.js";

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
