"use client";

import type { MasterDrugRegistryEntry, MedicationClinicalEffect } from "@glymize/contracts";
import { medicationAdministrationRoutes, medicationClinicalDomains, medicationTherapyGroups } from "@glymize/contracts";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { apiFetch } from "../../../lib/api-client";
import styles from "./master-registry.module.css";

interface MasterCandidate {
  candidateKey: string;
  genericName: string;
  genericRegistryCode?: string;
  brandName?: string;
  brandRegistryCode?: string;
  dosageForm?: string;
  strengthPresentation?: string;
  sourceUrl: string;
  sourceReference: string;
  observedAt: string;
  reviewReason?: string;
  clinicalDomains?: string[];
}

interface WorldDrugPreview {
  fileName: string;
  entries: MasterDrugRegistryEntry[];
  errors: string[];
}

const requiredHeaders = [
  "Drug_ID", "Generic_INN", "Persian_Name", "NFI_Search_Synonyms", "Combination",
  "Therapeutic_Area", "Drug_Class", "Primary_Indication", "Guideline_Role",
  "Diabetes_or_Phenotype", "ASCVD_Benefit", "HF_Benefit", "Kidney_Benefit",
  "Weight_Effect", "MASLD_MASH_Role", "Renal_eGFR_Notes", "Hepatic_Notes",
  "Key_Safety_Monitoring", "Special_Population_Notes", "Regulatory_Status_2026",
  "Guideline_Source_Codes", "Source_URLs"
] as const;

function text(value: unknown) { return String(value ?? "").trim(); }
function split(value: unknown) { return text(value).split(/\s*;\s*/).map((item) => item.trim()).filter(Boolean); }

function effect(domain: MedicationClinicalEffect["domain"], value: unknown, role: string): MedicationClinicalEffect | null {
  const practicalNote = text(value);
  if (!practicalNote) return null;
  const normalized = practicalNote.toLowerCase();
  let direction: MedicationClinicalEffect["direction"] = "neutral";
  if (/not recommended|avoid|contraindicat/.test(normalized)) direction = "avoid";
  else if (/weight gain|harm|risk|worsen/.test(normalized)) direction = "risk";
  else if (/strong/.test(normalized)) direction = "strong_benefit";
  else if (/benefit/.test(normalized) && !/no .*benefit|not established/.test(normalized)) direction = "benefit";
  else if (/weight loss/.test(normalized)) direction = "benefit";
  else if (/not established/.test(normalized)) direction = "not_established";
  const evidenceStrength: MedicationClinicalEffect["evidenceStrength"] = /core|foundational|recommended/i.test(role)
    ? "guideline_recommended"
    : /demonstrated|outcome/i.test(practicalNote)
      ? "outcome_evidence"
      : "supportive";
  return { domain, direction, evidenceStrength, practicalNote };
}

async function parseWorldDrug(file: File): Promise<WorldDrugPreview> {
  try {
    const rows = await readSheet(file, { sheet: "WorldDrug" });
    const headers = (rows[0] ?? []).map((value) => text(value));
    const missing = requiredHeaders.filter((header) => !headers.includes(header));
    if (missing.length) return { fileName: file.name, entries: [], errors: [`ستون‌های WorldDrug پیدا نشد: ${missing.join("، ")}`] };
    const col = (name: string) => headers.indexOf(name);
    const entries = rows.slice(1).flatMap((row): MasterDrugRegistryEntry[] => {
      const id = text(row[col("Drug_ID")]);
      const canonicalName = text(row[col("Generic_INN")]);
      if (!id || !canonicalName) return [];
      const guidelineRole = text(row[col("Guideline_Role")]);
      const effects = [
        effect("ascvd", row[col("ASCVD_Benefit")], guidelineRole),
        effect("heart_failure", row[col("HF_Benefit")], guidelineRole),
        effect("ckd", row[col("Kidney_Benefit")], guidelineRole),
        effect("weight", row[col("Weight_Effect")], guidelineRole),
        effect("masld_mash", row[col("MASLD_MASH_Role")], guidelineRole)
      ].filter((item): item is MedicationClinicalEffect => Boolean(item));
      return [{
        id,
        canonicalName,
        persianName: text(row[col("Persian_Name")]) || undefined,
        searchSynonyms: split(row[col("NFI_Search_Synonyms")]),
        combination: /yes|true|1|بله/i.test(text(row[col("Combination")])),
        therapeuticAreas: split(row[col("Therapeutic_Area")].toString().replace(/\s*\/\s*/g, ";")),
        drugClass: text(row[col("Drug_Class")]) || undefined,
        primaryIndications: split(row[col("Primary_Indication")]),
        guidelineRole: guidelineRole || undefined,
        diabetesOrPhenotype: text(row[col("Diabetes_or_Phenotype")]) || undefined,
        clinicalEffects: effects,
        renalNotes: text(row[col("Renal_eGFR_Notes")]) || undefined,
        hepaticNotes: text(row[col("Hepatic_Notes")]) || undefined,
        safetyMonitoring: text(row[col("Key_Safety_Monitoring")]) || undefined,
        specialPopulationNotes: text(row[col("Special_Population_Notes")]) || undefined,
        regulatoryStatus: text(row[col("Regulatory_Status_2026")]) || undefined,
        sourceCodes: split(row[col("Guideline_Source_Codes")]),
        sourceUrls: split(row[col("Source_URLs")]),
        sourceFile: file.name,
        sourceObservedAt: new Date().toISOString(),
        reviewState: "approved"
      }];
    });
    return { fileName: file.name, entries, errors: entries.length ? [] : ["هیچ ردیف دارویی معتبری در شیت WorldDrug پیدا نشد."] };
  } catch {
    return { fileName: file.name, entries: [], errors: ["شیت WorldDrug خوانده نشد. ساختار فایل باید دقیقاً مطابق WorldDrug.xlsx باشد."] };
  }
}

export default function MasterRegistryPage() {
  const [entries, setEntries] = useState<MasterDrugRegistryEntry[]>([]);
  const [candidates, setCandidates] = useState<MasterCandidate[]>([]);
  const [preview, setPreview] = useState<WorldDrugPreview | null>(null);
  const [message, setMessage] = useState("Clinical Catalog و رکوردهای جدید NFI در حال بارگذاری‌اند…");

  const refresh = useCallback(async () => {
    const [registryResponse, candidateResponse] = await Promise.all([
      apiFetch("/v1/admin/catalog/master-registry"),
      apiFetch("/v1/admin/catalog/master-candidates")
    ]);
    if (!registryResponse.ok || !candidateResponse.ok) throw new Error("unavailable");
    setEntries(await registryResponse.json() as MasterDrugRegistryEntry[]);
    setCandidates(await candidateResponse.json() as MasterCandidate[]);
    setMessage("Master Registry آماده است. ورود به فهرست بازار از فعال‌سازی موتور بالینی جدا نگه داشته می‌شود.");
  }, []);

  useEffect(() => { void refresh().catch(() => setMessage("Master Registry در دسترس نیست؛ اتصال API را بررسی کنید.")); }, [refresh]);

  async function importWorldDrug() {
    if (!preview || preview.errors.length || !preview.entries.length) return;
    const response = await apiFetch("/v1/admin/catalog/master-registry/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: preview.entries, sourceFormat: "WorldDrug.xlsx" })
    });
    const result = await response.json() as { imported?: number; total?: number; autoPromoted?: number; message?: string };
    if (!response.ok) { setMessage(result.message ?? "ورود Clinical Catalog ناموفق بود."); return; }
    setMessage(`${result.imported ?? 0} رکورد WorldDrug ثبت شد؛ ${result.autoPromoted ?? 0} داروی NFI موجود به‌صورت خودکار طبقه‌بندی و وارد فهرست بازار شد. موتور بالینی خودکار فعال نشد.`);
    setPreview(null);
    await refresh();
  }

  async function promoteCandidate(event: FormEvent<HTMLFormElement>, candidate: MasterCandidate) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await apiFetch(`/v1/admin/catalog/master-candidates/${encodeURIComponent(candidate.candidateKey)}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persianName: String(form.get("persianName") ?? ""),
        className: String(form.get("className") ?? ""),
        therapyGroup: String(form.get("therapyGroup") ?? "other"),
        administrationRoute: String(form.get("administrationRoute") ?? "other"),
        clinicalDomains: [String(form.get("clinicalDomain") ?? "diabetes")]
      })
    });
    if (!response.ok) { setMessage(`ورود «${candidate.genericName}» انجام نشد.`); return; }
    setMessage(`«${candidate.genericName}» وارد فهرست دارو شد؛ تا زمان اتصال Rule علمی تأییدشده در پیشنهادهای موتور استفاده نمی‌شود.`);
    await refresh();
  }

  return <main className={styles.page}>
    <div className={styles.topLinks}><Link href="/admin">→ پنل مدیریت</Link><Link href="/admin/data-updates">داده و بازار ایران</Link><Link href="/admin/medications">نمایش و بیمه داروها</Link></div>
    <header className={styles.hero}><div><span>Clinical Knowledge Registry</span><h1>Master Drug Registry</h1><p>WorldDrug فرمت استاندارد Clinical Catalog است. این لایه هویت و نقش علمی دارو را ثبت می‌کند؛ وجود یک دارو در این فهرست به‌تنهایی Rule درمانی یا توصیه موتور را فعال نمی‌کند.</p></div><div className={styles.heroStats}><b>{entries.length}</b><small>رکورد Clinical Catalog</small><b>{candidates.length}</b><small>نیازمند طبقه‌بندی</small></div></header>

    <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><span>Standard input</span><h2>ورود WorldDrug.xlsx</h2><p>شیت <b>WorldDrug</b> با ستون‌های رسمی فایل مرجع خوانده می‌شود؛ Import قدیمی شش‌ستونی دیگر مسیر استاندارد نیست.</p></div><label className={styles.fileButton}>انتخاب WorldDrug.xlsx<input accept=".xlsx" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseWorldDrug(file).then(setPreview); }} /></label></div>
      {preview && <div className={preview.errors.length ? styles.previewError : styles.preview}><strong>{preview.fileName}</strong><span>{preview.entries.length} ردیف قابل ورود</span>{preview.errors.map((error) => <p key={error}>{error}</p>)}<button disabled={Boolean(preview.errors.length)} onClick={() => void importWorldDrug()} type="button">تأیید و ثبت Clinical Catalog</button></div>}
    </section>

    <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><span>Direct market admission</span><h2>داروهای جدید NFI</h2><p>اگر نام دارو با WorldDrug تطبیق قطعی داشته باشد، سیستم آن را مستقیم به فهرست بازار منتقل می‌کند. موارد باقیمانده اینجا برای طبقه‌بندی انسانی نمایش داده می‌شوند.</p></div><b className={styles.count}>{candidates.length}</b></div>
      <div className={styles.candidateList}>{candidates.length ? candidates.map((candidate) => <article className={styles.candidate} key={candidate.candidateKey}>
        <div className={styles.candidateSummary}><div><strong>{candidate.genericName}</strong><small>{candidate.brandName || "بدون برند"} · {candidate.dosageForm || "فرم نامشخص"} · {candidate.strengthPresentation || "قدرت نامشخص"}</small></div><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">منبع NFI ↗</a></div>
        {candidate.reviewReason && <p>{candidate.reviewReason}</p>}
        <form className={styles.classificationForm} onSubmit={(event) => void promoteCandidate(event, candidate)}>
          <label>نام فارسی<input name="persianName" placeholder="نام فارسی ژنریک" /></label>
          <label>کلاس دارویی<input name="className" placeholder="Drug class" /></label>
          <label>Therapy group<select name="therapyGroup" defaultValue="other">{medicationTherapyGroups.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Route<select name="administrationRoute" defaultValue="other">{medicationAdministrationRoutes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>حوزه اصلی<select name="clinicalDomain" defaultValue="diabetes">{medicationClinicalDomains.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="submit">تأیید طبقه‌بندی و ورود به فهرست</button>
        </form>
      </article>) : <p className={styles.empty}>رکورد طبقه‌بندی‌نشده‌ای باقی نمانده است.</p>}</div>
    </section>

    <p className={styles.status} role="status">{message}</p>
  </main>;
}
