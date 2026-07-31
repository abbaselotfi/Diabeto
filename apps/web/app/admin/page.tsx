"use client";

import Link from "next/link";
import type { ClinicalProtocolBundle, GenericMedication, GuidelineSource, MedicationChecklistItem, MedicationTherapyGroup, ReferenceCatalogSource } from "@glymize/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api-client";

const groupLabels: Record<MedicationTherapyGroup, string> = {
  oral_glucose_lowering: "داروهای خوراکی",
  glp_1_receptor_agonist: "GLP-1 RA",
  dual_gip_glp_1_receptor_agonist: "GLP-1/GIP",
  human_insulin: "انسولین انسانی",
  basal_insulin_analog: "انسولین پایه (بازال)",
  prandial_insulin_analog: "انسولین پراندیال",
  premixed_insulin: "انسولین میکس",
  fixed_ratio_combination: "ترکیب ثابت انسولین/GLP-1"
};

export default function AdminPage() {
  const [message, setMessage] = useState("در حال دریافت کاتالوگ و وضعیت پروتکل‌ها…");
  const [displayMode, setDisplayMode] = useState<"generic_first" | "brand_first">("generic_first");
  const [generics, setGenerics] = useState<GenericMedication[]>([]);
  const [protocols, setProtocols] = useState<ClinicalProtocolBundle[]>([]);
  const [guidelines, setGuidelines] = useState<GuidelineSource[]>([]);
  const [medicationChecklist, setMedicationChecklist] = useState<MedicationChecklistItem[]>([]);
  const [referenceSources, setReferenceSources] = useState<ReferenceCatalogSource[]>([]);
  const [guidelineMessage, setGuidelineMessage] = useState("هنوز بررسی جدیدی درخواست نشده است.");

  async function refresh() {
    try {
      const [genericResponse, protocolResponse, guidelineResponse, checklistResponse, sourceResponse] = await Promise.all([
        apiFetch("/v1/catalog/generics"),
        apiFetch("/v1/protocols/type-2"),
        apiFetch("/v1/admin/guidelines"),
        apiFetch("/v1/admin/catalog/medication-checklist"),
        apiFetch("/v1/admin/catalog/reference-sources")
      ]);
      if (!genericResponse.ok || !protocolResponse.ok || !guidelineResponse.ok || !checklistResponse.ok || !sourceResponse.ok) throw new Error("API unavailable");
      setGenerics(await genericResponse.json() as GenericMedication[]);
      setProtocols(await protocolResponse.json() as ClinicalProtocolBundle[]);
      setGuidelines(await guidelineResponse.json() as GuidelineSource[]);
      setMedicationChecklist(await checklistResponse.json() as MedicationChecklistItem[]);
      setReferenceSources(await sourceResponse.json() as ReferenceCatalogSource[]);
      setMessage("کاتالوگ اولیه، منبع جهانی و وضعیت پروتکل‌ها بارگذاری شد.");
    } catch {
      setMessage("داده‌های کاتالوگ خوانده نشد؛ صفحه را بازخوانی کنید.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  const groupedGenerics = useMemo(() => generics.reduce<Record<string, GenericMedication[]>>((groups, medication) => {
    const key = medication.therapyGroup ?? "oral_glucose_lowering";
    (groups[key] ??= []).push(medication);
    return groups;
  }, {}), [generics]);

  async function requestCatalogUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
    const response = await apiFetch("/v1/admin/catalog/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceKind: sourceUrl ? "approved_export" : "manual_csv", sourceUrl: sourceUrl || undefined, requestedBy: "admin-demo" })
    });
    const result = (await response.json()) as { message: string };
    setMessage(result.message);
  }

  async function addGeneric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await apiFetch("/v1/admin/catalog/generics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        canonicalName: String(form.get("canonicalName") ?? ""),
        persianName: String(form.get("persianName") ?? ""),
        className: String(form.get("className") ?? ""),
        therapyGroup: String(form.get("therapyGroup") ?? "oral_glucose_lowering"),
        administrationRoute: String(form.get("administrationRoute") ?? "oral"),
        sourceUrl: String(form.get("sourceUrl") ?? ""),
        sourceReference: String(form.get("sourceReference") ?? "ورود دستی ادمین")
      })
    });
    if (!response.ok) {
      setMessage("ثبت ژنریک ناموفق بود؛ تمام فیلدهای الزامی را بررسی کنید.");
      return;
    }
    const created = await response.json() as GenericMedication;
    setGenerics((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
    event.currentTarget.reset();
    setMessage(`ژنریک «${created.persianName}» در حالت بازبینی ادمین اضافه شد.`);
  }

  async function checkGuideline(sourceId: string) {
    try {
      const response = await apiFetch(`/v1/admin/guidelines/${sourceId}/check`, { method: "POST" });
      const result = await response.json() as { message: string };
      if (!response.ok) throw new Error(result.message);
      setGuidelineMessage(result.message);
      await refresh();
    } catch {
      setGuidelineMessage("بررسی guideline انجام نشد؛ صفحه را بازخوانی و دوباره تلاش کنید.");
    }
  }

  async function updateMedicationVisibility(item: MedicationChecklistItem, showInApp: boolean) {
    const previous = medicationChecklist;
    setMedicationChecklist((current) => current.map((entry) => entry.referencePresentationId === item.referencePresentationId ? { ...entry, showInApp } : entry));
    try {
      const response = await apiFetch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ showInApp })
      });
      if (!response.ok) throw new Error("update failed");
      const updated = await response.json() as MedicationChecklistItem;
      setMedicationChecklist((current) => current.map((entry) => entry.referencePresentationId === updated.referencePresentationId ? updated : entry));
      setMessage(`نمایش «${item.genericName}» ${showInApp ? "فعال" : "غیرفعال"} شد.`);
    } catch {
      setMedicationChecklist(previous);
      setMessage("تغییر چک‌لیست ذخیره نشد؛ دوباره تلاش کنید.");
    }
  }

  return (
    <main className="shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">پنل مدیریت / دسترسی مستقیم</p>
          <h1>کاتالوگ نوع ۲، پروتکل‌ها و نمایش دارو</h1>
        </div>
        <div className="topbar-actions">
          <Link className="admin-link" href="/admin/medications">انتخاب داروهای قابل نمایش</Link>
          <Link className="admin-link" href="/type-2/preview">پیش‌نمایش کامل Type 2</Link>
          <button className="secondary" onClick={() => void refresh()} type="button">بازخوانی</button>
        </div>
      </header>

      <section className="metric-grid" aria-label="شاخص‌های استفاده">
        <article><span>ژنریک‌های آمادهٔ بازبینی</span><strong>{generics.length || "—"}</strong><small>seed راهنما + ورود دستی ادمین</small></article>
        <article><span>فرآورده‌های فعال در چک‌لیست</span><strong>{medicationChecklist.filter((item) => item.showInApp).length || "—"}</strong><small>نمایش/عدم‌نمایش فقط با انتخاب Admin</small></article>
        <article><span>پروتکل‌های Type 2</span><strong>{protocols.length || "—"}</strong><small>در نسخهٔ وب فعلی قابل مشاهده‌اند</small></article>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <p className="eyebrow">نمایش دارو</p>
          <h2>ژنریک، پیش‌فرض ثابت</h2>
          <p>منطق بالینی همیشه با ژنریک اجرا می‌شود؛ برند فقط در خروجی نمایش تغییر می‌کند.</p>
          <label className="radio"><input checked={displayMode === "generic_first"} name="display" onChange={() => setDisplayMode("generic_first")} type="radio" /> نمایش ژنریک در اولویت</label>
          <label className="radio"><input checked={displayMode === "brand_first"} name="display" onChange={() => setDisplayMode("brand_first")} type="radio" /> نمایش برند تأییدشده در اولویت</label>
          <p className="muted">حالت فعلی: {displayMode === "generic_first" ? "فقط ژنریک" : "برندِ اولویت‌دار پس از تأیید"}</p>
        </section>

        <section className="panel">
          <p className="eyebrow">به‌روزرسانی بازار ایران</p>
          <h2>ورود برندها</h2>
          <form onSubmit={requestCatalogUpdate}>
            <label htmlFor="catalogSourceUrl">نشانی API یا export مجاز</label>
            <input id="catalogSourceUrl" name="sourceUrl" placeholder="https://…" type="url" />
            <button type="submit">بازخوانی و ورود به صف</button>
          </form>
        </section>
      </div>

      <section className="panel">
        <p className="eyebrow">افزودن ژنریک</p>
        <h2>ورود دستی با منبع</h2>
        <form onSubmit={addGeneric}>
          <div className="form-grid">
            <label>نام انگلیسی<input name="canonicalName" required /></label>
            <label>نام فارسی<input name="persianName" required /></label>
            <label>کلاس دارویی<input name="className" required /></label>
            <label>دسته<input defaultValue="oral_glucose_lowering" name="therapyGroup" required list="therapy-groups" /></label>
            <label>راه مصرف<select defaultValue="oral" name="administrationRoute"><option value="oral">خوراکی</option><option value="subcutaneous">زیرجلدی</option></select></label>
            <label>مرجع/نشانی<input name="sourceUrl" required type="url" placeholder="https://…" /></label>
          </div>
          <input name="sourceReference" type="hidden" value="ورود دستی ادمین" readOnly />
          <datalist id="therapy-groups">{Object.keys(groupLabels).map((key) => <option key={key} value={key} />)}</datalist>
          <button type="submit">افزودن به کاتالوگ بازبینی</button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">چک‌لیست داروها</p>
        <h2>کنترل نمایش فرآورده‌ها در برنامه</h2>
        <Link className="admin-link" href="/admin/medications">باز کردن صفحهٔ کامل انتخاب داروها</Link>
        <p className="muted">این داده‌ها از فایل ارسالی شما وارد شده‌اند. تیک‌زدن فقط نمایش کاتالوگ را کنترل می‌کند و به‌تنهایی ثبت، عرضه یا تأیید بالینی/بازاری ایران محسوب نمی‌شود. برای نمایش برند در خروجی پزشک، رکورد بازار ایران و بازبینی جداگانه لازم است.</p>
        <div className="reference-source-list">
          {referenceSources.map((source) => <a href={source.sourceUrl} key={source.id} rel="noreferrer" target="_blank">{source.title}</a>)}
        </div>
        <div className="reference-table-wrap">
          <table className="reference-table">
            <thead><tr><th>نمایش</th><th>ژنریک</th><th>کلاس</th><th>راه/شکل</th><th>قدرت یا عرضه</th><th>وضعیت بازبینی</th></tr></thead>
            <tbody>{medicationChecklist.map((item) => <tr key={item.referencePresentationId}>
              <td><input aria-label={`نمایش ${item.genericName}`} checked={item.showInApp} onChange={(event) => void updateMedicationVisibility(item, event.target.checked)} type="checkbox" /></td>
              <td><a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.genericName}</a></td>
              <td>{item.therapeuticClass}</td>
              <td>{item.administrationRoute} / {item.dosageForm}</td>
              <td>{item.strengthPresentation}</td>
              <td>{item.reviewState === "needs_iran_validation" ? "نیازمند اعتبارسنجی ایران" : item.reviewState}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">کاتالوگ راهنما</p>
        <h2>ژنریک‌های Type 2 و انسولین</h2>
        <div className="catalog-grid">
          {Object.entries(groupedGenerics).map(([group, medicines]) => (
            <article className="catalog-group" key={group}>
              <h3>{groupLabels[group as MedicationTherapyGroup] ?? group}</h3>
              <p>{medicines.map((medication) => medication.persianName).join("، ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">حاکمیت بالینی</p>
        <h2>وضعیت نسخه‌های پروتکل Type 2</h2>
        <div className="protocol-list">
          {protocols.map((protocol) => <article className="protocol-card" key={protocol.id}><strong>{protocol.title}</strong><span className="badge">{protocol.status === "draft" ? "در انتظار تأیید پزشک" : protocol.status}</span><small>{protocol.sourceReference}</small></article>)}
        </div>
        <p className="muted">{message}</p>
      </section>

      <section className="panel">
        <p className="eyebrow">به‌روزرسانی guideline</p>
        <h2>بررسی نسخهٔ جدید ADA و EASD</h2>
        <p className="muted">این دکمه فقط بررسی و ایجاد صف بازبینی را انجام می‌دهد؛ هیچ قاعده یا توصیه‌ای خودکار تغییر نمی‌کند.</p>
        <div className="protocol-list">
          {guidelines.map((guideline) => (
            <article className="protocol-card" key={guideline.id}>
              <strong>{guideline.publisher} — {guideline.title}</strong>
              <small>نسخهٔ فعال: {guideline.activeVersion}</small>
              <a href={guideline.sourceUrl} rel="noreferrer" target="_blank">مشاهدهٔ منبع رسمی</a>
              <button onClick={() => void checkGuideline(guideline.id)} type="button">بررسی به‌روزرسانی</button>
            </article>
          ))}
        </div>
        <p className="muted">{guidelineMessage}</p>
      </section>
    </main>
  );
}
