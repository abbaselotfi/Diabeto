import { buildType2Assessment, buildType2MedicationConsiderations } from "@glymize/clinical-engine";
import type {
  AdminNotification,
  CreateAdminNotificationInput,
  CatalogImportRequest,
  DrugDataUpdateRun,
  GenericMedication,
  GenericMedicationInput,
  GuidelineUpdateCheckResult,
  InsuranceCoverage,
  MedicationBrand,
  MedicationChecklistItem,
  MedicationMarketData,
  MedicationMarketDataInput,
  NormalizedDrugImportBundle,
  NormalizedDrugImportRecord,
  Type2AssessmentResult,
  Type2ConsiderationRequest
} from "@glymize/contracts";
import { ada2026Type2GenericSeed, type2ProtocolSeed } from "../../api/src/catalog/ada-2026-type2-seed";
import { globalReferenceCatalogue, globalReferenceCatalogueSources } from "../../api/src/catalog/global-reference-catalog";
import { guidelineSources } from "../../api/src/guidelines/guideline-sources";
import { getAdminSession, isAdminApiConfigured, publishAdminCatalog } from "./admin-auth";
import { withBasePath } from "./base-path";

const remoteApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const storageKey = "glymize-browser-catalog-v2";

export interface BrowserCatalogState {
  visibility: Record<string, boolean>;
  insurance: Record<string, InsuranceCoverage[]>;
  brands: Record<string, MedicationBrand[]>;
  customGenerics: GenericMedication[];
  marketData: Record<string, MedicationMarketData>;
  notifications: AdminNotification[];
  updateRuns: DrugDataUpdateRun[];
}

interface PublishedCatalogState extends BrowserCatalogState {
  schemaVersion: 1 | 2;
  revision: string;
  updatedAt: string;
  updatedBy: string;
}

let stateCache = emptyState();
let stateLoaded = false;
let statePromise: Promise<void> | null = null;
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let publishBatchDepth = 0;
let pendingPublishState: BrowserCatalogState | null = null;

function emptyState(): BrowserCatalogState {
  return {
    visibility: {},
    insurance: {},
    brands: {},
    customGenerics: [],
    marketData: {},
    notifications: [],
    updateRuns: []
  };
}

function parseStoredState(value: string | null): { state: BrowserCatalogState; savedAt?: string } | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as { state?: Partial<BrowserCatalogState>; savedAt?: string } & Partial<BrowserCatalogState>;
    const parsed = raw.state ?? raw;
    return { state: {
      ...emptyState(),
      ...parsed,
      marketData: parsed.marketData ?? {},
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      updateRuns: Array.isArray(parsed.updateRuns) ? parsed.updateRuns : []
    }, savedAt: raw.savedAt };
  } catch {
    return null;
  }
}

async function ensureState() {
  if (stateLoaded || typeof window === "undefined") return;
  if (statePromise) return statePromise;
  statePromise = (async () => {
    const localDraft = parseStoredState(window.localStorage.getItem(storageKey));
    try {
      const response = await fetch(`${withBasePath("/data/admin-catalog.json")}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("published_catalog_unavailable");
      const published = await response.json() as PublishedCatalogState;
      const publishedState: BrowserCatalogState = {
        visibility: published.visibility ?? {},
        insurance: published.insurance ?? {},
        brands: published.brands ?? {},
        customGenerics: published.customGenerics ?? [],
        marketData: published.marketData ?? {},
        notifications: published.notifications ?? [],
        updateRuns: published.updateRuns ?? []
      };
      const localIsNewer = Boolean(localDraft?.savedAt && Date.parse(localDraft.savedAt) > Date.parse(published.updatedAt));
      stateCache = localIsNewer ? localDraft!.state : publishedState;
    } catch {
      stateCache = localDraft?.state ?? emptyState();
    }
    stateLoaded = true;
  })();
  return statePromise;
}

function readState(): BrowserCatalogState {
  return stateCache;
}

function notifyPublish(status: "pending" | "publishing" | "success" | "error", message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("glymize-publish-status", { detail: { status, message } }));
}

function schedulePublish(state: BrowserCatalogState) {
  if (!isAdminApiConfigured() || !getAdminSession()) return;
  pendingPublishState = structuredClone(state);
  notifyPublish("pending", "تغییر ذخیره شد؛ در انتظار انتشار مرکزی…");
  if (publishBatchDepth > 0) return;
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    publishTimer = null;
    const catalog = pendingPublishState;
    pendingPublishState = null;
    if (!catalog) return;
    notifyPublish("publishing", "در حال ثبت در GitHub و انتشار نسخهٔ جدید…");
    void publishAdminCatalog(catalog)
      .then((result) => notifyPublish("success", `انتشار ثبت شد؛ نسخهٔ ${result.commitSha.slice(0, 7)} در حال آماده‌سازی است.`))
      .catch(() => notifyPublish("error", "انتشار مرکزی ناموفق بود؛ دوباره وارد مدیریت شوید و تغییر را تکرار کنید."));
  }, 700);
}

function saveState(state: BrowserCatalogState, publish = true) {
  stateCache = state;
  window.localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), state }));
  window.dispatchEvent(new CustomEvent("glymize-catalog-change"));
  if (publish) schedulePublish(state);
}

export function beginCatalogPublishBatch() {
  if (publishBatchDepth === 0 && publishTimer) {
    clearTimeout(publishTimer);
    publishTimer = null;
  }
  publishBatchDepth += 1;
}

export function endCatalogPublishBatch() {
  publishBatchDepth = Math.max(0, publishBatchDepth - 1);
  if (publishBatchDepth === 0 && pendingPublishState) schedulePublish(pendingPublishState);
}

function listGenerics() {
  const state = readState();
  return [...ada2026Type2GenericSeed, ...state.customGenerics];
}

function listMedicationChecklist(): MedicationChecklistItem[] {
  const state = readState();
  return globalReferenceCatalogue.map((presentation) => {
    const market = state.marketData[presentation.id] ?? {};
    return {
      referencePresentationId: presentation.id,
      genericName: presentation.genericName,
      therapeuticClass: presentation.therapeuticClass,
      administrationRoute: presentation.administrationRoute,
      dosageForm: presentation.dosageForm,
      strengthPresentation: presentation.strengthPresentation,
      sourceUrl: market.sourceUrl ?? presentation.sourceUrl,
      reviewState: presentation.reviewState,
      showInApp: state.visibility[presentation.id] ?? true,
      insuranceCoverages: state.insurance[presentation.id] ?? [],
      brands: state.brands[presentation.id] ?? [],
      displayMode: market.displayMode ?? "generic_or_primary_brand",
      clinicalDomains: market.clinicalDomains ?? ["diabetes"],
      genericRegistryCode: market.genericRegistryCode,
      price: market.price,
      marketBadge: market.marketBadge,
      sourceObservedAt: market.sourceObservedAt
    } satisfies MedicationChecklistItem;
  });
}

function checklistItem(referencePresentationId: string) {
  return listMedicationChecklist().find((item) => item.referencePresentationId === referencePresentationId);
}

function normalizedTerms(value: string): string[] {
  return value.toLocaleLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter((term) => term.length >= 5);
}

function matchingReferences(medication: GenericMedication) {
  const medicationTerms = normalizedTerms(medication.canonicalName);
  return listMedicationChecklist().filter((presentation) => {
    const referenceTerms = normalizedTerms(presentation.genericName);
    return medicationTerms.some((term) => referenceTerms.includes(term));
  });
}

function mergeInsuranceCoverages(coverages: InsuranceCoverage[]): InsuranceCoverage[] {
  return Object.values(coverages.reduce<Partial<Record<InsuranceCoverage["provider"], InsuranceCoverage>>>((result, coverage) => {
    if (!result[coverage.provider] || result[coverage.provider]!.percent < coverage.percent) result[coverage.provider] = coverage;
    return result;
  }, {}));
}

function coverageSourceChanged(manual: InsuranceCoverage, source?: InsuranceCoverage) {
  if (!source) return false;
  return manual.percent !== source.percent ||
    manual.genericCode !== source.genericCode ||
    manual.brandCode !== source.brandCode ||
    manual.insurerShareToman !== source.insurerShareToman ||
    manual.patientShareToman !== source.patientShareToman ||
    manual.referencePriceToman !== source.referencePriceToman;
}

function resolveMedicationDisplays(medication: GenericMedication) {
  const references = matchingReferences(medication);
  const genericCoverage = references.flatMap((item) => item.insuranceCoverages);
  const brands = references.flatMap((reference, referenceIndex) =>
    reference.brands.map((brand) => ({
      brand,
      referenceIndex,
      inheritedCoverage: reference.insuranceCoverages
    }))
  )
    .filter(({ brand }) => brand.showInsteadOfGeneric && !brand.hiddenFromSource && brand.name.trim())
    .sort((left, right) => left.referenceIndex - right.referenceIndex || left.brand.priority - right.brand.priority);
  const primaryReference = references[0];
  const displayMode = primaryReference?.displayMode ?? "generic_or_primary_brand";
  if (!brands.length || displayMode === "generic_with_selected_brands") {
    return [{
      cardId: `${medication.id}:generic`,
      displayName: medication.persianName,
      selectedBrandName: undefined,
      selectedBrandId: undefined,
      selectedBrands: displayMode === "generic_with_selected_brands" ? brands.map(({ brand, inheritedCoverage }) => ({ ...brand, insuranceCoverages: brand.customInsurance ? brand.insuranceCoverages : inheritedCoverage })) : undefined,
      brandPriority: 0,
      insuranceCoverages: mergeInsuranceCoverages(genericCoverage),
      genericRegistryCode: primaryReference?.genericRegistryCode,
      price: primaryReference?.price,
      marketBadge: primaryReference?.marketBadge
    }];
  }
  return brands.slice(0, 1).map(({ brand, inheritedCoverage }, index) => ({
    cardId: `${medication.id}:${brand.id}`,
    displayName: brand.name.trim(),
    selectedBrandName: brand.name.trim(),
    selectedBrandId: brand.id,
    brandPriority: index + 1,
    insuranceCoverages: mergeInsuranceCoverages(brand.customInsurance ? brand.insuranceCoverages : inheritedCoverage),
    genericRegistryCode: brand.genericRegistryCode ?? primaryReference?.genericRegistryCode,
    brandRegistryCode: brand.brandRegistryCode,
    price: brand.price ?? primaryReference?.price,
    marketBadge: brand.marketBadge ?? primaryReference?.marketBadge
  }));
}

function type2Assessment(request: Type2ConsiderationRequest): Type2AssessmentResult {
  const visible = listGenerics().filter((medication) => matchingReferences(medication).some((item) => item.showInApp));
  const presentations = Object.fromEntries(visible.map((medication) => [medication.id, resolveMedicationDisplays(medication)]));
  const insuranceCoverageByMedicationId = Object.fromEntries(visible.map((medication) => [
    medication.id,
    mergeInsuranceCoverages(presentations[medication.id]!.flatMap((presentation) => presentation.insuranceCoverages))
  ]));
  const assessment = buildType2Assessment(visible, { ...request, insuranceCoverageByMedicationId });
  return {
    ...assessment,
    medications: assessment.medications.flatMap((medication) =>
      (presentations[medication.genericMedicationId] ?? [{
        cardId: `${medication.genericMedicationId}:generic`,
        displayName: medication.persianName,
        insuranceCoverages: [],
        brandPriority: 0
      }])
        .filter((presentation) => request.costPreference !== "insured_only" || presentation.insuranceCoverages.length > 0)
        .map((presentation) => ({ ...medication, ...presentation }))
    )
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function requestBody(init?: RequestInit) {
  if (!init?.body) return {};
  try {
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function updateVisibility(referencePresentationId: string, showInApp: boolean) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  state.visibility = { ...state.visibility, [referencePresentationId]: showInApp };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function updateInsurance(referencePresentationId: string, body: Record<string, unknown>) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  if (!body.enabled) {
    const next = { ...state.insurance };
    delete next[referencePresentationId];
    state.insurance = next;
  } else {
    const provider = body.provider as InsuranceCoverage["provider"];
    const percent = Number(body.percent);
    if (!provider || !Number.isFinite(percent) || percent < 0 || percent > 100) return undefined;
    const optionalAmount = (key: string) => body[key] === undefined || body[key] === "" ? undefined : Number(body[key]);
    const insurerShareToman = optionalAmount("insurerShareToman");
    const patientShareToman = optionalAmount("patientShareToman");
    const referencePriceToman = optionalAmount("referencePriceToman");
    if ([insurerShareToman, patientShareToman, referencePriceToman].some((amount) => amount !== undefined && (!Number.isFinite(amount) || amount < 0))) return undefined;
    const current = state.insurance[referencePresentationId] ?? [];
    state.insurance = {
      ...state.insurance,
      [referencePresentationId]: [...current.filter((item) => item.provider !== provider), {
        provider,
        percent,
        origin: "manual",
        genericCode: String(body.genericCode ?? "").trim() || undefined,
        insurerShareToman,
        patientShareToman,
        referencePriceToman
      }]
    };
  }
  saveState(state);
  return checklistItem(referencePresentationId);
}

function updateMarketData(referencePresentationId: string, body: MedicationMarketDataInput) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  state.marketData = {
    ...state.marketData,
    [referencePresentationId]: {
      ...(state.marketData[referencePresentationId] ?? {}),
      ...body,
      updatedAt: new Date().toISOString()
    }
  };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function addNotification(notification: Omit<AdminNotification, "id" | "createdAt" | "status">) {
  const state = readState();
  const duplicate = state.notifications.find((item) =>
    item.status !== "resolved" && item.title === notification.title && item.entityReferenceId === notification.entityReferenceId
  );
  if (duplicate) return duplicate;
  const created: AdminNotification = {
    ...notification,
    id: crypto.randomUUID(),
    status: "unread",
    createdAt: new Date().toISOString()
  };
  state.notifications = [created, ...state.notifications].slice(0, 200);
  return created;
}

function updateNotification(notificationId: string, status: AdminNotification["status"]) {
  const state = readState();
  if (!state.notifications.some((item) => item.id === notificationId)) return undefined;
  state.notifications = state.notifications.map((item) => item.id === notificationId ? { ...item, status } : item);
  saveState(state, false);
  return state.notifications.find((item) => item.id === notificationId);
}

function createNotification(body: CreateAdminNotificationInput) {
  if (!["info", "warning", "error"].includes(body.severity) || !String(body.title ?? "").trim() || !String(body.message ?? "").trim()) return undefined;
  const created = addNotification({
    ...body,
    title: String(body.title).trim(),
    message: String(body.message).trim()
  });
  saveState(readState(), false);
  return created;
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/[^a-z0-9آ-ی]+/gi, " ")
    .replace(/\s+/g, " ");
}

function validateNormalizedBundle(bundle: NormalizedDrugImportBundle | null | undefined) {
  const errors: string[] = [];
  if (!bundle || typeof bundle !== "object" || bundle.schemaVersion !== 1 || bundle.run?.schemaVersion !== 1 || !Array.isArray(bundle.run?.sources) || !bundle.run?.summary || !Array.isArray(bundle.records)) {
    errors.push("نسخه یا ساختار بستهٔ استخراج معتبر نیست.");
    return errors;
  }
  const mandatorySources = ["iran_fda_nfi", "health_insurance", "armed_forces", "social_security"];
  for (const sourceId of mandatorySources) {
    const source = bundle.run.sources.find((item) => item.sourceId === sourceId);
    if (!source || source.status !== "succeeded") errors.push(`منبع ${sourceId} کامل دریافت نشده است.`);
  }
  const providers = ["social_security", "health_insurance", "armed_forces", "other_organizations", "supplementary"];
  const validToman = (amount: unknown) => amount === undefined || (typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0);
  if (bundle.records.some((record) => {
    if (!record || typeof record !== "object" || !record.genericName || !record.sourceUrl || !record.observedAt || !Array.isArray(record.insuranceCoverages)) return true;
    if (record.price && (!validToman(record.price.amountToman) || !["consumer_retail", "insurance_reference", "unknown"].includes(record.price.priceKind))) return true;
    return record.insuranceCoverages.some((coverage) =>
      !coverage || !providers.includes(coverage.provider) || !Number.isFinite(coverage.percent) || coverage.percent < 0 || coverage.percent > 100 ||
      !validToman(coverage.insurerShareToman) || !validToman(coverage.patientShareToman) || !validToman(coverage.referencePriceToman)
    );
  })) {
    errors.push("حداقل یک رکورد، نام/منبع/قیمت یا اطلاعات بیمهٔ معتبر ندارد.");
  }
  return errors;
}

function genericImportCandidates(record: NormalizedDrugImportRecord, checklist: MedicationChecklistItem[]) {
  if (record.referencePresentationId) return checklist.filter((item) => item.referencePresentationId === record.referencePresentationId);
  return checklist.filter((item) =>
    item.genericName.split("/").some((part) => normalizedName(part) === normalizedName(record.genericName)) ||
    normalizedName(item.genericName) === normalizedName(record.genericName)
  );
}

function matchingImportCandidates(record: NormalizedDrugImportRecord, checklist: MedicationChecklistItem[]) {
  let candidates = genericImportCandidates(record, checklist);
  if (candidates.length > 1 && record.dosageForm) {
    const form = normalizedName(record.dosageForm);
    const narrowed = candidates.filter((item) => {
      const candidate = normalizedName(item.dosageForm);
      return candidate === form || candidate.includes(form) || form.includes(candidate);
    });
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length > 1 && record.strengthPresentation) {
    const strength = normalizedName(record.strengthPresentation);
    const narrowed = candidates.filter((item) => {
      const candidate = normalizedName(item.strengthPresentation);
      return candidate === strength || candidate.includes(strength) || strength.includes(candidate);
    });
    if (narrowed.length) candidates = narrowed;
  }
  return candidates;
}

function applyNormalizedBundle(bundle: NormalizedDrugImportBundle) {
  const state = readState();
  const errors = validateNormalizedBundle(bundle);
  if (!bundle?.run || !Array.isArray(bundle.run.sources) || !bundle.run.summary) {
    addNotification({
      severity: "error",
      title: "فایل به‌روزرسانی معتبر نیست",
      message: errors[0] ?? "ساختار بستهٔ استخراج ناقص است.",
      actionHref: "/admin/data-updates",
      actionLabel: "بررسی فایل"
    });
    saveState(state, false);
    return { applied: false, errors, matched: 0, ambiguous: 0 };
  }
  state.updateRuns = [bundle.run, ...state.updateRuns.filter((run) => run.id !== bundle.run.id)].slice(0, 24);
  if (errors.length) {
    for (const message of errors) addNotification({
      severity: "error",
      title: "به‌روزرسانی دارویی منتشر نشد",
      message,
      actionHref: "/admin/data-updates",
      actionLabel: "بررسی اجرای ناموفق",
      sourceRunId: bundle.run.id
    });
    const failedRun: DrugDataUpdateRun = { ...bundle.run, status: "failed", summary: { ...bundle.run.summary, errorCount: Math.max(bundle.run.summary.errorCount, errors.length) } };
    state.updateRuns = [
      failedRun,
      ...state.updateRuns.filter((run) => run.id !== bundle.run.id)
    ].slice(0, 24);
    saveState(state, false);
    return { applied: false, errors, matched: 0, ambiguous: 0 };
  }

  const checklist = listMedicationChecklist();
  const ambiguousRecords = bundle.records.filter((record) => {
    const candidates = matchingImportCandidates(record, checklist);
    return candidates.length !== 1 || (!record.referencePresentationId && record.matchConfidence !== undefined && record.matchConfidence < 0.9);
  });
  if (ambiguousRecords.length) {
    for (const record of ambiguousRecords.slice(0, 50)) addNotification({
      severity: "warning",
      title: "تطبیق دارویی نیازمند بازبینی است",
      message: `رکورد «${record.genericName}${record.brandName ? ` / ${record.brandName}` : ""}» به‌صورت یکتا تطبیق داده نشد.`,
      actionHref: "/admin/data-updates#ambiguous-matches",
      actionLabel: "بازبینی تطبیق",
      sourceRunId: bundle.run.id
    });
    const needsReviewRun: DrugDataUpdateRun = {
      ...bundle.run,
      status: "needs_review",
      summary: { ...bundle.run.summary, ambiguousMatchCount: ambiguousRecords.length }
    };
    state.updateRuns = [needsReviewRun, ...state.updateRuns.filter((run) => run.id !== bundle.run.id)].slice(0, 24);
    saveState(state, false);
    return {
      applied: false,
      errors: [`${ambiguousRecords.length} رکورد مبهم است؛ نسخهٔ سالم قبلی فعال ماند.`],
      matched: 0,
      ambiguous: ambiguousRecords.length
    };
  }
  let matched = 0;
  let ambiguous = 0;
  for (const record of bundle.records) {
    const candidates = matchingImportCandidates(record, checklist);
    if (candidates.length !== 1) continue;
    const item = candidates[0]!;
    const existingMarket = state.marketData[item.referencePresentationId] ?? {};
    if (!record.brandName) {
      const incomingPrice = record.price;
      const existingPrice = existingMarket.price;
      const sourcePriceChanged = Boolean(incomingPrice && existingPrice && incomingPrice.amountToman !== existingPrice.amountToman);
      const price = incomingPrice ? {
        ...incomingPrice,
        manualOverrideToman: existingPrice?.manualOverrideToman,
        manualOverrideUpdatedAt: existingPrice?.manualOverrideUpdatedAt,
        manualOverrideNeedsReview: sourcePriceChanged && existingPrice?.manualOverrideToman !== undefined
      } : existingPrice;
      if (price?.manualOverrideNeedsReview) addNotification({
        severity: "warning",
        title: "اصلاح دستی قیمت نیازمند بازبینی است",
        message: `قیمت منبع برای «${item.genericName}» تغییر کرده، اما قیمت دستی قبلی حفظ شده است.`,
        actionHref: `/admin/medications#${item.referencePresentationId}`,
        actionLabel: "بررسی قیمت",
        sourceRunId: bundle.run.id,
        entityReferenceId: item.referencePresentationId
      });
      state.marketData[item.referencePresentationId] = {
        ...existingMarket,
        genericRegistryCode: record.genericRegistryCode ?? existingMarket.genericRegistryCode,
        clinicalDomains: record.clinicalDomains ?? existingMarket.clinicalDomains ?? ["diabetes"],
        price,
        sourceUrl: record.sourceUrl,
        sourceObservedAt: record.observedAt,
        updatedAt: new Date().toISOString()
      };
      const previousCoverages = state.insurance[item.referencePresentationId] ?? [];
      const manualCoverages = previousCoverages.filter((coverage) => coverage.origin === "manual");
      const incomingSourceCoverages = record.insuranceCoverages.map((coverage) => ({ ...coverage, origin: "source" as const }));
      const sourceCoverages = [
        ...previousCoverages.filter((coverage) => coverage.origin !== "manual" && !incomingSourceCoverages.some((incoming) => incoming.provider === coverage.provider)),
        ...incomingSourceCoverages
      ];
      state.insurance[item.referencePresentationId] = [
        ...sourceCoverages.filter((sourceCoverage) => !manualCoverages.some((manual) => manual.provider === sourceCoverage.provider)),
        ...manualCoverages.map((manual) => {
          const source = sourceCoverages.find((entry) => entry.provider === manual.provider);
          const manualOverrideNeedsReview = coverageSourceChanged(manual, source);
          if (manualOverrideNeedsReview) addNotification({
            severity: "warning",
            title: "اصلاح دستی بیمه نیازمند بازبینی است",
            message: `اطلاعات منبع برای «${item.genericName}» تغییر کرده، اما مقادیر دستی بیمه حفظ شده است.`,
            actionHref: `/admin/medications#${item.referencePresentationId}`,
            actionLabel: "بررسی پوشش بیمه",
            sourceRunId: bundle.run.id,
            entityReferenceId: item.referencePresentationId
          });
          return { ...manual, manualOverrideNeedsReview };
        })
      ];
    } else {
      const currentBrands = state.brands[item.referencePresentationId] ?? [];
      const existingBrand = currentBrands.find((brand) => normalizedName(brand.name) === normalizedName(record.brandName!));
      const incomingBrandCoverages = record.insuranceCoverages.map((coverage) => ({ ...coverage, origin: "source" as const }));
      const mergedBrandSourceCoverages = [
        ...(existingBrand?.insuranceCoverages ?? []).filter((coverage) => coverage.origin !== "source" || !incomingBrandCoverages.some((incoming) => incoming.provider === coverage.provider)),
        ...incomingBrandCoverages
      ];
      const reviewedCustomCoverages = (existingBrand?.insuranceCoverages ?? []).map((manual) => {
        const source = incomingBrandCoverages.find((coverage) => coverage.provider === manual.provider);
        const manualOverrideNeedsReview = coverageSourceChanged(manual, source);
        if (manualOverrideNeedsReview) addNotification({
          severity: "warning",
          title: "اصلاح دستی بیمه برند نیازمند بازبینی است",
          message: `اطلاعات منبع برای برند «${record.brandName}» تغییر کرده، اما مقادیر دستی بیمه حفظ شده است.`,
          actionHref: `/admin/medications#${item.referencePresentationId}`,
          actionLabel: "بررسی بیمه برند",
          sourceRunId: bundle.run.id,
          entityReferenceId: item.referencePresentationId
        });
        return { ...manual, manualOverrideNeedsReview };
      });
      const brandPrice = existingBrand?.price?.manualOverrideToman !== undefined && record.price
        ? { ...record.price, manualOverrideToman: existingBrand.price.manualOverrideToman, manualOverrideUpdatedAt: existingBrand.price.manualOverrideUpdatedAt, manualOverrideNeedsReview: record.price.amountToman !== existingBrand.price.amountToman }
        : record.price ?? existingBrand?.price;
      if (brandPrice?.manualOverrideNeedsReview) addNotification({
        severity: "warning",
        title: "اصلاح دستی قیمت برند نیازمند بازبینی است",
        message: `قیمت منبع برای برند «${record.brandName}» تغییر کرده، اما قیمت دستی حفظ شده است.`,
        actionHref: `/admin/medications#${item.referencePresentationId}`,
        actionLabel: "بررسی قیمت برند",
        sourceRunId: bundle.run.id,
        entityReferenceId: item.referencePresentationId
      });
      const brand: MedicationBrand = {
        id: existingBrand?.id ?? crypto.randomUUID(),
        name: record.brandName,
        showInsteadOfGeneric: existingBrand?.showInsteadOfGeneric ?? false,
        priority: existingBrand?.priority ?? currentBrands.length + 1,
        customInsurance: existingBrand?.customInsurance ?? false,
        insuranceCoverages: existingBrand?.customInsurance
          ? reviewedCustomCoverages
          : mergedBrandSourceCoverages,
        genericRegistryCode: record.genericRegistryCode ?? existingBrand?.genericRegistryCode,
        brandRegistryCode: record.brandRegistryCode ?? existingBrand?.brandRegistryCode,
        price: brandPrice,
        sourceDiscovered: true,
        sourceUrl: record.sourceUrl,
        sourceObservedAt: record.observedAt,
        hiddenFromSource: existingBrand?.hiddenFromSource ?? false,
        marketBadge: existingBrand?.marketBadge
      };
      state.brands[item.referencePresentationId] = existingBrand
        ? currentBrands.map((entry) => entry.id === existingBrand.id ? brand : entry)
        : [...currentBrands, brand];
    }
    matched += 1;
  }
  const completedRun: DrugDataUpdateRun = {
    ...bundle.run,
    status: "ready_to_publish",
    summary: { ...bundle.run.summary, ambiguousMatchCount: ambiguous }
  };
  state.updateRuns = [completedRun, ...state.updateRuns.filter((run) => run.id !== bundle.run.id)].slice(0, 24);
  saveState(state);
  return { applied: true, errors: [], matched, ambiguous };
}

function addBrand(referencePresentationId: string, body: Record<string, unknown>) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  const name = String(body.name ?? "").trim();
  const brand: MedicationBrand = {
    id: crypto.randomUUID(),
    name,
    showInsteadOfGeneric: false,
    priority: current.length + 1,
    customInsurance: false,
    insuranceCoverages: []
  };
  state.brands = { ...state.brands, [referencePresentationId]: [...current, brand] };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function updateBrand(referencePresentationId: string, brandId: string, body: Record<string, unknown>) {
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  if (!current.some((brand) => brand.id === brandId)) return undefined;
  state.brands = {
    ...state.brands,
    [referencePresentationId]: current.map((brand) => brand.id === brandId ? { ...brand, ...body } as MedicationBrand : brand)
  };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function removeBrand(referencePresentationId: string, brandId: string) {
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  if (!current.some((brand) => brand.id === brandId)) return undefined;
  const remaining = current.filter((brand) => brand.id !== brandId).map((brand, index) => ({ ...brand, priority: index + 1 }));
  const next = { ...state.brands };
  if (remaining.length) next[referencePresentationId] = remaining;
  else delete next[referencePresentationId];
  state.brands = next;
  saveState(state);
  return checklistItem(referencePresentationId);
}

function addGeneric(body: GenericMedicationInput) {
  const state = readState();
  const canonicalName = String(body.canonicalName ?? "").trim();
  const existing = listGenerics().find((medication) => medication.canonicalName.toLocaleLowerCase() === canonicalName.toLocaleLowerCase());
  if (existing) return existing;
  if (!canonicalName || !body.persianName || !body.className || !body.therapyGroup || !body.administrationRoute) return undefined;
  const id = canonicalName.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const medication: GenericMedication = { ...body, id, canonicalName, catalogStatus: "admin_added" };
  state.customGenerics = [...state.customGenerics, medication];
  saveState(state);
  return medication;
}

async function browserApiFetch(path: string, init?: RequestInit): Promise<Response> {
  await ensureState();
  const method = (init?.method ?? "GET").toUpperCase();
  const pathname = path.split("?")[0]!;
  const body = requestBody(init);

  if (method === "GET" && pathname === "/v1/catalog/generics") return json(listGenerics());
  if (method === "GET" && pathname === "/v1/protocols/type-2") return json(type2ProtocolSeed);
  if (method === "GET" && pathname === "/v1/admin/guidelines") return json(guidelineSources);
  if (method === "GET" && pathname === "/v1/admin/catalog/medication-checklist") return json(listMedicationChecklist());
  if (method === "GET" && pathname === "/v1/admin/catalog/reference-sources") return json(globalReferenceCatalogueSources);
  if (method === "GET" && pathname === "/v1/admin/notifications") return json(readState().notifications);
  if (method === "POST" && pathname === "/v1/admin/notifications") {
    const created = createNotification(body as unknown as CreateAdminNotificationInput);
    return created ? json(created, 201) : json({ message: "اطلاعات اعلان معتبر نیست." }, 400);
  }
  if (method === "GET" && pathname === "/v1/admin/catalog/update-runs") return json(readState().updateRuns);
  if (method === "POST" && pathname === "/v1/admin/catalog/normalized-imports/preview") {
    const bundle = body as unknown as NormalizedDrugImportBundle | null;
    const errors = validateNormalizedBundle(bundle);
    const checklist = listMedicationChecklist();
    const records = Array.isArray(bundle?.records) ? bundle.records : [];
    const ambiguous = errors.length ? 0 : records.filter((record) => {
      const matches = matchingImportCandidates(record, checklist);
      return matches.length !== 1 || (!record.referencePresentationId && record.matchConfidence !== undefined && record.matchConfidence < 0.9);
    }).length;
    const ambiguousRecords = errors.length ? [] : records.flatMap((record, recordIndex) => {
      const matches = matchingImportCandidates(record, checklist);
      const isAmbiguous = matches.length !== 1 || (!record.referencePresentationId && record.matchConfidence !== undefined && record.matchConfidence < 0.9);
      if (!isAmbiguous) return [];
      const suggestions = genericImportCandidates({ ...record, referencePresentationId: undefined }, checklist);
      return [{
        recordIndex,
        genericName: record.genericName,
        brandName: record.brandName,
        candidates: suggestions.map((item) => ({
          referencePresentationId: item.referencePresentationId,
          label: `${item.genericName} · ${item.dosageForm} · ${item.strengthPresentation}`
        }))
      }];
    });
    return json({
      valid: errors.length === 0,
      errors,
      recordCount: records.length,
      ambiguous,
      ambiguousRecords,
      canApply: errors.length === 0 && ambiguous === 0
    }, errors.length ? 422 : 200);
  }
  if (method === "POST" && pathname === "/v1/admin/catalog/normalized-imports/apply") {
    const result = applyNormalizedBundle(body as unknown as NormalizedDrugImportBundle);
    return json(result, result.applied ? 200 : 422);
  }
  if (method === "GET" && pathname === "/v1/admin/preview/type-2-considerations") {
    return json(buildType2MedicationConsiderations(listGenerics(), {
      currentHba1c: 8,
      targetHba1c: 7,
      workflow: "initiation",
      factors: []
    }));
  }
  if (method === "POST" && pathname === "/v1/catalog/type-2/considerations") {
    return json(type2Assessment(body as unknown as Type2ConsiderationRequest));
  }
  if (method === "POST" && pathname === "/v1/admin/catalog/imports") {
    const request = body as unknown as CatalogImportRequest;
    return json({
      importId: crypto.randomUUID(),
      status: request.sourceKind !== "manual_csv" && !request.sourceUrl ? "blocked" : "queued",
      message: request.sourceKind !== "manual_csv" && !request.sourceUrl
        ? "برای Import باید URL یا فایل استاندارد ثبت شود."
        : "درخواست در همین مرورگر ثبت شد؛ برای ورود فایل Excel از صفحهٔ انتخاب داروها استفاده کنید."
    });
  }
  if (method === "POST" && pathname === "/v1/admin/catalog/generics") {
    const created = addGeneric(body as unknown as GenericMedicationInput);
    return created ? json(created) : json({ message: "فیلدهای الزامی ناقص است." }, 400);
  }
  const guidelineMatch = pathname.match(/^\/v1\/admin\/guidelines\/([^/]+)\/check$/);
  if (method === "POST" && guidelineMatch) {
    const sourceId = decodeURIComponent(guidelineMatch[1]!);
    const source = guidelineSources.find((item) => item.id === sourceId);
    const result: GuidelineUpdateCheckResult = source ? {
      sourceId,
      status: "queued_for_review",
      checkedAt: new Date().toISOString(),
      message: "بررسی نسخهٔ جدید ثبت شد؛ هیچ قاعده یا توصیه‌ای خودکار تغییر نکرده است."
    } : {
      sourceId,
      status: "blocked",
      checkedAt: new Date().toISOString(),
      message: "منبع guideline شناخته نشد."
    };
    return json(result, source ? 200 : 404);
  }

  const brandMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/brands\/([^/]+)$/);
  if (brandMatch) {
    const referencePresentationId = decodeURIComponent(brandMatch[1]!);
    const brandId = decodeURIComponent(brandMatch[2]!);
    const updated = method === "DELETE"
      ? removeBrand(referencePresentationId, brandId)
      : method === "PATCH"
        ? updateBrand(referencePresentationId, brandId, body)
        : undefined;
    return updated ? json(updated) : json({ message: "برند پیدا نشد." }, 404);
  }
  const marketDataMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/market-data$/);
  if (method === "PATCH" && marketDataMatch) {
    const referencePresentationId = decodeURIComponent(marketDataMatch[1]!);
    const updated = updateMarketData(referencePresentationId, body as MedicationMarketDataInput);
    return updated ? json(updated) : json({ message: "دارو پیدا نشد." }, 404);
  }
  const notificationMatch = pathname.match(/^\/v1\/admin\/notifications\/([^/]+)$/);
  if (method === "PATCH" && notificationMatch) {
    const notificationId = decodeURIComponent(notificationMatch[1]!);
    const status = body.status as AdminNotification["status"];
    if (!["unread", "read", "resolved"].includes(status)) return json({ message: "وضعیت اعلان معتبر نیست." }, 400);
    const updated = updateNotification(notificationId, status);
    return updated ? json(updated) : json({ message: "اعلان پیدا نشد." }, 404);
  }
  const addBrandMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/brands$/);
  if (method === "POST" && addBrandMatch) {
    const referencePresentationId = decodeURIComponent(addBrandMatch[1]!);
    const updated = addBrand(referencePresentationId, body);
    return updated ? json(updated) : json({ message: "دارو پیدا نشد." }, 404);
  }
  const insuranceMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/insurance$/);
  if (method === "PATCH" && insuranceMatch) {
    const referencePresentationId = decodeURIComponent(insuranceMatch[1]!);
    const updated = updateInsurance(referencePresentationId, body);
    return updated ? json(updated) : json({ message: "اطلاعات بیمه معتبر نیست." }, 400);
  }
  const visibilityMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)$/);
  if (method === "PATCH" && visibilityMatch) {
    const referencePresentationId = decodeURIComponent(visibilityMatch[1]!);
    const updated = updateVisibility(referencePresentationId, Boolean(body.showInApp));
    return updated ? json(updated) : json({ message: "دارو پیدا نشد." }, 404);
  }
  return json({ message: "مسیر محلی شناخته نشد." }, 404);
}

export function apiFetch(path: string, init?: RequestInit) {
  return remoteApiUrl ? fetch(`${remoteApiUrl}${path}`, init) : browserApiFetch(path, init);
}
