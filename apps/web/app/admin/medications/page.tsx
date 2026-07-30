"use client";

import Link from "next/link";
import type { MedicationChecklistItem } from "@diabeto/contracts";
import { useEffect, useMemo, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function MedicationSelectionPage() {
  const [items, setItems] = useState<MedicationChecklistItem[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("در حال بارگذاری ۱۰۴ فرآورده…");

  useEffect(() => {
    fetch(`${apiUrl}/v1/admin/catalog/medication-checklist`)
      .then((response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<MedicationChecklistItem[]>;
      })
      .then((data) => {
        setItems(data);
        setMessage(`${data.length} فرآورده آمادهٔ انتخاب است.`);
      })
      .catch(() => setMessage("API در دسترس نیست؛ سرویس را اجرا و صفحه را بازخوانی کنید."));
  }, []);

  const grouped = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visible = normalizedQuery
      ? items.filter((item) => `${item.genericName} ${item.therapeuticClass} ${item.dosageForm}`.toLocaleLowerCase().includes(normalizedQuery))
      : items;
    return visible.reduce<Record<string, MedicationChecklistItem[]>>((groups, item) => {
      (groups[item.therapeuticClass] ??= []).push(item);
      return groups;
    }, {});
  }, [items, query]);

  async function setVisibility(item: MedicationChecklistItem, showInApp: boolean) {
    const previous = items;
    setItems((current) => current.map((entry) => entry.referencePresentationId === item.referencePresentationId ? { ...entry, showInApp } : entry));
    try {
      const response = await fetch(`${apiUrl}/v1/admin/catalog/medication-checklist/${item.referencePresentationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ showInApp })
      });
      if (!response.ok) throw new Error("failed");
      setMessage(`«${item.genericName}» برای Type 2، بارداری و سایر مسیرها ${showInApp ? "فعال" : "غیرفعال"} شد.`);
    } catch {
      setItems(previous);
      setMessage("تغییر ذخیره نشد؛ اتصال API را بررسی کنید.");
    }
  }

  async function setGroupVisibility(groupItems: MedicationChecklistItem[], showInApp: boolean) {
    await Promise.all(groupItems.map((item) => setVisibility(item, showInApp)));
  }

  return (
    <main>
      <Link className="back-button" href="/admin">→ بازگشت به پنل مدیریت</Link>
      <header className="page-heading">
        <div><span className="eyebrow">Medication visibility</span><h1>انتخاب داروهای برنامه</h1><p>هر تیک به‌صورت سراسری در Type 2، بارداری و مسیرهای دیگر اعمال می‌شود.</p></div>
        <span className="version-badge">{items.filter((item) => item.showInApp).length} فعال از {items.length || 104}</span>
      </header>

      <div className="catalog-toolbar">
        <label className="search-field"><span>جست‌وجوی دارو یا دسته</span><input onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً metformin یا insulin" type="search" value={query} /></label>
        <p className="muted" role="status">{message}</p>
      </div>

      <div className="medication-group-list">
        {Object.entries(grouped).map(([group, groupItems]) => (
          <section className="medication-group" key={group}>
            <header>
              <div><h2>{group}</h2><span>{groupItems.filter((item) => item.showInApp).length} فعال از {groupItems.length}</span></div>
              <div className="group-actions">
                <button onClick={() => void setGroupVisibility(groupItems, true)} type="button">انتخاب همه</button>
                <button className="secondary" onClick={() => void setGroupVisibility(groupItems, false)} type="button">لغو همه</button>
              </div>
            </header>
            <div className="medication-checklist">
              {groupItems.map((item) => (
                <label className={item.showInApp ? "medication-row selected" : "medication-row"} key={item.referencePresentationId}>
                  <input checked={item.showInApp} onChange={(event) => void setVisibility(item, event.target.checked)} type="checkbox" />
                  <span className="medication-copy">
                    <strong>{item.genericName}</strong>
                    <small>{item.dosageForm} · {item.strengthPresentation}</small>
                  </span>
                  <span className="route-chip">{item.administrationRoute}</span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
