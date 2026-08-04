/**
 * Shared, non-clinical contracts. Medication presentation must never change a
 * clinical rule outcome; it is deliberately modelled separately from rules.
 */
export const diabetesTypes = ["type_1", "type_2", "pregnancy"] as const;
export type DiabetesType = (typeof diabetesTypes)[number];

export const medicationClinicalDomains = ["diabetes", "cardiovascular", "kidney", "liver", "obesity"] as const;
export type MedicationClinicalDomain = (typeof medicationClinicalDomains)[number];

export const medicationDisplayModes = ["generic_or_primary_brand", "generic_with_selected_brands"] as const;
export type MedicationDisplayMode = (typeof medicationDisplayModes)[number];

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
  clinicalReviewRequired: boolean;
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

/**
 * A presentation captured from a global reference catalogue. This is a source
 * snapshot for review, not a statement that the product is registered,
 * available, or displayable in Iran. Iranian brand-market entries are managed
 * separately and must pass the admin review workflow.
 */
export interface ReferenceMedicationPresentation {
  id: string;
  therapeuticClass: string;
  mechanismOrSubclass: string;
  genericName: string;
  administrationRoute: string;
  dosageForm: string;
  strengthPresentation: string;
  sampleLabelFrequency?: string;
  sampleBrands?: string;
  indicationScope?: string;
  marketStatus?: string;
  sourceUrl: string;
  coverageNotes?: string;
  sourceFile: string;
  sourceObservedAt: string;
  reviewState: "reference_only" | "needs_iran_validation" | "validated_for_iran" | "rejected";
}

export interface ReferenceCatalogSource {
  id: string;
  title: string;
  sourceUrl: string;
  purpose: string;
  accessedAt: string;
  sourceFile: string;
}

/** Admin-only display configuration. It never approves a medicine clinically. */
export interface MedicationChecklistItem {
  referencePresentationId: string;
  genericName: string;
  therapeuticClass: string;
  administrationRoute: string;
  dosageForm: string;
  strengthPresentation: string;
  sourceUrl: string;
  reviewState: ReferenceMedicationPresentation["reviewState"];
  showInApp: boolean;
  insuranceCoverages: InsuranceCoverage[];
  brands: MedicationBrand[];
  displayMode?: MedicationDisplayMode;
  clinicalDomains?: MedicationClinicalDomain[];
  genericRegistryCode?: string;
  price?: MedicationPrice;
  marketBadge?: MedicationMarketBadge;
  sourceObservedAt?: string;
}

export interface UpdateMedicationVisibilityInput {
  showInApp: boolean;
}

export const insuranceProviders = ["social_security", "health_insurance", "armed_forces", "other_organizations", "supplementary"] as const;
export type InsuranceProvider = (typeof insuranceProviders)[number];
export interface InsuranceCoverage {
  provider: InsuranceProvider;
  percent: number;
  origin?: "source" | "manual";
  manualOverrideNeedsReview?: boolean;
  genericCode?: string;
  brandCode?: string;
  insurerShareToman?: number;
  patientShareToman?: number;
  referencePriceToman?: number;
  sourceCurrency?: MedicationPriceSourceCurrency;
  sourceInsurerShare?: number;
  sourcePatientShare?: number;
  sourceReferencePrice?: number;
  effectiveAt?: string;
  sourceUrl?: string;
  sourceReference?: string;
}

export type MedicationPriceKind = "consumer_retail" | "insurance_reference" | "unknown";
export type MedicationPriceSourceCurrency = "IRR" | "TOMAN";
export interface MedicationPrice {
  amountToman: number;
  priceKind: MedicationPriceKind;
  sourceAmount?: number;
  sourceCurrency?: MedicationPriceSourceCurrency;
  effectiveAt?: string;
  sourceUrl?: string;
  sourceReference?: string;
  manualOverrideToman?: number;
  manualOverrideUpdatedAt?: string;
  manualOverrideNeedsReview?: boolean;
}

export interface MedicationMarketBadge {
  key: string;
  labelFa: string;
  labelEn?: string;
  tone: "blue" | "neutral";
  validUntil?: string;
  confirmedByAdmin: boolean;
}
export interface UpdateMedicationInsuranceInput {
  enabled: boolean;
  provider?: InsuranceProvider;
  percent?: number;
  origin?: "source" | "manual";
  genericCode?: string;
  brandCode?: string;
  insurerShareToman?: number;
  patientShareToman?: number;
  referencePriceToman?: number;
  effectiveAt?: string;
  sourceUrl?: string;
  sourceReference?: string;
}

export interface MedicationBrand {
  id: string;
  name: string;
  showInsteadOfGeneric: boolean;
  priority: number;
  customInsurance: boolean;
  insuranceCoverages: InsuranceCoverage[];
  genericRegistryCode?: string;
  brandRegistryCode?: string;
  price?: MedicationPrice;
  sourceDiscovered?: boolean;
  sourceUrl?: string;
  sourceObservedAt?: string;
  hiddenFromSource?: boolean;
  marketBadge?: MedicationMarketBadge;
}
export interface CreateMedicationBrandInput {
  name?: string;
}
export interface UpdateMedicationBrandInput {
  name?: string;
  showInsteadOfGeneric?: boolean;
  customInsurance?: boolean;
  insuranceCoverages?: InsuranceCoverage[];
  priority?: number;
  genericRegistryCode?: string;
  brandRegistryCode?: string;
  price?: MedicationPrice;
  hiddenFromSource?: boolean;
}

export interface MedicationMarketDataInput {
  displayMode?: MedicationDisplayMode;
  clinicalDomains?: MedicationClinicalDomain[];
  genericRegistryCode?: string;
  price?: MedicationPrice;
  marketBadge?: MedicationMarketBadge;
}

export interface MedicationMarketData extends MedicationMarketDataInput {
  sourceObservedAt?: string;
  sourceUrl?: string;
  updatedAt?: string;
}

export type AdminNotificationSeverity = "info" | "warning" | "error";
export type AdminNotificationStatus = "unread" | "read" | "resolved";
export interface AdminNotification {
  id: string;
  severity: AdminNotificationSeverity;
  status: AdminNotificationStatus;
  title: string;
  message: string;
  createdAt: string;
  actionHref?: string;
  actionLabel?: string;
  sourceRunId?: string;
  entityReferenceId?: string;
}
export type CreateAdminNotificationInput = Pick<AdminNotification, "severity" | "title" | "message"> &
  Partial<Pick<AdminNotification, "actionHref" | "actionLabel" | "sourceRunId" | "entityReferenceId">>;

export const drugDataSourceIds = ["iran_fda_nfi", "health_insurance", "armed_forces", "social_security"] as const;
export type DrugDataSourceId = (typeof drugDataSourceIds)[number];
export type DrugDataSourceRunStatus = "pending" | "running" | "succeeded" | "failed" | "needs_review";
export interface DrugDataSourceRun {
  sourceId: DrugDataSourceId;
  status: DrugDataSourceRunStatus;
  rowCount?: number;
  startedAt?: string;
  completedAt?: string;
  sourceUrl?: string;
  checksumSha256?: string;
  error?: string;
}

export interface DrugDataUpdateRun {
  id: string;
  schemaVersion: 1;
  status: "staging" | "needs_review" | "ready_to_publish" | "published" | "failed";
  startedAt: string;
  completedAt?: string;
  sources: DrugDataSourceRun[];
  previousPublishedRevision?: string;
  summary: {
    genericCount: number;
    brandCount: number;
    priceChangeCount: number;
    coverageChangeCount: number;
    ambiguousMatchCount: number;
    errorCount: number;
  };
}

export interface NormalizedDrugImportRecord {
  referencePresentationId?: string;
  genericName: string;
  genericRegistryCode?: string;
  brandName?: string;
  brandRegistryCode?: string;
  dosageForm?: string;
  strengthPresentation?: string;
  clinicalDomains?: MedicationClinicalDomain[];
  price?: MedicationPrice;
  insuranceCoverages: InsuranceCoverage[];
  sourceUrl: string;
  sourceReference: string;
  observedAt: string;
  matchConfidence?: number;
}

export interface NormalizedDrugImportBundle {
  schemaVersion: 1;
  run: DrugDataUpdateRun;
  records: NormalizedDrugImportRecord[];
}

export type Type2DecisionFactor = "ascvd" | "heart_failure" | "ckd" | "hypoglycemia_risk" | "weight_priority" | "insulin_pathway";
export type Type2Workflow = "initiation" | "intensification";
export type Type2CostPreference = "no_constraint" | "moderate" | "low_cost_only" | "insured_only";
export type Type2RoutePreference = "oral_only" | "oral_and_injectable";
export type MedicationRelativeCost = "low" | "medium" | "high";
export type MedicationPriorityTier = "recommended" | "preferred" | "consider";

export type Type2PathwayPriority =
  | "maintain_and_monitor"
  | "single_or_stepwise_therapy"
  | "combination_therapy"
  | "glp1_based_therapy"
  | "consider_insulin";

export interface Type2PathwayRecommendation {
  priority: Type2PathwayPriority;
  title: string;
  rationale: string[];
  hba1cGap: number;
  urgentReview: boolean;
  sourceUrl: string;
  sourceReference: string;
}

export interface Type2MedicationConsideration {
  genericMedicationId: string;
  genericName: string;
  persianName: string;
  therapeuticClass: string;
  therapyGroup: MedicationTherapyGroup;
  sourceUrl: string;
  sourceReference: string;
  considerations: string[];
  cautions: string[];
  blockedBy?: string[];
  priorityScore: number;
  priorityTier: MedicationPriorityTier;
  relativeCost: MedicationRelativeCost;
  rankingReasons: string[];
  risks: string[];
  insuranceCoverages: InsuranceCoverage[];
  cardId?: string;
  displayName?: string;
  selectedBrandName?: string;
  selectedBrandId?: string;
  selectedBrands?: MedicationBrand[];
  brandPriority?: number;
  genericRegistryCode?: string;
  brandRegistryCode?: string;
  price?: MedicationPrice;
  marketBadge?: MedicationMarketBadge;
  outputStatus: "information_only" | "requires_approved_protocol";
}

export interface Type2ConsiderationRequest {
  eGfr?: number;
  currentHba1c: number;
  targetHba1c: number;
  workflow: Type2Workflow;
  costPreference?: Type2CostPreference;
  routePreference?: Type2RoutePreference;
  insuranceCoverageByMedicationId?: Record<string, InsuranceCoverage[]>;
  hyperglycemiaSymptoms?: boolean;
  catabolicFeatures?: boolean;
  factors: Type2DecisionFactor[];
}

export interface Type2AssessmentResult {
  recommendation: Type2PathwayRecommendation;
  medications: Type2MedicationConsideration[];
}
