"use client";

import Link from "next/link";
import type { ClinicalProtocolBundle, GuidelineSource, MedicationChecklistItem, ReferenceCatalogSource, Type2MedicationConsideration } from "@diabeto/contracts";
import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function PreviewPage() {
  const [protocols, setProtocols] = useState<ClinicalProtocolBundle[]>([]);
  const [guidelines, setGuidelines] = useState<GuidelineSource[]>([]);
  const [checklist, setChecklist] = useState<MedicationChecklistItem[]>([]);
  const [sources, setSources] = useState<ReferenceCatalogSource[]>([]);
  const [considerations, setConsiderations] = useState<Type2MedicationConsideration[]>([]);
  const [message, setMessage] = useState("در حال بارگذاری پیش‌نمایش کامل…");

  useEffect(() => {
    async function loadPreview() {
      try {
        const [protocolResponse, guidelineResponse, checklistResponse, sourceResponse, considerationResponse] = await Promise.all([
          fetch(`${apiUrl}/v1/protocols/type-2`),
          fetch(`${apiUrl}/v1/admin/guidelines`),
          fetch(`${apiUrl}/v1/admin/catalog/medication-checklist`),
          fetch(`${apiUrl}/v1/admin/catalog/reference-sources`),
          fetch(`${apiUrl}/v1/admin/preview/type-2-considerations`)
        ]);
        if (![protocolResponse, guidelineResponse, checklistResponse, sourceResponse, considerationResponse].every((response) => response.ok)) throw new Error("API unavailable");
        setProtocols(await protocolResponse.json() as ClinicalProtocolBundle[]);
        setGuidelines(await guidelineResponse.json() as GuidelineSource[]);
        setChecklist(await checklistResponse.json() as MedicationChecklistItem[]);
        setSources(await sourceResponse.json() as ReferenceCatalogSource[]);
        setConsiderations(await considerationResponse.json() as Type2MedicationConsideration[]);
        setMessage("همهٔ موارد پیش‌نویس برای بازبینی Admin و پزشک نمایش داده می‌شوند.");
      } catch {
        setMessage("پیش‌نمایش نیازمند اجرای API محلی و دسترسی Admin است.");
      }
    }
    void loadPreview();
  }, []);

  return (
    <main className="shell preview-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin preview / فقط مشاهده</p>
          <h1>پیش‌نمایش کامل پروتکل‌ها و موارد نیازمند تأیید</h1>
          <p className="muted">همهٔ داده‌های Draft اینجا دیده می‌شوند، حتی اگر در چک‌لیست برنامه غیرفعال باشند. این صفحه خروجی بالینی، نسخه یا دوز تولید نمی‌کند.</p>
        </div>
        <Link className="admin-link" href="/admin">بازگشت به پنل مدیریت</Link>
      </header>

      <section className="preview-notice"><strong>وضعیت:</strong> پیش‌نمایش غیرقابل‌استفاده برای درمان تا زمان تأیید بالینی. {message}</section>

      <section className="panel">
        <p className="eyebrow">پروتکل‌ها</p>
        <h2>تمام bundleهای Type 2</h2>
        <div className="protocol-list">
          {protocols.map((protocol) => <article className="protocol-card" key={protocol.id}>
            <strong>{protocol.title}</strong><span className="badge">{protocol.status}</span>
            <small>{protocol.sourceReference}</small><a href={protocol.sourceUrl} rel="noreferrer" target="_blank">منبع پروتکل</a>
          </article>)}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">منابع و نسخه‌ها</p>
        <h2>گایدلاین‌های پایش‌شده</h2>
        <div className="protocol-list">
          {guidelines.map((guideline) => <article className="protocol-card" key={guideline.id}>
            <strong>{guideline.publisher} — {guideline.title}</strong><small>نسخهٔ فعال: {guideline.activeVersion}</small>
            <a href={guideline.sourceUrl} rel="noreferrer" target="_blank">مشاهدهٔ منبع رسمی</a>
          </article>)}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">کاتالوگ و نمایش</p>
        <h2>تمام فرآورده‌های واردشده</h2>
        <p className="muted">{checklist.length} ارائهٔ دارویی ثبت شده است؛ {checklist.filter((item) => item.showInApp).length} مورد در چک‌لیست نمایش برنامه فعال‌اند. وضعیت‌های بازار ایران در این صفحه صرفاً برای مرور هستند.</p>
        <div className="reference-table-wrap">
          <table className="reference-table">
            <thead><tr><th>ژنریک</th><th>کلاس</th><th>شکل/قدرت</th><th>نمایش</th><th>بازبینی</th></tr></thead>
            <tbody>{checklist.map((item) => <tr key={item.referencePresentationId}>
              <td><a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.genericName}</a></td><td>{item.therapeuticClass}</td>
              <td>{item.dosageForm} / {item.strengthPresentation}</td><td>{item.showInApp ? "فعال" : "غیرفعال"}</td>
              <td>{item.reviewState === "needs_iran_validation" ? "نیازمند اعتبارسنجی ایران" : item.reviewState}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="reference-source-list">{sources.map((source) => <a href={source.sourceUrl} key={source.id} rel="noreferrer" target="_blank">{source.title}</a>)}</div>
      </section>

      <section className="panel">
        <p className="eyebrow">ملاحظات Type 2</p>
        <h2>پیش‌نمایش همهٔ کلاس‌ها و ژنریک‌های پروتکل</h2>
        <p className="muted">این بخش همهٔ ملاحظات را بدون اعمال فیلتر چک‌لیست نمایش می‌دهد؛ برای فعال‌شدن در کاربرد واقعی، هم چک‌لیست و هم پروتکل تأییدشده لازم است.</p>
        <div className="consideration-grid">
          {considerations.map((item) => <article className="consideration-card" key={item.genericMedicationId}>
            <h3>{item.persianName}</h3><p className="muted">{item.therapeuticClass}</p>
            <ul>{item.considerations.map((note) => <li key={note}>{note}</li>)}</ul>
            {item.cautions.length > 0 && <div className="caution"><strong>احتیاط‌ها</strong><ul>{item.cautions.map((note) => <li key={note}>{note}</li>)}</ul></div>}
            {item.blockedBy && <div className="blocked"><strong>محدودیت</strong><ul>{item.blockedBy.map((note) => <li key={note}>{note}</li>)}</ul></div>}
            <a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.sourceReference}</a>
          </article>)}
        </div>
      </section>
    </main>
  );
}
