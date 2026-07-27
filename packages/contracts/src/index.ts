/**
 * Shared, non-clinical contracts. Medication presentation must never change a
 * clinical rule outcome; it is deliberately modelled separately from rules.
 */
export const diabetesTypes = ["type_1", "type_2", "pregnancy"] as const;
export type DiabetesType = (typeof diabetesTypes)[number];

export const brandDisplayModes = ["generic_first", "brand_first"] as const;
export type BrandDisplayMode = (typeof brandDisplayModes)[number];

export const brandAvailability = ["active", "unavailable", "discontinued", "unknown"] as const;
export type BrandAvailability = (typeof brandAvailability)[number];

export const catalogReviewStates = ["candidate", "in_review", "published", "rejected", "retired"] as const;
export type CatalogReviewState = (typeof catalogReviewStates)[number];

export interface GenericMedication {
  id: string;
  canonicalName: string;
  persianName: string;
  atcCode?: string;
  className?: string;
}

export interface BrandMarketEntry {
  id: string;
  genericMedicationId: string;
  brandName: string;
  brandNameFa?: string;
  manufacturerName: string;
  market: "IR";
  availability: BrandAvailability;
  reviewState: CatalogReviewState;
  sourceUrl: string;
  sourceReference: string;
  observedAt: string;
  verifiedAt?: string;
}

export interface OrganizationDisplaySetting {
  organizationId: string;
  medicationDisplayMode: BrandDisplayMode;
  themeKey: string;
  updatedAt: string;
}

export interface OrganizationBrandPreference {
  organizationId: string;
  genericMedicationId: string;
  brandMarketEntryId: string;
  priority: number;
}

export interface CatalogImportRequest {
  sourceKind: "official_registry" | "approved_export" | "manual_csv";
  sourceUrl?: string;
  requestedBy: string;
}

export interface CatalogImportResult {
  importId: string;
  status: "queued" | "blocked";
  message: string;
}
