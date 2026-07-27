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
  therapyGroup?: MedicationTherapyGroup;
  administrationRoute?: MedicationAdministrationRoute;
  catalogStatus?: "seeded_from_guideline" | "admin_added" | "retired";
}

export const medicationTherapyGroups = [
  "oral_glucose_lowering",
  "glp_1_receptor_agonist",
  "dual_gip_glp_1_receptor_agonist",
  "human_insulin",
  "basal_insulin_analog",
  "prandial_insulin_analog",
  "premixed_insulin",
  "fixed_ratio_combination"
] as const;
export type MedicationTherapyGroup = (typeof medicationTherapyGroups)[number];

export const medicationAdministrationRoutes = ["oral", "subcutaneous"] as const;
export type MedicationAdministrationRoute = (typeof medicationAdministrationRoutes)[number];

export interface GenericMedicationInput {
  canonicalName: string;
  persianName: string;
  className: string;
  therapyGroup: MedicationTherapyGroup;
  administrationRoute: MedicationAdministrationRoute;
  sourceUrl: string;
  sourceReference: string;
}

export const protocolStatuses = ["draft", "in_review", "approved", "retired"] as const;
export type ProtocolStatus = (typeof protocolStatuses)[number];

export interface ClinicalProtocolBundle {
  id: string;
  title: string;
  diabetesType: DiabetesType;
  scope: "treatment_initiation" | "treatment_intensification" | "insulin_pathway";
  sourceUrl: string;
  sourceReference: string;
  publishedAt: string;
  status: ProtocolStatus;
  clinicalReviewRequired: true;
}

export interface GuidelineSource {
  id: string;
  publisher: "ADA" | "EASD";
  title: string;
  sourceUrl: string;
  activeVersion: string;
  publishedAt: string;
  monitored: boolean;
  lastCheckedAt?: string;
}

export interface GuidelineUpdateCheckResult {
  sourceId: string;
  status: "queued_for_review" | "no_change_detected" | "blocked";
  message: string;
  checkedAt: string;
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
