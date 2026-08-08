from pathlib import Path


def patch(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Expected patch anchor not found in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Contracts: distinguish market visibility from clinical-engine activation.
patch(
    "packages/contracts/src/index.ts",
    '  catalogStatus?: "seeded_from_guideline" | "admin_added" | "retired";\n}',
    '  catalogStatus?: "seeded_from_guideline" | "admin_added" | "retired";\n  /** Imported/market-listed medicines stay outside the recommendation engine until an approved rule explicitly enables them. */\n  clinicalEngineEnabled?: boolean;\n  masterRegistryId?: string;\n}',
)

# Browser catalog imports/state.
patch(
    "apps/web/lib/api-client.ts",
    '  InsuranceCoverage,\n  MedicationBrand,\n  MedicationChecklistItem,\n  MedicationMarketData,\n  MedicationMarketDataInput,\n  NormalizedDrugImportBundle,\n  NormalizedDrugImportRecord,',
    '  InsuranceCoverage,\n  MasterDrugRegistryEntry,\n  MedicationAdministrationRoute,\n  MedicationBrand,\n  MedicationChecklistItem,\n  MedicationClinicalDomain,\n  MedicationMarketData,\n  MedicationMarketDataInput,\n  MedicationTherapyGroup,\n  NormalizedDrugImportBundle,\n  NormalizedDrugImportRecord,\n  ReferenceMedicationPresentation,',
)
patch(
    "apps/web/lib/api-client.ts",
    '  updateRuns: DrugDataUpdateRun[];\n  masterCandidates: MasterDrugCandidate[];\n}',
    '  updateRuns: DrugDataUpdateRun[];\n  masterCandidates: MasterDrugCandidate[];\n  masterRegistry: MasterDrugRegistryEntry[];\n  customPresentations: ReferenceMedicationPresentation[];\n}',
)
patch(
    "apps/web/lib/api-client.ts",
    '    updateRuns: [],\n    masterCandidates: []\n  };',
    '    updateRuns: [],\n    masterCandidates: [],\n    masterRegistry: [],\n    customPresentations: []\n  };',
)
patch(
    "apps/web/lib/api-client.ts",
    '      updateRuns: Array.isArray(parsed.updateRuns) ? parsed.updateRuns : [],\n      masterCandidates: Array.isArray(parsed.masterCandidates) ? parsed.masterCandidates : []\n    }, savedAt: raw.savedAt };',
    '      updateRuns: Array.isArray(parsed.updateRuns) ? parsed.updateRuns : [],\n      masterCandidates: Array.isArray(parsed.masterCandidates) ? parsed.masterCandidates : [],\n      masterRegistry: Array.isArray(parsed.masterRegistry) ? parsed.masterRegistry : [],\n      customPresentations: Array.isArray(parsed.customPresentations) ? parsed.customPresentations : []\n    }, savedAt: raw.savedAt };',
)
patch(
    "apps/web/lib/api-client.ts",
    '        updateRuns: published.updateRuns ?? [],\n        masterCandidates: Array.isArray(published.masterCandidates) ? published.masterCandidates : []\n      };',
    '        updateRuns: published.updateRuns ?? [],\n        masterCandidates: Array.isArray(published.masterCandidates) ? published.masterCandidates : [],\n        masterRegistry: Array.isArray(published.masterRegistry) ? published.masterRegistry : [],\n        customPresentations: Array.isArray(published.customPresentations) ? published.customPresentations : []\n      };',
)
patch(
    "apps/web/lib/api-client.ts",
    '    void publishAdminCatalog(catalog)\n      .then((result) => notifyPublish("success", `انتشار ثبت شد؛ نسخهٔ ${result.commitSha.slice(0, 7)} در حال آماده‌سازی است.`))\n      .catch(() => notifyPublish("error", "انتشار مرکزی ناموفق بود؛ دوباره وارد مدیریت شوید و تغییر را تکرار کنید."));',
    '    void publishAdminCatalog(catalog)\n      .then((result) => {\n        const current = readState();\n        const updateRuns = current.updateRuns.map((run) => run.status === "ready_to_publish" ? { ...run, status: "published" as const } : run);\n        stateCache = { ...current, updateRuns };\n        window.localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), state: stateCache }));\n        window.dispatchEvent(new CustomEvent("glymize-catalog-change"));\n        notifyPublish("success", `انتشار ثبت شد؛ نسخهٔ ${result.commitSha.slice(0, 7)} منتشر شد.`);\n      })\n      .catch(() => notifyPublish("error", "انتشار مرکزی ناموفق بود؛ دوباره وارد مدیریت شوید و تغییر را تکرار کنید."));',
)
patch(
    "apps/web/lib/api-client.ts",
    'function listMedicationChecklist(): MedicationChecklistItem[] {\n  const state = readState();\n  return globalReferenceCatalogue.map((presentation) => {',
    'function listMedicationChecklist(): MedicationChecklistItem[] {\n  const state = readState();\n  const presentations = [...globalReferenceCatalogue, ...state.customPresentations];\n  return presentations.map((presentation) => {',
)
patch(
    "apps/web/lib/api-client.ts",
    'function type2Assessment(request: Type2ConsiderationRequest): Type2AssessmentResult {\n  const visible = listGenerics().filter((medication) => matchingReferences(medication).some((item) => item.showInApp));',
    'function type2Assessment(request: Type2ConsiderationRequest): Type2AssessmentResult {\n  const visible = listGenerics()\n    .filter((medication) => medication.catalogStatus !== "admin_added" || medication.clinicalEngineEnabled === true)\n    .filter((medication) => matchingReferences(medication).some((item) => item.showInApp));',
)

# Master Registry and safe promotion helpers.
anchor = '''function mergeMasterCandidates(current: MasterDrugCandidate[], incoming: MasterDrugCandidate[]) {
  const merged = new Map<string, MasterDrugCandidate>();
  for (const candidate of current) merged.set(masterCandidateKey(candidate), candidate);
  for (const candidate of incoming) merged.set(masterCandidateKey(candidate), candidate);
  return [...merged.values()];
}
'''
addition = anchor + '''
function masterEntryMatchesCandidate(entry: MasterDrugRegistryEntry, candidate: MasterDrugCandidate) {
  const candidateName = normalizedName(candidate.genericName);
  const names = [entry.canonicalName, ...(entry.searchSynonyms ?? [])].map(normalizedName).filter(Boolean);
  return names.some((name) => name === candidateName || (candidateName.length >= 7 && (name.startsWith(candidateName) || candidateName.startsWith(name))));
}

function inferAdministrationRoute(candidate: MasterDrugCandidate): MedicationAdministrationRoute {
  const text = normalizedName(`${candidate.dosageForm ?? ""} ${candidate.genericName}`);
  if (/tablet|capsule|syrup|solution oral|قرص|کپسول|شربت/.test(text)) return "oral";
  if (/ophthalm|eye|چشم/.test(text)) return "ophthalmic";
  if (/topical|cream|ointment|gel|موضع/.test(text)) return "topical";
  if (/inhal|استنشاق/.test(text)) return "inhaled";
  if (/nasal|بینی/.test(text)) return "intranasal";
  if (/inject|pen|vial|insulin|تزریق/.test(text)) return "subcutaneous";
  return "other";
}

function inferTherapyGroup(entry: MasterDrugRegistryEntry | undefined): MedicationTherapyGroup {
  const text = normalizedName(`${entry?.drugClass ?? ""} ${(entry?.therapeuticAreas ?? []).join(" ")} ${entry?.canonicalName ?? ""}`);
  if (text.includes("insulin")) {
    if (/premix|mix/.test(text)) return "premixed_insulin";
    if (/prandial|rapid|short/.test(text)) return "prandial_insulin_analog";
    if (/basal|glargine|degludec|detemir|nph/.test(text)) return "basal_insulin_analog";
    return "human_insulin";
  }
  if (/glp 1|glp1/.test(text)) return /gip/.test(text) ? "dual_gip_glp_1_receptor_agonist" : "glp_1_receptor_agonist";
  if (/lipid|statin|pcsk9|ezetimibe/.test(text)) return "lipid_lowering";
  if (/antiplatelet/.test(text)) return "antiplatelet";
  if (/anticoag/.test(text)) return "anticoagulant";
  if (/heart failure/.test(text)) return "heart_failure_therapy";
  if (/raas|ace inhibitor|arb/.test(text)) return "raas_blocker";
  if (/mineralocorticoid|mra/.test(text)) return "mineralocorticoid_receptor_antagonist";
  if (/hypertension|antihypertensive/.test(text)) return "antihypertensive";
  if (/obesity|weight/.test(text)) return "weight_management";
  if (/liver|mash|masld/.test(text)) return "liver_directed_therapy";
  if (/vitamin|mineral/.test(text)) return "vitamin_or_mineral";
  if (/diabetes|glucose|dpp|sglt|sulfonyl|biguanide|glinide|glucosidase|dopamine d2/.test(text)) return "oral_glucose_lowering";
  return "other";
}

function clinicalDomainsFromMaster(entry: MasterDrugRegistryEntry | undefined): MedicationClinicalDomain[] {
  const text = normalizedName((entry?.therapeuticAreas ?? []).join(" "));
  const domains: MedicationClinicalDomain[] = [];
  if (/diabetes|glucose/.test(text)) domains.push("diabetes");
  if (/cardio|ascvd|cvd/.test(text)) domains.push("cardiovascular");
  if (/kidney|ckd|renal/.test(text)) domains.push("kidney");
  if (/liver|mash|masld|hepatic/.test(text)) domains.push("liver");
  if (/obesity|weight/.test(text)) domains.push("obesity");
  return domains.length ? domains : ["diabetes"];
}

function presentationIdForCandidate(candidate: MasterDrugCandidate) {
  const registry = String(candidate.brandRegistryCode ?? candidate.genericRegistryCode ?? "").replace(/[^a-zA-Z0-9]+/g, "-");
  const label = normalizedName(`${candidate.genericName}-${candidate.dosageForm ?? ""}-${candidate.strengthPresentation ?? ""}`)
    .replace(/[^a-z0-9آ-ی]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `iran-master-${registry || label || crypto.randomUUID()}`;
}

function promoteMasterCandidateInState(
  state: BrowserCatalogState,
  candidate: MasterDrugCandidate,
  input: Partial<{
    persianName: string;
    className: string;
    therapyGroup: MedicationTherapyGroup;
    administrationRoute: MedicationAdministrationRoute;
    clinicalDomains: MedicationClinicalDomain[];
  }> = {}
) {
  const master = state.masterRegistry.find((entry) => entry.reviewState === "approved" && masterEntryMatchesCandidate(entry, candidate));
  const canonicalName = master?.canonicalName ?? candidate.genericName;
  const persianName = input.persianName?.trim() || master?.persianName?.trim() || candidate.genericName;
  const className = input.className?.trim() || master?.drugClass?.trim() || "Needs clinical classification";
  const therapyGroup = input.therapyGroup ?? inferTherapyGroup(master);
  const administrationRoute = input.administrationRoute ?? inferAdministrationRoute(candidate);
  const clinicalDomains = input.clinicalDomains?.length ? input.clinicalDomains : clinicalDomainsFromMaster(master);
  const existingGeneric = [...ada2026Type2GenericSeed, ...state.customGenerics].find((item) => normalizedName(item.canonicalName) === normalizedName(canonicalName));
  const id = existingGeneric?.id ?? `master-${canonicalName.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID()}`;
  if (!existingGeneric) {
    state.customGenerics = [...state.customGenerics, {
      id,
      canonicalName,
      persianName,
      className,
      therapyGroup,
      administrationRoute,
      catalogStatus: "admin_added",
      clinicalEngineEnabled: false,
      masterRegistryId: master?.id
    }];
  }

  let referencePresentationId = state.customPresentations.find((item) =>
    normalizedName(item.genericName).includes(normalizedName(candidate.genericName)) &&
    normalizedName(item.dosageForm) === normalizedName(candidate.dosageForm ?? "") &&
    normalizedName(item.strengthPresentation) === normalizedName(candidate.strengthPresentation ?? "")
  )?.id;
  if (!referencePresentationId) {
    referencePresentationId = presentationIdForCandidate(candidate);
    state.customPresentations = [...state.customPresentations, {
      id: referencePresentationId,
      therapeuticClass: className,
      mechanismOrSubclass: master?.guidelineRole ?? "Master Registry classified",
      genericName: `${candidate.genericName}${persianName && normalizedName(persianName) !== normalizedName(candidate.genericName) ? ` / ${persianName}` : ""}`,
      administrationRoute,
      dosageForm: candidate.dosageForm ?? "نامشخص",
      strengthPresentation: candidate.strengthPresentation ?? "نامشخص",
      indicationScope: master?.primaryIndications?.join("؛ "),
      marketStatus: "Iran NFI verified",
      sourceUrl: candidate.sourceUrl,
      coverageNotes: "Market identity verified from Iran NFI; clinical-engine activation remains separate.",
      sourceFile: "Iran FDA NFI / Master Registry",
      sourceObservedAt: candidate.observedAt,
      reviewState: "validated_for_iran"
    }];
  }

  state.visibility[referencePresentationId] = true;
  state.insurance[referencePresentationId] = candidate.insuranceCoverages ?? [];
  state.marketData[referencePresentationId] = {
    ...(state.marketData[referencePresentationId] ?? {}),
    genericRegistryCode: candidate.genericRegistryCode,
    clinicalDomains,
    price: candidate.price,
    sourceUrl: candidate.sourceUrl,
    sourceObservedAt: candidate.observedAt,
    updatedAt: new Date().toISOString()
  };
  if (candidate.brandName) {
    const current = state.brands[referencePresentationId] ?? [];
    const existing = current.find((brand) => normalizedName(brand.name) === normalizedName(candidate.brandName!));
    const brand: MedicationBrand = {
      id: existing?.id ?? `source-${candidate.brandRegistryCode ?? crypto.randomUUID()}`,
      name: candidate.brandName,
      showInsteadOfGeneric: existing?.showInsteadOfGeneric ?? false,
      priority: existing?.priority ?? current.length + 1,
      customInsurance: existing?.customInsurance ?? false,
      insuranceCoverages: candidate.insuranceCoverages ?? [],
      genericRegistryCode: candidate.genericRegistryCode,
      brandRegistryCode: candidate.brandRegistryCode,
      price: candidate.price,
      sourceDiscovered: true,
      sourceUrl: candidate.sourceUrl,
      sourceObservedAt: candidate.observedAt,
      hiddenFromSource: false
    };
    state.brands[referencePresentationId] = existing ? current.map((item) => item.id === existing.id ? brand : item) : [...current, brand];
  }
  return { referencePresentationId, genericMedicationId: id, matchedMasterRegistryId: master?.id };
}

function promoteMatchingMasterCandidates(state: BrowserCatalogState) {
  const promotable = state.masterCandidates.filter((candidate) => state.masterRegistry.some((entry) => entry.reviewState === "approved" && masterEntryMatchesCandidate(entry, candidate)));
  for (const candidate of promotable) promoteMasterCandidateInState(state, candidate);
  const keys = new Set(promotable.map(masterCandidateKey));
  state.masterCandidates = state.masterCandidates.filter((candidate) => !keys.has(masterCandidateKey(candidate)));
  return promotable.length;
}

function importMasterRegistry(entries: MasterDrugRegistryEntry[]) {
  const state = readState();
  const merged = new Map(state.masterRegistry.map((entry) => [entry.id, entry]));
  for (const entry of entries) merged.set(entry.id, { ...entry, reviewState: "approved" });
  state.masterRegistry = [...merged.values()];
  const autoPromoted = promoteMatchingMasterCandidates(state);
  saveState(state);
  return { imported: entries.length, total: state.masterRegistry.length, autoPromoted };
}

function promoteMasterCandidate(candidateKey: string, body: Record<string, unknown>) {
  const state = readState();
  const candidate = state.masterCandidates.find((item) => masterCandidateKey(item) === candidateKey);
  if (!candidate) return undefined;
  const result = promoteMasterCandidateInState(state, candidate, {
    persianName: String(body.persianName ?? "").trim() || undefined,
    className: String(body.className ?? "").trim() || undefined,
    therapyGroup: body.therapyGroup as MedicationTherapyGroup | undefined,
    administrationRoute: body.administrationRoute as MedicationAdministrationRoute | undefined,
    clinicalDomains: Array.isArray(body.clinicalDomains) ? body.clinicalDomains as MedicationClinicalDomain[] : undefined
  });
  state.masterCandidates = state.masterCandidates.filter((item) => masterCandidateKey(item) !== candidateKey);
  saveState(state);
  return result;
}
'''
patch("apps/web/lib/api-client.ts", anchor, addition)

patch(
    "apps/web/lib/api-client.ts",
    '  state.masterCandidates = mergeMasterCandidates(state.masterCandidates, incomingMasterCandidates);\n  const completedRun: DrugDataUpdateRun = {',
    '  state.masterCandidates = mergeMasterCandidates(state.masterCandidates, incomingMasterCandidates);\n  const autoPromoted = promoteMatchingMasterCandidates(state);\n  if (autoPromoted) addNotification({ severity: "info", title: "داروهای جدید از Master Registry طبقه‌بندی شدند", message: `${autoPromoted} رکورد NFI با Clinical Catalog تأییدشده تطبیق یافت و بدون فعال‌سازی خودکار موتور وارد فهرست دارو شد.`, actionHref: "/admin/medications", actionLabel: "مشاهده داروها", sourceRunId: bundle.run.id });\n  const completedRun: DrugDataUpdateRun = {',
)
patch(
    "apps/web/lib/api-client.ts",
    '  return { applied: true, errors: [], matched, ambiguous, masterCandidatesStored: incomingMasterCandidates.length };',
    '  return { applied: true, errors: [], matched, ambiguous, masterCandidatesStored: state.masterCandidates.length, autoPromoted };',
)

# Browser API routes for Master Registry.
patch(
    "apps/web/lib/api-client.ts",
    '  if (method === "GET" && pathname === "/v1/admin/catalog/master-candidates") return json(readState().masterCandidates);\n  if (method === "GET" && pathname === "/v1/admin/notifications") return json(readState().notifications);',
    '  if (method === "GET" && pathname === "/v1/admin/catalog/master-candidates") return json(readState().masterCandidates.map((candidate) => ({ ...candidate, candidateKey: masterCandidateKey(candidate) })));\n  if (method === "GET" && pathname === "/v1/admin/catalog/master-registry") return json(readState().masterRegistry);\n  if (method === "POST" && pathname === "/v1/admin/catalog/master-registry/import") {\n    const entries = Array.isArray(body.entries) ? body.entries as MasterDrugRegistryEntry[] : [];\n    if (!entries.length || entries.some((entry) => !entry?.id || !entry?.canonicalName || !Array.isArray(entry.sourceCodes) || !Array.isArray(entry.sourceUrls))) return json({ message: "WorldDrug Clinical Catalog معتبر نیست." }, 422);\n    return json(importMasterRegistry(entries));\n  }\n  const masterPromoteMatch = pathname.match(/^\\/v1\\/admin\\/catalog\\/master-candidates\\/(.+)\\/promote$/);\n  if (method === "POST" && masterPromoteMatch) {\n    const result = promoteMasterCandidate(decodeURIComponent(masterPromoteMatch[1]!), body);\n    return result ? json(result) : json({ message: "رکورد Master Candidate پیدا نشد." }, 404);\n  }\n  if (method === "GET" && pathname === "/v1/admin/notifications") return json(readState().notifications);',
)

# New manually-created generics are not automatically clinical-engine rules.
patch(
    "apps/web/lib/api-client.ts",
    '  const medication: GenericMedication = { ...body, id, canonicalName, catalogStatus: "admin_added" };',
    '  const medication: GenericMedication = { ...body, id, canonicalName, catalogStatus: "admin_added", clinicalEngineEnabled: false };',
)

# Medication search should include brand names.
patch(
    "apps/web/app/admin/medications/page.tsx",
    '    const visible = term ? items.filter((item) => `${item.genericName} ${item.therapeuticClass} ${item.dosageForm}`.toLocaleLowerCase().includes(term)) : items;',
    '    const visible = term ? items.filter((item) => `${item.genericName} ${item.therapeuticClass} ${item.dosageForm} ${item.brands.map((brand) => brand.name).join(" ")}`.toLocaleLowerCase().includes(term)) : items;',
)

# Admin entry point now leads to the Master Registry first.
patch(
    "apps/web/app/admin/page.tsx",
    '        <Link className={styles.quickAction} href="/admin/medications">\n          <span className={styles.actionIcon}>Rx</span>\n          <span><strong>کاتالوگ و نمایش دارو</strong><small>نمایش ژنریک/برند، ترتیب برندها و داده بازار</small></span>\n        </Link>',
    '        <Link className={styles.quickAction} href="/admin/master-registry">\n          <span className={styles.actionIcon}>Rx</span>\n          <span><strong>Master Registry و داروها</strong><small>WorldDrug، طبقه‌بندی ژنریک‌های جدید و ورود کنترل‌شده به فهرست بازار</small></span>\n        </Link>',
)

# Fix admin buttons being recolored by the global theme rule and retire the old six-column Excel import UI.
append_css = '''

/* Admin action hierarchy: secondary actions stay neutral instead of inheriting the global solid accent button. */
.glymize-internal-shell button[class*="refreshButton"],
.glymize-internal-shell button[class*="sectionAction"],
.glymize-internal-shell [class*="evidenceActions"] button {
  border: 1px solid var(--glymize-line) !important;
  background: var(--glymize-surface) !important;
  color: var(--glymize-accent-700) !important;
  box-shadow: none !important;
}
.glymize-internal-shell button[class*="refreshButton"]:hover,
.glymize-internal-shell button[class*="sectionAction"]:hover,
.glymize-internal-shell [class*="evidenceActions"] button:hover {
  border-color: var(--glymize-accent-500) !important;
  background: var(--glymize-accent-soft) !important;
  color: var(--glymize-accent-700) !important;
}
.glymize-internal-shell [class*="evidenceActions"] button {
  flex: 0 0 auto;
  min-width: 104px;
}

/* The legacy six-column Excel importer is superseded by the WorldDrug Clinical Catalog workflow. */
.glymize-internal-shell .import-card {
  display: none !important;
}
'''
css_path = Path("apps/web/app/theme-overrides.css")
css = css_path.read_text(encoding="utf-8")
if "Admin action hierarchy" not in css:
    css_path.write_text(css + append_css, encoding="utf-8")

# Admin Worker: persist new catalog layers and mark successful publish runs as published.
patch(
    "apps/admin-worker/src/index.ts",
    '  updateRuns?: unknown[];\n  masterCandidates?: unknown[];\n}',
    '  updateRuns?: unknown[];\n  masterCandidates?: unknown[];\n  masterRegistry?: unknown[];\n  customPresentations?: unknown[];\n}',
)
patch(
    "apps/admin-worker/src/index.ts",
    '  if (catalog.masterCandidates !== undefined && !Array.isArray(catalog.masterCandidates)) return false;\n  if (Object.values(catalog.visibility).some((visible) => typeof visible !== "boolean")) return false;',
    '  if (catalog.masterCandidates !== undefined && !Array.isArray(catalog.masterCandidates)) return false;\n  if (catalog.masterRegistry !== undefined && !Array.isArray(catalog.masterRegistry)) return false;\n  if (catalog.customPresentations !== undefined && !Array.isArray(catalog.customPresentations)) return false;\n  if (Object.values(catalog.visibility).some((visible) => typeof visible !== "boolean")) return false;',
)
patch(
    "apps/admin-worker/src/index.ts",
    '  const publishedCatalog = {\n    ...payload.catalog,\n    schemaVersion: 2,',
    '  const publishedCatalog = {\n    ...payload.catalog,\n    updateRuns: (payload.catalog.updateRuns ?? []).map((run) => {\n      if (!run || typeof run !== "object") return run;\n      const typed = run as Record<string, unknown>;\n      return typed.status === "ready_to_publish" ? { ...typed, status: "published" } : run;\n    }),\n    schemaVersion: 2,',
)

print("Catalog foundation patch applied successfully.")
