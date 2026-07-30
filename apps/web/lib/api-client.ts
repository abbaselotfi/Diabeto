import { buildType2Assessment, buildType2MedicationConsiderations } from "@diabeto/clinical-engine";
import type {
  CatalogImportRequest,
  GenericMedication,
  GenericMedicationInput,
  GuidelineUpdateCheckResult,
  InsuranceCoverage,
  MedicationBrand,
  MedicationChecklistItem,
  Type2AssessmentResult,
  Type2ConsiderationRequest
} from "@diabeto/contracts";
import { ada2026Type2GenericSeed, type2ProtocolSeed } from "../../api/src/catalog/ada-2026-type2-seed";
import { globalReferenceCatalogue, globalReferenceCatalogueSources } from "../../api/src/catalog/global-reference-catalog";
import { guidelineSources } from "../../api/src/guidelines/guideline-sources";

const remoteApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const storageKey = "diayar-browser-catalog-v1";

interface BrowserCatalogState {
  visibility: Record<string, boolean>;
  insurance: Record<string, InsuranceCoverage[]>;
  brands: Record<string, MedicationBrand[]>;
  customGenerics: GenericMedication[];
}

function emptyState(): BrowserCatalogState {
  return {
    visibility: {},
    insurance: {},
    brands: {},
    customGenerics: []
  };
}

function readState(): BrowserCatalogState {
  if (typeof window === "undefined") return emptyState();
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? { ...emptyState(), ...JSON.parse(saved) as BrowserCatalogState } : emptyState();
  } catch {
    return emptyState();
  }
}

function saveState(state: BrowserCatalogState) {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("diayar-catalog-change"));
}

function listGenerics() {
  const state = readState();
  return [...ada2026Type2GenericSeed, ...state.customGenerics];
}

function listMedicationChecklist(): MedicationChecklistItem[] {
  const state = readState();
  return globalReferenceCatalogue.map((presentation) => ({
    referencePresentationId: presentation.id,
    genericName: presentation.genericName,
    therapeuticClass: presentation.therapeuticClass,
    administrationRoute: presentation.administrationRoute,
    dosageForm: presentation.dosageForm,
    strengthPresentation: presentation.strengthPresentation,
    sourceUrl: presentation.sourceUrl,
    reviewState: presentation.reviewState,
    showInApp: state.visibility[presentation.id] ?? true,
    insuranceCoverages: state.insurance[presentation.id] ?? [],
    brands: state.brands[presentation.id] ?? []
  }));
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
    .filter(({ brand }) => brand.showInsteadOfGeneric && brand.name.trim())
    .sort((left, right) => left.referenceIndex - right.referenceIndex || left.brand.priority - right.brand.priority);
  if (!brands.length) {
    return [{
      cardId: `${medication.id}:generic`,
      displayName: medication.persianName,
      selectedBrandName: undefined,
      selectedBrandId: undefined,
      brandPriority: 0,
      insuranceCoverages: mergeInsuranceCoverages(genericCoverage)
    }];
  }
  return brands.map(({ brand, inheritedCoverage }, index) => ({
    cardId: `${medication.id}:${brand.id}`,
    displayName: brand.name.trim(),
    selectedBrandName: brand.name.trim(),
    selectedBrandId: brand.id,
    brandPriority: index + 1,
    insuranceCoverages: mergeInsuranceCoverages(brand.customInsurance ? brand.insuranceCoverages : inheritedCoverage)
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
    const current = state.insurance[referencePresentationId] ?? [];
    state.insurance = {
      ...state.insurance,
      [referencePresentationId]: [...current.filter((item) => item.provider !== provider), { provider, percent }]
    };
  }
  saveState(state);
  return checklistItem(referencePresentationId);
}

function addBrand(referencePresentationId: string, body: Record<string, unknown>) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  const name = String(body.name ?? "").trim();
  if (!name) return undefined;
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
  const method = (init?.method ?? "GET").toUpperCase();
  const pathname = path.split("?")[0]!;
  const body = requestBody(init);

  if (method === "GET" && pathname === "/v1/catalog/generics") return json(listGenerics());
  if (method === "GET" && pathname === "/v1/protocols/type-2") return json(type2ProtocolSeed);
  if (method === "GET" && pathname === "/v1/admin/guidelines") return json(guidelineSources);
  if (method === "GET" && pathname === "/v1/admin/catalog/medication-checklist") return json(listMedicationChecklist());
  if (method === "GET" && pathname === "/v1/admin/catalog/reference-sources") return json(globalReferenceCatalogueSources);
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
