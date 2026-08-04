"use client";

import Link from "next/link";
import type { InsuranceProvider, MedicationBrand, MedicationChecklistItem, MedicationClinicalDomain, MedicationDisplayMode } from "@glymize/contracts";
import { useEffect, useMemo, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { apiFetch, beginCatalogPublishBatch, endCatalogPublishBatch } from "../../../lib/api-client";
import { withBasePath } from "../../../lib/base-path";
const providerLabels: Record<InsuranceProvider, string> = {
  social_security: "بیمه تأمین اجتماعی",
  health_insurance: "بیمه سلامت",
  armed_forces: "بیمه نیروهای مسلح",
  other_organizations: "سایر ارگان‌ها (بانک، شرکت نفت و…)",
  supplementary: "بیمه تکمیلی"
};
interface CoverageDraft {
  provider: InsuranceProvider;
  percent: string;
  genericCode: string;
  brandCode: string;
  insurerShareToman: string;
  patientShareToman: string;
  referencePriceToman: string;
}
interface Draft extends CoverageDraft { enabled: boolean; }
interface MedicationImportRow {
  genericName: string;
  showMedication?: boolean;
  brandName?: string;
  showBrand?: boolean;
  provider?: InsuranceProvider;
  percent?: number;
}
interface ImportPreview {
  rows: MedicationImportRow[];
  matchedGenericNames: string[];
  matchedPresentationIds: string[];
  unmatchedGenericNames: string[];
  brandCount: number;
  insuranceCount: number;
  errors: string[];
}

const importHeaders = ["نام ژنریک", "نمایش دارو", "نام برند", "نمایش برند", "ارگان بیمه", "درصد پوشش"];
const providerAliases: Record<string, InsuranceProvider> = {
  "بیمه تامین اجتماعی": "social_security",
  "بیمه تأمین اجتماعی": "social_security",
  "تامین اجتماعی": "social_security",
  "تأمین اجتماعی": "social_security",
  "بیمه سلامت": "health_insurance",
  "سلامت": "health_insurance",
  "بیمه نیروهای مسلح": "armed_forces",
  "نیروهای مسلح": "armed_forces",
  "سایر ارگان ها": "other_organizations",
  "سایر ارگانها": "other_organizations",
  "بیمه تکمیلی": "supplementary",
  "تکمیلی": "supplementary"
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, "")
    .replace(/[()،,;؛]/g, " ").replace(/\s+/g, " ");
}

function parseBoolean(value: unknown): boolean | undefined {
  const text = normalize(value);
  if (!text) return undefined;
  if (["بله", "بلی", "yes", "true", "1"].includes(text)) return true;
  if (["خیر", "نه", "no", "false", "0"].includes(text)) return false;
  return undefined;
}

function matchesGeneric(input: string, catalogueName: string) {
  const inputName = normalize(input);
  return normalize(catalogueName) === inputName ||
    catalogueName.split("/").some((part) => normalize(part) === inputName);
}

export default function MedicationSelectionPage() {
  const [items, setItems] = useState<MedicationChecklistItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [brandInsuranceDrafts, setBrandInsuranceDrafts] = useState<Record<string, CoverageDraft>>({});
  const [query, setQuery] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [syncVisibility, setSyncVisibility] = useState(true);
  const [replaceBrands, setReplaceBrands] = useState(true);
  const [message, setMessage] = useState("در حال بارگذاری کاتالوگ…");

  async function refresh() {
    const response = await apiFetch("/v1/admin/catalog/medication-checklist");
    if (!response.ok) throw new Error("unavailable");
    const data = await response.json() as MedicationChecklistItem[];
    setItems(data);
    setMessage(`${data.length} فرآورده آمادهٔ انتخاب است.`);
  }
  useEffect(() => { void refresh().catch(() => setMessage("API در دسترس نیست؛ سرویس را اجرا و صفحه را بازخوانی کنید.")); }, []);

  const grouped = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const visible = term ? items.filter((item) => `${item.genericName} ${item.therapeuticClass} ${item.dosageForm}`.toLocaleLowerCase().includes(term)) : items;
    return visible.reduce<Record<string, MedicationChecklistItem[]>>((groups, item) => ((groups[item.therapeuticClass] ??= []).push(item), groups), {});
  }, [items, query]);

  function draftFor(item: MedicationChecklistItem): Draft {
    return drafts[item.referencePresentationId] ?? { enabled: item.insuranceCoverages.length > 0, provider: "social_security", percent: "", genericCode: "", brandCode: "", insurerShareToman: "", patientShareToman: "", referencePriceToman: "" };
  }
  function setDraft(item: MedicationChecklistItem, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [item.referencePresentationId]: { ...draftFor(item), ...patch } }));
  }
  async function patch(path: string, body: object) {
    const response = await apiFetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("failed");
    const updated = await response.json() as MedicationChecklistItem;
    setItems((current) => current.map((item) => item.referencePresentationId === updated.referencePresentationId ? updated : item));
  }
  async function post(path: string, body: object) {
    const response = await apiFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("failed");
    const updated = await response.json() as MedicationChecklistItem;
    setItems((current) => current.map((item) => item.referencePresentationId === updated.referencePresentationId ? updated : item));
    return updated;
  }
  async function remove(path: string) {
    const response = await apiFetch(path, { method: "DELETE" });
    if (!response.ok) throw new Error("failed");
    const updated = await response.json() as MedicationChecklistItem;
    setItems((current) => current.map((item) => item.referencePresentationId === updated.referencePresentationId ? updated : item));
    return updated;
  }
  async function setVisibility(item: MedicationChecklistItem, showInApp: boolean) {
    try {
      await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}`, { showInApp });
      setMessage(`نمایش «${item.genericName}» ${showInApp ? "فعال" : "غیرفعال"} شد.`);
    } catch { setMessage("تغییر نمایش ذخیره نشد."); }
  }
  async function setInsuranceEnabled(item: MedicationChecklistItem, enabled: boolean) {
    setDraft(item, { enabled });
    if (!enabled) {
      try { await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/insurance`, { enabled: false }); setMessage("پوشش‌های بیمه‌ای دارو پاک شدند."); }
      catch { setMessage("تغییر بیمه ذخیره نشد."); }
    }
  }
  async function registerInsurance(item: MedicationChecklistItem) {
    const draft = draftFor(item);
    const percent = Number(draft.percent);
    if (!draft.enabled || !Number.isFinite(percent) || percent < 0 || percent > 100) { setMessage("تیک بیمه را فعال و درصدی بین صفر تا صد وارد کنید."); return; }
    try {
      await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/insurance`, {
        enabled: true,
        provider: draft.provider,
        percent,
        origin: "manual",
        genericCode: draft.genericCode.trim() || undefined,
        insurerShareToman: draft.insurerShareToman ? Number(draft.insurerShareToman) : undefined,
        patientShareToman: draft.patientShareToman ? Number(draft.patientShareToman) : undefined,
        referencePriceToman: draft.referencePriceToman ? Number(draft.referencePriceToman) : undefined
      });
      setDraft(item, { percent: "", genericCode: "", insurerShareToman: "", patientShareToman: "", referencePriceToman: "" });
      setMessage(`پوشش ${providerLabels[draft.provider]} ثبت شد.`);
    } catch { setMessage("پوشش بیمه ثبت نشد."); }
  }
  async function addBrand(item: MedicationChecklistItem) {
    try { await post(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands`, {}); setMessage("زیرشاخهٔ برند اضافه شد."); }
    catch { setMessage("برند اضافه نشد."); }
  }
  async function updateBrand(item: MedicationChecklistItem, brand: MedicationBrand, body: object) {
    try { await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${brand.id}`, body); }
    catch { setMessage("تغییر برند ذخیره نشد."); }
  }
  function brandDraft(brandId: string) {
    return brandInsuranceDrafts[brandId] ?? { provider: "social_security" as InsuranceProvider, percent: "", genericCode: "", brandCode: "", insurerShareToman: "", patientShareToman: "", referencePriceToman: "" };
  }
  async function registerBrandInsurance(item: MedicationChecklistItem, brand: MedicationBrand) {
    const draft = brandDraft(brand.id);
    const percent = Number(draft.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) { setMessage("درصد بیمهٔ برند باید بین صفر تا صد باشد."); return; }
    await updateBrand(item, brand, { insuranceCoverages: [...brand.insuranceCoverages.filter((entry) => entry.provider !== draft.provider), {
      provider: draft.provider,
      percent,
      origin: "manual",
      genericCode: draft.genericCode.trim() || undefined,
      brandCode: draft.brandCode.trim() || undefined,
      insurerShareToman: draft.insurerShareToman ? Number(draft.insurerShareToman) : undefined,
      patientShareToman: draft.patientShareToman ? Number(draft.patientShareToman) : undefined,
      referencePriceToman: draft.referencePriceToman ? Number(draft.referencePriceToman) : undefined
    }] });
    setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...draft, percent: "", genericCode: "", brandCode: "", insurerShareToman: "", patientShareToman: "", referencePriceToman: "" } }));
    setMessage(`پوشش اختصاصی برند «${brand.name || "بدون نام"}» ثبت شد.`);
  }

  async function updateMarketData(item: MedicationChecklistItem, body: object) {
    try {
      await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/market-data`, body);
      setMessage(`تنظیمات بازار و نمایش «${item.genericName}» ثبت شد.`);
    } catch { setMessage("تنظیمات بازار دارو ذخیره نشد."); }
  }

  async function moveBrand(item: MedicationChecklistItem, brand: MedicationBrand, direction: -1 | 1) {
    const ordered = [...item.brands].sort((left, right) => left.priority - right.priority);
    const index = ordered.findIndex((entry) => entry.id === brand.id);
    const target = ordered[index + direction];
    if (!target) return;
    beginCatalogPublishBatch();
    try {
      await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${brand.id}`, { priority: target.priority });
      await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${target.id}`, { priority: brand.priority });
      setMessage("ترتیب برندها ثبت شد.");
    } catch { setMessage("ترتیب برندها ذخیره نشد."); }
    finally { endCatalogPublishBatch(); }
  }

  async function setClinicalDomain(item: MedicationChecklistItem, domain: MedicationClinicalDomain, enabled: boolean) {
    const current = new Set(item.clinicalDomains ?? ["diabetes"]);
    if (enabled) current.add(domain); else current.delete(domain);
    if (!current.size) current.add("diabetes");
    await updateMarketData(item, { clinicalDomains: [...current] });
  }

  async function prepareImport(file: File) {
    try {
      const sheetRows = await readSheet(file);
      const headers = (sheetRows[0] ?? []).map((cell) => String(cell ?? "").trim());
      const missingHeaders = importHeaders.filter((header) => !headers.includes(header));
      if (missingHeaders.length) {
        setImportPreview({ rows: [], matchedGenericNames: [], matchedPresentationIds: [], unmatchedGenericNames: [], brandCount: 0, insuranceCount: 0, errors: [`ستون‌های الزامی پیدا نشد: ${missingHeaders.join("، ")}`] });
        setImportFileName(file.name);
        return;
      }
      const column = (header: string) => headers.indexOf(header);
      const parsedRows: MedicationImportRow[] = [];
      const errors: string[] = [];
      sheetRows.slice(1).forEach((cells, rowIndex) => {
        const genericName = String(cells[column("نام ژنریک")] ?? "").trim();
        if (!genericName) return;
        const brandName = String(cells[column("نام برند")] ?? "").trim() || undefined;
        const providerText = String(cells[column("ارگان بیمه")] ?? "").trim();
        const percentText = String(cells[column("درصد پوشش")] ?? "").trim();
        let provider: InsuranceProvider | undefined;
        let percent: number | undefined;
        if (providerText || percentText) {
          provider = providerAliases[normalize(providerText)];
          percent = Number(percentText);
          if (!provider) errors.push(`ردیف ${rowIndex + 2}: ارگان بیمه معتبر نیست.`);
          if (!Number.isFinite(percent) || percent < 0 || percent > 100) errors.push(`ردیف ${rowIndex + 2}: درصد پوشش باید بین صفر تا صد باشد.`);
        }
        parsedRows.push({
          genericName,
          showMedication: parseBoolean(cells[column("نمایش دارو")]),
          brandName,
          showBrand: parseBoolean(cells[column("نمایش برند")]),
          provider,
          percent
        });
      });
      const genericNames = Array.from(new Set(parsedRows.map((row) => row.genericName)));
      const matchedGenericNames = genericNames.filter((name) => items.some((item) => matchesGeneric(name, item.genericName)));
      const unmatchedGenericNames = genericNames.filter((name) => !matchedGenericNames.includes(name));
      const matchedPresentationIds = items.filter((item) => matchedGenericNames.some((name) => matchesGeneric(name, item.genericName))).map((item) => item.referencePresentationId);
      const brandCount = new Set(parsedRows.filter((row) => row.brandName && matchedGenericNames.some((name) => normalize(name) === normalize(row.genericName))).map((row) => `${normalize(row.genericName)}::${normalize(row.brandName)}`)).size;
      const insuranceCount = parsedRows.filter((row) => row.provider && row.percent !== undefined).length;
      setImportFileName(file.name);
      setImportPreview({ rows: parsedRows, matchedGenericNames, matchedPresentationIds, unmatchedGenericNames, brandCount, insuranceCount, errors });
      setMessage("پیش‌نمایش فایل آماده است؛ گزارش را بررسی و سپس ثبت کنید.");
    } catch {
      setImportFileName(file.name);
      setImportPreview({ rows: [], matchedGenericNames: [], matchedPresentationIds: [], unmatchedGenericNames: [], brandCount: 0, insuranceCount: 0, errors: ["فایل Excel خوانده نشد؛ از قالب استاندارد دانلودشده استفاده کنید."] });
    }
  }

  async function applyImport() {
    if (!importPreview || importPreview.errors.length || !importPreview.matchedPresentationIds.length) return;
    const matchedIdSet = new Set(importPreview.matchedPresentationIds);
    setMessage("در حال ثبت Import…");
    beginCatalogPublishBatch();
    try {
      for (const item of items) {
        const rows = importPreview.rows.filter((row) => matchesGeneric(row.genericName, item.genericName));
        const explicitVisibility = rows.find((row) => row.showMedication !== undefined)?.showMedication;
        if (syncVisibility || explicitVisibility !== undefined) {
          const showInApp = matchedIdSet.has(item.referencePresentationId) && (explicitVisibility ?? true);
          if (item.showInApp !== showInApp) {
            await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}`, { showInApp });
          }
        }
        if (!matchedIdSet.has(item.referencePresentationId)) continue;

        for (const row of rows.filter((entry) => !entry.brandName && entry.provider && entry.percent !== undefined)) {
          await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/insurance`, {
            enabled: true,
            provider: row.provider,
            percent: row.percent
          });
        }

        const brandRows = rows.filter((row) => row.brandName);
        const orderedNames = Array.from(new Map(brandRows.map((row) => [normalize(row.brandName), row.brandName!])).values());
        const importedKeys = new Set(orderedNames.map(normalize));
        if (replaceBrands) {
          for (const brand of item.brands.filter((entry) => !importedKeys.has(normalize(entry.name)))) {
            await remove(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${brand.id}`);
          }
        }
        for (const [index, name] of orderedNames.entries()) {
          const existing = item.brands.find((brand) => normalize(brand.name) === normalize(name));
          const rowsForBrand = brandRows.filter((row) => normalize(row.brandName) === normalize(name));
          const insuranceRows = rowsForBrand.filter((row) => row.provider && row.percent !== undefined);
          const insuranceCoverages = [...(existing?.insuranceCoverages ?? [])];
          for (const row of insuranceRows) {
            const provider = row.provider!;
            const percent = row.percent!;
            const currentIndex = insuranceCoverages.findIndex((entry) => entry.provider === provider);
            if (currentIndex >= 0) insuranceCoverages[currentIndex] = { provider, percent };
            else insuranceCoverages.push({ provider, percent });
          }
          const body = {
            name,
            showInsteadOfGeneric: rowsForBrand.find((row) => row.showBrand !== undefined)?.showBrand ?? true,
            priority: replaceBrands ? index + 1 : existing?.priority ?? item.brands.length + index + 1,
            ...(insuranceRows.length ? { customInsurance: true, insuranceCoverages } : {})
          };
          if (existing) await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${existing.id}`, body);
          else {
            const updated = await post(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands`, { name });
            const created = [...updated.brands].reverse().find((brand) => normalize(brand.name) === normalize(name));
            if (created) await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${created.id}`, body);
          }
        }
      }
      await refresh();
      setMessage(`Import انجام شد: ${importPreview.matchedGenericNames.length} ژنریک و ${importPreview.brandCount} برند ثبت شدند.`);
    } catch {
      setMessage("Import کامل نشد؛ اتصال API را بررسی و دوباره تلاش کنید.");
    } finally {
      endCatalogPublishBatch();
    }
  }

  return <main>
    <Link className="back-button" href="/admin">→ بازگشت به پنل مدیریت</Link>
    <header className="page-heading"><div><span className="eyebrow">Medication visibility & insurance</span><h1>انتخاب دارو و پوشش بیمه</h1><p>کد، قیمت و پوشش هر بیمه مستقل ثبت می‌شود؛ تمام قیمت‌های نمایشی با واحد تومان هستند.</p></div><div className="page-heading-actions"><Link className="admin-link" href="/admin/data-updates">استخراج و به‌روزرسانی منابع</Link><span className="version-badge">{items.filter((item) => item.showInApp).length} فعال از {items.length || 104}</span></div></header>
    <section className="import-card">
      <div className="import-heading"><div><span className="eyebrow">Excel Import</span><h2>ورود اطلاعات دارویی از فایل استاندارد</h2><p>فایل ابتدا بررسی می‌شود و تا زدن دکمهٔ ثبت، تغییری انجام نمی‌گیرد. ستون بیمهٔ خالی، اطلاعات بیمهٔ قبلی را دست‌نخورده نگه می‌دارد.</p></div><a className="secondary import-template-link" download="glymize-medication-import-template.xlsx" href={withBasePath("/diayar-medication-import-template.xlsx")}>دانلود قالب خالی</a></div>
      <div className="import-controls">
        <label className="file-picker"><span>انتخاب فایل Excel</span><input accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepareImport(file); }} type="file" /></label>
        <label className="compact-check"><input checked={syncVisibility} onChange={(event) => setSyncVisibility(event.target.checked)} type="checkbox" /><span>فقط ژنریک‌های موجود در فایل نمایش داده شوند</span></label>
        <label className="compact-check"><input checked={replaceBrands} onChange={(event) => setReplaceBrands(event.target.checked)} type="checkbox" /><span>فهرست برندهای ژنریک‌های فایل جایگزین برندهای فعلی شود</span></label>
      </div>
      {importPreview && <div className={importPreview.errors.length ? "import-preview has-errors" : "import-preview"}>
        <div className="import-summary"><span><b>{importPreview.matchedGenericNames.length}</b> ژنریک تطبیق‌یافته</span><span><b>{importPreview.matchedPresentationIds.length}</b> فرآوردهٔ کاتالوگ</span><span><b>{importPreview.brandCount}</b> برند</span><span><b>{importPreview.insuranceCount}</b> ردیف بیمه</span></div>
        <p className="muted">فایل: {importFileName}</p>
        {importPreview.unmatchedGenericNames.length > 0 && <div className="import-warning"><strong>نام‌های تطبیق‌نیافته</strong><p>{importPreview.unmatchedGenericNames.join("، ")}</p></div>}
        {importPreview.errors.length > 0 && <div className="import-errors"><strong>خطاهای فایل</strong><ul>{importPreview.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        <button disabled={Boolean(importPreview.errors.length) || !importPreview.matchedPresentationIds.length} onClick={() => void applyImport()} type="button">تأیید و ثبت Import</button>
      </div>}
    </section>
    <div className="catalog-toolbar"><label className="search-field"><span>جست‌وجوی دارو یا دسته</span><input onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً metformin یا insulin" type="search" value={query} /></label><p className="muted" role="status">{message}</p></div>
    <div className="insurance-column-legend"><span>نمایش دارو</span><span>بیمه</span><span>ارگان پوشش‌دهنده</span><span>درصد پوشش</span><span>ثبت</span></div>
    <div className="medication-group-list">{Object.entries(grouped).map(([group, groupItems]) => <section className="medication-group" key={group}><header><div><h2>{group}</h2><span>{groupItems.filter((item) => item.showInApp).length} فعال از {groupItems.length}</span></div></header><div className="medication-checklist">{groupItems.map((item) => {
      const draft = draftFor(item);
      return <article className={item.showInApp ? "medication-admin-row selected" : "medication-admin-row"} id={item.referencePresentationId} key={item.referencePresentationId}>
        <label className="compact-check"><input checked={item.showInApp} onChange={(event) => void setVisibility(item, event.target.checked)} type="checkbox" /><span>نمایش</span></label>
        <div className="medication-copy"><strong>{item.genericName}</strong><small>{item.dosageForm} · {item.strengthPresentation}</small></div>
        <label className="compact-check"><input checked={draft.enabled} onChange={(event) => void setInsuranceEnabled(item, event.target.checked)} type="checkbox" /><span>بیمه</span></label>
        <select disabled={!draft.enabled} onChange={(event) => setDraft(item, { provider: event.target.value as InsuranceProvider })} value={draft.provider}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="coverage-input"><input disabled={!draft.enabled} max="100" min="0" onChange={(event) => setDraft(item, { percent: event.target.value })} placeholder="مثلاً ۷۰" type="number" value={draft.percent} /><span>٪</span></label>
        <button disabled={!draft.enabled} onClick={() => void registerInsurance(item)} type="button">ثبت</button>
        <div className="coverage-metadata-editor">
          <label>کد ژنریک همین بیمه<input disabled={!draft.enabled} onChange={(event) => setDraft(item, { genericCode: event.target.value })} placeholder="کد اختصاصی بیمه" value={draft.genericCode} /></label>
          <label>سهم سازمان ـ تومان<input disabled={!draft.enabled} min="0" onChange={(event) => setDraft(item, { insurerShareToman: event.target.value })} type="number" value={draft.insurerShareToman} /></label>
          <label>سهم بیمار ـ تومان<input disabled={!draft.enabled} min="0" onChange={(event) => setDraft(item, { patientShareToman: event.target.value })} type="number" value={draft.patientShareToman} /></label>
          <label>تعرفه مرجع ـ تومان<input disabled={!draft.enabled} min="0" onChange={(event) => setDraft(item, { referencePriceToman: event.target.value })} type="number" value={draft.referencePriceToman} /></label>
        </div>
        {item.insuranceCoverages.length > 0 && <div className="registered-coverages">{item.insuranceCoverages.map((entry) => <span key={`${entry.provider}:${entry.genericCode ?? ""}`}>{providerLabels[entry.provider]}: <b>{entry.percent}٪</b>{entry.genericCode && <> · کد <code>{entry.genericCode}</code></>}{entry.manualOverrideNeedsReview && <em>نیازمند بازبینی</em>}</span>)}</div>}
        <div className="medication-market-editor">
          <label>حالت نمایش<select onChange={(event) => void updateMarketData(item, { displayMode: event.target.value as MedicationDisplayMode })} value={item.displayMode ?? "generic_or_primary_brand"}><option value="generic_or_primary_brand">ژنریک یا یک برند منتخب</option><option value="generic_with_selected_brands">ژنریک با برندهای منتخب</option></select></label>
          <label>کد ژنریک رجیستری<input defaultValue={item.genericRegistryCode ?? ""} onBlur={(event) => void updateMarketData(item, { genericRegistryCode: event.target.value.trim() || undefined })} placeholder="کد مرجع NFI" /></label>
          <label>قیمت مصرف‌کننده<input defaultValue={item.price?.manualOverrideToman ?? ""} min="0" onBlur={(event) => { const amount = Number(event.target.value); if (Number.isFinite(amount) && amount >= 0) void updateMarketData(item, { price: { ...(item.price ?? { amountToman: amount, priceKind: "consumer_retail" }), manualOverrideToman: amount, manualOverrideUpdatedAt: new Date().toISOString(), manualOverrideNeedsReview: false } }); }} placeholder={item.price ? `منبع: ${item.price.amountToman.toLocaleString("fa-IR")}` : "قیمت دستی"} type="number" /><span>تومان</span></label>
          <fieldset><legend>حوزه‌های نمایش همراه</legend>{(["diabetes", "cardiovascular", "kidney", "liver", "obesity"] as MedicationClinicalDomain[]).map((domain) => <label className="compact-check" key={domain}><input checked={(item.clinicalDomains ?? ["diabetes"]).includes(domain)} onChange={(event) => void setClinicalDomain(item, domain, event.target.checked)} type="checkbox" /><span>{{ diabetes: "دیابت", cardiovascular: "قلب", kidney: "کلیه", liver: "کبد", obesity: "چاقی" }[domain]}</span></label>)}</fieldset>
        </div>
        <div className="brand-manager">
          <button className="add-brand-button secondary" onClick={() => void addBrand(item)} type="button">+ برند دارو</button>
          {[...item.brands].sort((left, right) => left.priority - right.priority).map((brand, index) => {
            const insuranceDraft = brandDraft(brand.id);
            return <section className={brand.hiddenFromSource ? "brand-branch hidden-source-brand" : "brand-branch"} key={brand.id}>
              <div className="brand-branch-main">
                <span className="brand-order-badge" aria-label={`برند شماره ${index + 1}`}>{index + 1}-</span>
                <label className="brand-name-field"><span>نام برند</span><input onBlur={(event) => void updateBrand(item, brand, { name: event.target.value })} defaultValue={brand.name} placeholder="برند" type="text" /></label>
                <label className="compact-check"><input checked={brand.showInsteadOfGeneric && !brand.hiddenFromSource} onChange={(event) => void updateBrand(item, brand, { showInsteadOfGeneric: event.target.checked, hiddenFromSource: false })} type="checkbox" /><span>نمایش این برند</span></label>
                <label className="compact-check"><input checked={brand.customInsurance} onChange={(event) => void updateBrand(item, brand, { customInsurance: event.target.checked })} type="checkbox" /><span>شرایط بیمه متفاوت</span></label>
                {brand.sourceDiscovered && <span className="source-discovered-badge">استخراج‌شده از منبع</span>}
                <div className="brand-order-actions"><button aria-label="انتقال برند به بالا" className="secondary" disabled={index === 0} onClick={() => void moveBrand(item, brand, -1)} type="button">↑</button><button aria-label="انتقال برند به پایین" className="secondary" disabled={index === item.brands.length - 1} onClick={() => void moveBrand(item, brand, 1)} type="button">↓</button><button className="danger-button" onClick={() => void (brand.sourceDiscovered ? updateBrand(item, brand, { hiddenFromSource: true, showInsteadOfGeneric: false }) : remove(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/brands/${brand.id}`))} type="button">{brand.sourceDiscovered ? "حذف از نمایش" : "حذف"}</button></div>
              </div>
              <div className="brand-market-editor"><label>کد ژنریک رجیستری<input defaultValue={brand.genericRegistryCode ?? ""} onBlur={(event) => void updateBrand(item, brand, { genericRegistryCode: event.target.value.trim() || undefined })} /></label><label>کد برند رجیستری<input defaultValue={brand.brandRegistryCode ?? ""} onBlur={(event) => void updateBrand(item, brand, { brandRegistryCode: event.target.value.trim() || undefined })} /></label><label>قیمت برند<input defaultValue={brand.price?.manualOverrideToman ?? ""} min="0" onBlur={(event) => { const amount = Number(event.target.value); if (Number.isFinite(amount) && amount >= 0) void updateBrand(item, brand, { price: { ...(brand.price ?? { amountToman: amount, priceKind: "consumer_retail" }), manualOverrideToman: amount, manualOverrideUpdatedAt: new Date().toISOString(), manualOverrideNeedsReview: false } }); }} placeholder={brand.price ? `منبع: ${brand.price.amountToman.toLocaleString("fa-IR")}` : "قیمت دستی"} type="number" /><span>تومان</span></label></div>
              {!brand.customInsurance && <p className="inherited-insurance">شرایط بیمه از داروی ژنریک به ارث می‌رسد.</p>}
              {brand.customInsurance && <div className="brand-insurance-editor"><select onChange={(event) => setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...insuranceDraft, provider: event.target.value as InsuranceProvider } }))} value={insuranceDraft.provider}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="coverage-input"><input max="100" min="0" onChange={(event) => setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...insuranceDraft, percent: event.target.value } }))} placeholder="درصد پوشش" type="number" value={insuranceDraft.percent} /><span>٪</span></label><label>کد ژنریک بیمه<input onChange={(event) => setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...insuranceDraft, genericCode: event.target.value } }))} value={insuranceDraft.genericCode} /></label><label>کد برند بیمه<input onChange={(event) => setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...insuranceDraft, brandCode: event.target.value } }))} value={insuranceDraft.brandCode} /></label><label>سهم سازمان ـ تومان<input min="0" onChange={(event) => setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...insuranceDraft, insurerShareToman: event.target.value } }))} type="number" value={insuranceDraft.insurerShareToman} /></label><label>سهم بیمار ـ تومان<input min="0" onChange={(event) => setBrandInsuranceDrafts((current) => ({ ...current, [brand.id]: { ...insuranceDraft, patientShareToman: event.target.value } }))} type="number" value={insuranceDraft.patientShareToman} /></label><button onClick={() => void registerBrandInsurance(item, brand)} type="button">ثبت بیمه برند</button><div className="registered-coverages">{brand.insuranceCoverages.map((entry) => <span key={`${entry.provider}:${entry.brandCode ?? ""}`}>{providerLabels[entry.provider]}: <b>{entry.percent}٪</b>{entry.genericCode && <> · ژنریک <code>{entry.genericCode}</code></>}{entry.brandCode && <> · برند <code>{entry.brandCode}</code></>}</span>)}</div></div>}
            </section>;
          })}
        </div>
      </article>;
    })}</div></section>)}</div>
  </main>;
}
