from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"anchor not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def regex_once(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"regex anchor count={count} in {path}: {pattern[:120]!r}")
    file.write_text(next_text, encoding="utf-8")


# 1) WorldDrug becomes a live generic clinical catalogue, not a passive registry.
api_segment = r'''function listGenerics\(\) \{.*?\n\}\n\nfunction checklistItem'''
api_replacement = r'''function masterGenericKey(value: string) {
  const terms = normalizedTerms(value).sort();
  return terms.length ? terms.join("|") : normalizedName(value);
}

function inferAdministrationRouteFromMaster(entry: MasterDrugRegistryEntry, therapyGroup: MedicationTherapyGroup): MedicationAdministrationRoute {
  if (therapyGroup === "oral_glucose_lowering" || therapyGroup === "lipid_lowering" || therapyGroup === "antiplatelet" || therapyGroup === "anticoagulant" || therapyGroup === "antianginal" || therapyGroup === "antiarrhythmic" || therapyGroup === "raas_blocker" || therapyGroup === "mineralocorticoid_receptor_antagonist" || therapyGroup === "antihypertensive" || therapyGroup === "liver_directed_therapy" || therapyGroup === "weight_management" || therapyGroup === "vitamin_or_mineral") return "oral";
  if (["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin", "fixed_ratio_combination"].includes(therapyGroup)) return "subcutaneous";
  const text = normalizedName(`${entry.canonicalName} ${entry.drugClass ?? ""} ${(entry.primaryIndications ?? []).join(" ")}`);
  if (/ophthalm|eye|retina/.test(text)) return "ophthalmic";
  if (/topical|cream|ointment|wound dressing/.test(text)) return "topical";
  if (/inhal/.test(text)) return "inhaled";
  if (/intraven| infusion|epoetin|iron sucrose|ferric/.test(text)) return "intravenous";
  return "other";
}

function isType2EngineEligible(entry: MasterDrugRegistryEntry, therapyGroup: MedicationTherapyGroup) {
  if (entry.reviewState !== "approved" || !entry.sourceCodes.length) return false;
  const allowedGroups: MedicationTherapyGroup[] = [
    "oral_glucose_lowering", "glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist",
    "human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin", "fixed_ratio_combination"
  ];
  if (!allowedGroups.includes(therapyGroup)) return false;
  const text = normalizedName(`${entry.therapeuticAreas.join(" ")} ${entry.diabetesOrPhenotype ?? ""} ${(entry.primaryIndications ?? []).join(" ")} ${entry.guidelineRole ?? ""}`);
  if (/stage 2 t1d|delay onset.*type 1|type 1 diabetes prevention/.test(text)) return false;
  return /diabetes|t2d|type 2|hyperglyc|glucose/.test(text);
}

function masterToGenericMedication(entry: MasterDrugRegistryEntry): GenericMedication {
  const seeded = ada2026Type2GenericSeed.find((item) => masterGenericKey(item.canonicalName) === masterGenericKey(entry.canonicalName));
  const therapyGroup = seeded?.therapyGroup ?? inferTherapyGroup(entry);
  const administrationRoute = seeded?.administrationRoute ?? inferAdministrationRouteFromMaster(entry, therapyGroup);
  return {
    id: seeded?.id ?? `master-${entry.id.toLocaleLowerCase()}`,
    canonicalName: entry.canonicalName,
    persianName: entry.persianName?.trim() || entry.canonicalName,
    className: entry.drugClass ?? seeded?.className,
    therapyGroup,
    administrationRoute,
    catalogStatus: seeded?.catalogStatus ?? "admin_added",
    clinicalEngineEnabled: seeded ? true : isType2EngineEligible(entry, therapyGroup),
    masterRegistryId: entry.id
  };
}

function listGenerics() {
  const state = readState();
  const merged = new Map<string, GenericMedication>();
  for (const medication of ada2026Type2GenericSeed) merged.set(masterGenericKey(medication.canonicalName), medication);
  for (const entry of state.masterRegistry.filter((item) => item.reviewState === "approved")) {
    merged.set(masterGenericKey(entry.canonicalName), masterToGenericMedication(entry));
  }
  for (const medication of state.customGenerics) {
    const key = masterGenericKey(medication.canonicalName);
    const current = merged.get(key);
    merged.set(key, current ? { ...current, ...medication, id: current.id, masterRegistryId: current.masterRegistryId ?? medication.masterRegistryId } : medication);
  }
  return [...merged.values()];
}

function presentationMatchesMaster(presentation: ReferenceMedicationPresentation, entry: MasterDrugRegistryEntry) {
  return masterGenericKey(presentation.genericName) === masterGenericKey(entry.canonicalName);
}

function findMasterForPresentation(presentation: ReferenceMedicationPresentation, registry: MasterDrugRegistryEntry[]) {
  if (presentation.id.startsWith("master-ref-")) {
    const id = presentation.id.slice("master-ref-".length).toUpperCase();
    const direct = registry.find((entry) => entry.id.toUpperCase() === id);
    if (direct) return direct;
  }
  return registry.find((entry) => entry.reviewState === "approved" && presentationMatchesMaster(presentation, entry));
}

function masterReferencePresentations(state: BrowserCatalogState, basePresentations: ReferenceMedicationPresentation[]): ReferenceMedicationPresentation[] {
  return state.masterRegistry
    .filter((entry) => entry.reviewState === "approved")
    .filter((entry) => !basePresentations.some((presentation) => presentationMatchesMaster(presentation, entry)))
    .map((entry) => {
      const therapyGroup = inferTherapyGroup(entry);
      return {
        id: `master-ref-${entry.id.toLocaleLowerCase()}`,
        therapeuticClass: entry.drugClass ?? "Clinical catalog",
        mechanismOrSubclass: entry.guidelineRole ?? "WorldDrug clinical knowledge",
        genericName: entry.canonicalName,
        administrationRoute: inferAdministrationRouteFromMaster(entry, therapyGroup),
        dosageForm: "Clinical catalog · فرم بازار در انتظار NFI",
        strengthPresentation: "قدرت/فرآورده در انتظار تطبیق NFI",
        indicationScope: entry.primaryIndications?.join("؛ "),
        marketStatus: "Clinical catalog — Iran market product pending",
        sourceUrl: entry.sourceUrls[0] ?? "about:blank",
        coverageNotes: "هویت و نقش علمی از WorldDrug؛ برند/فرآورده و وضعیت بازار ایران باید با NFI تکمیل شود.",
        sourceFile: entry.sourceFile ?? "WorldDrug.xlsx",
        sourceObservedAt: entry.sourceObservedAt ?? new Date().toISOString(),
        reviewState: "reference_only"
      } satisfies ReferenceMedicationPresentation;
    });
}

function listMedicationChecklist(): MedicationChecklistItem[] {
  const state = readState();
  const basePresentations = [...globalReferenceCatalogue, ...state.customPresentations];
  const presentations = [...basePresentations, ...masterReferencePresentations(state, basePresentations)];
  return presentations.map((presentation) => {
    const market = state.marketData[presentation.id] ?? {};
    const master = findMasterForPresentation(presentation, state.masterRegistry);
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
      clinicalDomains: market.clinicalDomains ?? clinicalDomainsFromMaster(master),
      clinicalEffects: market.clinicalEffects ?? master?.clinicalEffects,
      genericRegistryCode: market.genericRegistryCode,
      price: market.price,
      marketBadge: market.marketBadge ?? (master && presentation.reviewState === "reference_only" ? {
        key: "clinical-catalog",
        labelFa: "Clinical Catalog · وضعیت بازار در انتظار NFI",
        labelEn: "Clinical Catalog · Iran market pending",
        tone: "neutral" as const,
        confirmedByAdmin: false
      } : undefined),
      sourceObservedAt: market.sourceObservedAt ?? master?.sourceObservedAt
    } satisfies MedicationChecklistItem;
  });
}

function checklistItem'''
regex_once("apps/web/lib/api-client.ts", api_segment, api_replacement)

# Replace loose term matching with stable generic-signature matching so FDCs do not collapse into components.
regex_once(
    "apps/web/lib/api-client.ts",
    r'''function matchingReferences\(medication: GenericMedication\) \{.*?\n\}\n\nfunction mergeInsuranceCoverages''',
    '''function matchingReferences(medication: GenericMedication) {
  const medicationKey = masterGenericKey(medication.canonicalName);
  return listMedicationChecklist().filter((presentation) => masterGenericKey(presentation.genericName) === medicationKey);
}

function mergeInsuranceCoverages'''
)

# Correct therapy-group inference, especially FRCs and WorldDrug glucose-lowering classes.
regex_once(
    "apps/web/lib/api-client.ts",
    r'''function inferTherapyGroup\(entry: MasterDrugRegistryEntry \| undefined\): MedicationTherapyGroup \{.*?\n\}\n\nfunction clinicalDomainsFromMaster''',
    '''function inferTherapyGroup(entry: MasterDrugRegistryEntry | undefined): MedicationTherapyGroup {
  const text = normalizedName(`${entry?.drugClass ?? ""} ${(entry?.therapeuticAreas ?? []).join(" ")} ${entry?.canonicalName ?? ""} ${entry?.guidelineRole ?? ""}`);
  if ((/insulin/.test(text) && /glp 1|glp1/.test(text)) || /fixed ratio|frc/.test(text)) return "fixed_ratio_combination";
  if (/dual gip.*glp|gip.*glp|tirzepatide/.test(text)) return "dual_gip_glp_1_receptor_agonist";
  if (/glp 1|glp1/.test(text)) return "glp_1_receptor_agonist";
  if (/insulin/.test(text)) {
    if (/premix|pre mix|mix/.test(text)) return "premixed_insulin";
    if (/prandial|rapid|short|aspart|lispro|glulisine|regular/.test(text)) return "prandial_insulin_analog";
    if (/basal|glargine|degludec|detemir|nph/.test(text)) return "basal_insulin_analog";
    return "human_insulin";
  }
  if (/mineralocorticoid|mra|finerenone|spironolactone|eplerenone/.test(text)) return "mineralocorticoid_receptor_antagonist";
  if (/raas|ace inhibitor|angiotensin|\barb\b/.test(text)) return "raas_blocker";
  if (/heart failure/.test(text)) return "heart_failure_therapy";
  if (/antiplatelet|aspirin|clopidogrel|ticagrelor/.test(text)) return "antiplatelet";
  if (/anticoag|apixaban|rivaroxaban|warfarin/.test(text)) return "anticoagulant";
  if (/antianginal/.test(text)) return "antianginal";
  if (/antiarrhythmic/.test(text)) return "antiarrhythmic";
  if (/hypertension|antihypertensive|calcium channel blocker|beta blocker/.test(text)) return "antihypertensive";
  if (/statin|pcsk9|ezetimibe|lipid lowering|hyperlipid/.test(text)) return "lipid_lowering";
  if (/resmetirom|liver directed|mash|masld/.test(text) && !/diabetes/.test(text)) return "liver_directed_therapy";
  if (/obesity|weight management|anti obesity/.test(text) && !/diabetes/.test(text)) return "weight_management";
  if (/vitamin|mineral|iron replacement/.test(text)) return "vitamin_or_mineral";
  if (/biguanide|dpp 4|sglt2|sulfonyl|meglitinide|glinide|thiazolidinedione|alpha glucosidase|dopamine d2|bile acid sequestrant|diabetes|glucose lowering|hyperglyc/.test(text)) return "oral_glucose_lowering";
  return "other";
}

function clinicalDomainsFromMaster'''
)

# WorldDrug therapeutic areas/effect matrix now drive domain badges instead of a blanket diabetes default.
regex_once(
    "apps/web/lib/api-client.ts",
    r'''function clinicalDomainsFromMaster\(entry: MasterDrugRegistryEntry \| undefined\): MedicationClinicalDomain\[\] \{.*?\n\}\n\nfunction presentationIdForCandidate''',
    '''function clinicalDomainsFromMaster(entry: MasterDrugRegistryEntry | undefined): MedicationClinicalDomain[] {
  if (!entry) return [];
  const text = normalizedName(`${entry.therapeuticAreas.join(" ")} ${entry.drugClass ?? ""} ${(entry.primaryIndications ?? []).join(" ")} ${entry.diabetesOrPhenotype ?? ""}`);
  const domains = new Set<MedicationClinicalDomain>();
  if (/diabetes|glucose|hyperglyc|t1d|t2d/.test(text)) domains.add("diabetes");
  if (/cardio|cvd|coronary|stroke|ascvd/.test(text)) domains.add("cardiovascular");
  if (/kidney|ckd|renal|dialysis/.test(text)) domains.add("kidney");
  if (/liver|hepatic|mash|masld|cirrhos/.test(text)) domains.add("liver");
  if (/obesity|weight/.test(text)) domains.add("obesity");
  if (/hypertension|blood pressure/.test(text)) domains.add("hypertension");
  if (/lipid|ldl|cholesterol|triglycer/.test(text)) domains.add("lipids");
  if (/heart failure|hfref|hfpef/.test(text)) domains.add("heart_failure");
  if (/ascvd|atheroscler/.test(text)) domains.add("ascvd");
  if (/mash|masld/.test(text)) domains.add("masld_mash");
  if (/neuropath/.test(text)) domains.add("neuropathy");
  if (/retinopath|macular/.test(text)) domains.add("retinopathy");
  if (/diabetic foot|foot ulcer|wound/.test(text)) domains.add("diabetic_foot");
  if (/nutrition|protein energy|malnutrition/.test(text)) domains.add("nutrition_support");
  if (/pregnan|gestational/.test(text)) domains.add("pregnancy");
  for (const effect of entry.clinicalEffects) {
    if (effect.domain === "glycemic_control") domains.add("diabetes");
    if (effect.domain === "ascvd") { domains.add("ascvd"); domains.add("cardiovascular"); }
    if (effect.domain === "heart_failure") { domains.add("heart_failure"); domains.add("cardiovascular"); }
    if (effect.domain === "ckd") domains.add("kidney");
    if (effect.domain === "weight") domains.add("obesity");
    if (effect.domain === "masld_mash") { domains.add("masld_mash"); domains.add("liver"); }
    if (effect.domain === "hypertension") domains.add("hypertension");
    if (effect.domain === "lipids") domains.add("lipids");
    if (effect.domain === "retinopathy") domains.add("retinopathy");
    if (effect.domain === "neuropathy") domains.add("neuropathy");
    if (effect.domain === "diabetic_foot") domains.add("diabetic_foot");
  }
  return [...domains];
}

function presentationIdForCandidate'''
)

# Import response exposes the actual live downstream counts.
replace_once(
    "apps/web/lib/api-client.ts",
    '''  saveState(state);\n  return { imported: entries.length, total: state.masterRegistry.length, autoPromoted };''',
    '''  saveState(state);\n  const recognizedGenerics = listGenerics();\n  const checklistItems = listMedicationChecklist();\n  return {\n    imported: entries.length,\n    total: state.masterRegistry.length,\n    autoPromoted,\n    recognizedGenerics: recognizedGenerics.length,\n    checklistItems: checklistItems.length,\n    engineEnabled: recognizedGenerics.filter((item) => item.clinicalEngineEnabled === true || item.catalogStatus === "seeded_from_guideline").length\n  };'''
)

# Master Registry screen reports what actually became usable after import.
replace_once(
    "apps/web/app/admin/master-registry/page.tsx",
    '''    const result = await response.json() as { imported?: number; total?: number; autoPromoted?: number; message?: string };''',
    '''    const result = await response.json() as { imported?: number; total?: number; autoPromoted?: number; recognizedGenerics?: number; checklistItems?: number; engineEnabled?: number; message?: string };'''
)
replace_once(
    "apps/web/app/admin/master-registry/page.tsx",
    '''    setMessage(`${result.imported ?? 0} رکورد WorldDrug ثبت شد؛ ${result.autoPromoted ?? 0} داروی NFI موجود به‌صورت خودکار طبقه‌بندی و وارد فهرست بازار شد. موتور بالینی خودکار فعال نشد.`);''',
    '''    setMessage(`${result.imported ?? 0} رکورد WorldDrug ثبت شد؛ اکنون ${result.recognizedGenerics ?? 0} ژنریک شناخته‌شده و ${result.checklistItems ?? 0} ردیف قابل مدیریت در کاتالوگ وجود دارد. ${result.engineEnabled ?? 0} ژنریک Type 2 با طبقه‌بندی علمی معتبر وارد موتور تصمیم‌یار شده‌اند؛ سایر حوزه‌ها فقط در Clinical Catalog/داروی فعلی قابل انتخاب‌اند تا Rule اختصاصی داشته باشند.`);'''
)

# Admin dashboard count now reflects the imported WorldDrug registry explicitly.
replace_once(
    "apps/web/app/admin/page.tsx",
    '''  GenericMedication,\n  MedicationChecklistItem,''',
    '''  GenericMedication,\n  MasterDrugRegistryEntry,\n  MedicationChecklistItem,'''
)
replace_once(
    "apps/web/app/admin/page.tsx",
    '''  const [medicationChecklist, setMedicationChecklist] = useState<MedicationChecklistItem[]>([]);\n  const [checkingAll, setCheckingAll] = useState(false);''',
    '''  const [medicationChecklist, setMedicationChecklist] = useState<MedicationChecklistItem[]>([]);\n  const [masterRegistry, setMasterRegistry] = useState<MasterDrugRegistryEntry[]>([]);\n  const [checkingAll, setCheckingAll] = useState(false);'''
)
replace_once(
    "apps/web/app/admin/page.tsx",
    '''      const [genericResponse, protocolResponse, guidelineResponse, checklistResponse] = await Promise.all([\n        apiFetch("/v1/catalog/generics"),\n        apiFetch("/v1/protocols/type-2"),\n        apiFetch("/v1/admin/guidelines"),\n        apiFetch("/v1/admin/catalog/medication-checklist"),\n      ]);\n      if (!genericResponse.ok || !protocolResponse.ok || !guidelineResponse.ok || !checklistResponse.ok) {''',
    '''      const [genericResponse, protocolResponse, guidelineResponse, checklistResponse, masterRegistryResponse] = await Promise.all([\n        apiFetch("/v1/catalog/generics"),\n        apiFetch("/v1/protocols/type-2"),\n        apiFetch("/v1/admin/guidelines"),\n        apiFetch("/v1/admin/catalog/medication-checklist"),\n        apiFetch("/v1/admin/catalog/master-registry"),\n      ]);\n      if (!genericResponse.ok || !protocolResponse.ok || !guidelineResponse.ok || !checklistResponse.ok || !masterRegistryResponse.ok) {'''
)
replace_once(
    "apps/web/app/admin/page.tsx",
    '''      setMedicationChecklist(await checklistResponse.json() as MedicationChecklistItem[]);\n      setMessage("اطلاعات کاتالوگ، پروتکل‌ها و منابع علمی با موفقیت بازخوانی شد.");''',
    '''      setMedicationChecklist(await checklistResponse.json() as MedicationChecklistItem[]);\n      setMasterRegistry(await masterRegistryResponse.json() as MasterDrugRegistryEntry[]);\n      setMessage("اطلاعات WorldDrug، کاتالوگ، پروتکل‌ها و منابع علمی با موفقیت بازخوانی شد.");'''
)
replace_once(
    "apps/web/app/admin/page.tsx",
    '''          <small>کاتالوگ راهنما و ورودی‌های بازبینی‌شده</small>''',
    '''          <small>WorldDrug: {masterRegistry.length || "—"} · Seed/Market/Manual یکپارچه</small>'''
)
replace_once(
    "apps/web/app/admin/page.tsx",
    '''          <span>فرآورده‌های قابل نمایش</span>''',
    '''          <span>ردیف‌های دارویی قابل مدیریت</span>'''
)
replace_once(
    "apps/web/app/admin/page.tsx",
    '''          <small>فعال‌شده توسط Admin</small>''',
    '''          <small>Clinical Catalog + فرآورده‌های بازار، فعال برای نمایش</small>'''
)

# Medication Management displays all clinical domains derived from WorldDrug.
replace_once(
    "apps/web/app/admin/medications/page.tsx",
    '''import type { InsuranceProvider, MedicationBrand, MedicationChecklistItem, MedicationClinicalDomain, MedicationDisplayMode } from "@glymize/contracts";''',
    '''import type { InsuranceProvider, MedicationBrand, MedicationChecklistItem, MedicationClinicalDomain, MedicationDisplayMode } from "@glymize/contracts";\nimport { medicationClinicalDomains } from "@glymize/contracts";'''
)
replace_once(
    "apps/web/app/admin/medications/page.tsx",
    '''const providerLabels: Record<InsuranceProvider, string> = {''',
    '''const clinicalDomainLabels: Record<MedicationClinicalDomain, string> = {\n  diabetes: "دیابت", cardiovascular: "قلب و عروق", kidney: "کلیه", liver: "کبد", obesity: "چاقی",\n  hypertension: "فشارخون", lipids: "چربی خون", heart_failure: "نارسایی قلبی", ascvd: "ASCVD",\n  masld_mash: "MASLD/MASH", neuropathy: "نوروپاتی", retinopathy: "رتینوپاتی", diabetic_foot: "پای دیابتی",\n  nutrition_support: "حمایت تغذیه‌ای", pregnancy: "بارداری"\n};\n\nconst providerLabels: Record<InsuranceProvider, string> = {'''
)
replace_once(
    "apps/web/app/admin/medications/page.tsx",
    '''    if (enabled) current.add(domain); else current.delete(domain);\n    if (!current.size) current.add("diabetes");\n    await updateMarketData(item, { clinicalDomains: [...current] });''',
    '''    if (enabled) current.add(domain); else current.delete(domain);\n    await updateMarketData(item, { clinicalDomains: [...current] });'''
)
replace_once(
    "apps/web/app/admin/medications/page.tsx",
    '''        <div className="medication-copy"><strong>{item.genericName}</strong><small>{item.dosageForm} · {item.strengthPresentation}</small></div>''',
    '''        <div className="medication-copy"><strong>{item.genericName}</strong><small>{item.dosageForm} · {item.strengthPresentation}</small><small>حوزه‌ها: {(item.clinicalDomains ?? []).map((domain) => clinicalDomainLabels[domain]).join(" · ") || "بدون حوزهٔ تخصیص‌یافته"}</small></div>'''
)
replace_once(
    "apps/web/app/admin/medications/page.tsx",
    '''          <fieldset><legend>حوزه‌های نمایش همراه</legend>{(["diabetes", "cardiovascular", "kidney", "liver", "obesity"] as const).map((domain) => <label className="compact-check" key={domain}><input checked={(item.clinicalDomains ?? ["diabetes"]).includes(domain)} onChange={(event) => void setClinicalDomain(item, domain, event.target.checked)} type="checkbox" /><span>{{ diabetes: "دیابت", cardiovascular: "قلب", kidney: "کلیه", liver: "کبد", obesity: "چاقی" }[domain]}</span></label>)}</fieldset>''',
    '''          <fieldset><legend>حوزه‌های Clinical Catalog</legend>{medicationClinicalDomains.map((domain) => <label className="compact-check" key={domain}><input checked={(item.clinicalDomains ?? []).includes(domain)} onChange={(event) => void setClinicalDomain(item, domain, event.target.checked)} type="checkbox" /><span>{clinicalDomainLabels[domain]}</span></label>)}</fieldset>'''
)

# Global theme must not paint every component button solid accent; components own their button states.
replace_once(
    "apps/web/app/theme-overrides.css",
    '''.glymize-internal-shell button:not(.mobile-menu):not(.glymize-mode-toggle):not(.glymize-palette-toggle),\n.glymize-internal-shell .primary-button,\n.glymize-internal-shell .admin-link {\n  background: var(--glymize-accent-600);\n}\n\n.glymize-internal-shell button:not(.mobile-menu):not(.glymize-mode-toggle):not(.glymize-palette-toggle):hover,\n.glymize-internal-shell .primary-button:hover,\n.glymize-internal-shell .admin-link:hover {\n  background: var(--glymize-accent-700);\n}''',
    '''.glymize-internal-shell .primary-button,\n.glymize-internal-shell .admin-link {\n  background: var(--glymize-accent-600);\n}\n\n.glymize-internal-shell .primary-button:hover,\n.glymize-internal-shell .admin-link:hover {\n  background: var(--glymize-accent-700);\n}'''
)

# Neutral clinical canvas in light mode; accents stay inside controls/cards rather than tinting the whole workspace.
replace_once("apps/web/app/glymize-theme.css", "  --glymize-line: #dbe7e5;\n  --glymize-surface: #ffffff;\n  --glymize-surface-soft: #fbfdfd;\n  --glymize-canvas: #f4f8f7;", "  --glymize-line: #dfe7e6;\n  --glymize-surface: #ffffff;\n  --glymize-surface-soft: #fafcfc;\n  --glymize-canvas: #f8faf9;")
replace_once("apps/web/app/type-2/type2-v2.module.css", "  background: #fff;\n  box-shadow: var(--shadow);", "  background: var(--glymize-surface, #fff);\n  box-shadow: var(--shadow);")

print("WorldDrug v2 integration patches applied")
