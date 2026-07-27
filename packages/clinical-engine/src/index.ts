import type {
  BrandDisplayMode,
  BrandMarketEntry,
  DiabetesType,
  GenericMedication,
  OrganizationBrandPreference
} from "@diabeto/contracts";

export interface PathwaySelection {
  diabetesType: DiabetesType;
  contentStatus: "not_enabled" | "requires_approved_bundle";
  patientDataPolicy: "anonymous_only";
}

/**
 * This is intentionally not a diagnosis or treatment engine. It only locks a
 * user session to an approved diabetes-specific content bundle in a later step.
 */
export function selectDiabetesPathway(diabetesType: DiabetesType): PathwaySelection {
  return {
    diabetesType,
    contentStatus: diabetesType === "type_2" ? "requires_approved_bundle" : "not_enabled",
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
