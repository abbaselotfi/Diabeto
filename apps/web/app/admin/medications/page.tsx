"use client";

import Link from "next/link";
import type { InsuranceProvider, MedicationChecklistItem } from "@diabeto/contracts";
import { useEffect, useMemo, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const providerLabels: Record<InsuranceProvider, string> = {
  social_security: "بیمه تأمین اجتماعی",
  health_insurance: "بیمه سلامت",
  armed_forces: "بیمه نیروهای مسلح",
  other_organizations: "سایر ارگان‌ها (بانک، شرکت نفت و…)",
  supplementary: "بیمه تکمیلی"
};
interface Draft { enabled: boolean; provider: InsuranceProvider; percent: string; }

export default function MedicationSelectionPage() {
  const [items, setItems] = useState<MedicationChecklistItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("در حال بارگذاری کاتالوگ…");

  async function refresh() {
    const response = await fetch(`${apiUrl}/v1/admin/catalog/medication-checklist`);
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
    return drafts[item.referencePresentationId] ?? { enabled: item.insuranceCoverages.length > 0, provider: "social_security", percent: "" };
  }
  function setDraft(item: MedicationChecklistItem, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [item.referencePresentationId]: { ...draftFor(item), ...patch } }));
  }
  async function patch(path: string, body: object) {
    const response = await fetch(`${apiUrl}${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("failed");
    const updated = await response.json() as MedicationChecklistItem;
    setItems((current) => current.map((item) => item.referencePresentationId === updated.referencePresentationId ? updated : item));
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
      await patch(`/v1/admin/catalog/medication-checklist/${item.referencePresentationId}/insurance`, { enabled: true, provider: draft.provider, percent });
      setDraft(item, { percent: "" });
      setMessage(`پوشش ${providerLabels[draft.provider]} ثبت شد.`);
    } catch { setMessage("پوشش بیمه ثبت نشد."); }
  }

  return <main>
    <Link className="back-button" href="/admin">→ بازگشت به پنل مدیریت</Link>
    <header className="page-heading"><div><span className="eyebrow">Medication visibility & insurance</span><h1>انتخاب دارو و پوشش بیمه</h1><p>برای هر دارو چند سازمان بیمه و درصد متفاوت قابل ثبت است.</p></div><span className="version-badge">{items.filter((item) => item.showInApp).length} فعال از {items.length || 104}</span></header>
    <div className="catalog-toolbar"><label className="search-field"><span>جست‌وجوی دارو یا دسته</span><input onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً metformin یا insulin" type="search" value={query} /></label><p className="muted" role="status">{message}</p></div>
    <div className="insurance-column-legend"><span>نمایش دارو</span><span>بیمه</span><span>ارگان پوشش‌دهنده</span><span>درصد پوشش</span><span>ثبت</span></div>
    <div className="medication-group-list">{Object.entries(grouped).map(([group, groupItems]) => <section className="medication-group" key={group}><header><div><h2>{group}</h2><span>{groupItems.filter((item) => item.showInApp).length} فعال از {groupItems.length}</span></div></header><div className="medication-checklist">{groupItems.map((item) => {
      const draft = draftFor(item);
      return <article className={item.showInApp ? "medication-admin-row selected" : "medication-admin-row"} key={item.referencePresentationId}>
        <label className="compact-check"><input checked={item.showInApp} onChange={(event) => void setVisibility(item, event.target.checked)} type="checkbox" /><span>نمایش</span></label>
        <div className="medication-copy"><strong>{item.genericName}</strong><small>{item.dosageForm} · {item.strengthPresentation}</small></div>
        <label className="compact-check"><input checked={draft.enabled} onChange={(event) => void setInsuranceEnabled(item, event.target.checked)} type="checkbox" /><span>بیمه</span></label>
        <select disabled={!draft.enabled} onChange={(event) => setDraft(item, { provider: event.target.value as InsuranceProvider })} value={draft.provider}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="coverage-input"><input disabled={!draft.enabled} max="100" min="0" onChange={(event) => setDraft(item, { percent: event.target.value })} placeholder="مثلاً ۷۰" type="number" value={draft.percent} /><span>٪</span></label>
        <button disabled={!draft.enabled} onClick={() => void registerInsurance(item)} type="button">ثبت</button>
        {item.insuranceCoverages.length > 0 && <div className="registered-coverages">{item.insuranceCoverages.map((entry) => <span key={entry.provider}>{providerLabels[entry.provider]}: <b>{entry.percent}٪</b></span>)}</div>}
      </article>;
    })}</div></section>)}</div>
  </main>;
}
