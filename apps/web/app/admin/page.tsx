"use client";

import type { ClinicalProtocolBundle, GenericMedication, MedicationTherapyGroup } from "@diabeto/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

  async function refresh() {
    try {
      const [genericResponse, protocolResponse] = await Promise.all([
        fetch(`${apiUrl}/v1/catalog/generics`),
        fetch(`${apiUrl}/v1/protocols/type-2`)
      ]);
      if (!genericResponse.ok || !protocolResponse.ok) throw new Error("API unavailable");
      setGenerics(await genericResponse.json() as GenericMedication[]);
      setProtocols(await protocolResponse.json() as ClinicalProtocolBundle[]);
      setMessage("کاتالوگ اولیه و وضعیت پروتکل‌ها بارگذاری شد.");
    } catch {
      setMessage("API محلی در دسترس نیست. ابتدا pnpm dev را اجرا کنید؛ سپس این صفحه را refresh کنید.");
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
    const response = await fetch(`${apiUrl}/v1/admin/catalog/imports`, {
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
    const response = await fetch(`${apiUrl}/v1/admin/catalog/generics`, {
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

  return (
    <main className="shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">پنل مدیریت / فقط پزشکان و ادمین‌های تأییدشده</p>
          <h1>کاتالوگ نوع ۲، پروتکل‌ها و نمایش دارو</h1>
        </div>
        <button className="secondary" onClick={() => void refresh()} type="button">بازخوانی</button>
      </header>

      <section className="metric-grid" aria-label="شاخص‌های استفاده">
        <article><span>ژنریک‌های آمادهٔ بازبینی</span><strong>{generics.length || "—"}</strong><small>seed راهنما + ورود دستی ادمین</small></article>
        <article><span>پروتکل‌های Type 2</span><strong>{protocols.length || "—"}</strong><small>تا تأیید پزشک، خروجی درمانی ندارند</small></article>
        <article><span>ارزیابی تکمیل‌شده</span><strong>—</strong><small>پس از فعال‌شدن احراز هویت و analytics تجمیعی</small></article>
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
    </main>
  );
}
