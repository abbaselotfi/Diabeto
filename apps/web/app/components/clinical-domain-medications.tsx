"use client";

import type { MedicationChecklistItem, MedicationClinicalDomain } from "@glymize/contracts";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import MedicationMarketDetails from "./medication-market-details";

const domains: Array<{ key: Exclude<MedicationClinicalDomain, "diabetes">; label: string; description: string }> = [
  { key: "cardiovascular", label: "قلب و عروق", description: "داروهای همراه مرتبط با خطر قلبی‌عروقی" },
  { key: "kidney", label: "کلیه", description: "داروهای همراه مرتبط با بیماری مزمن کلیه" },
  { key: "liver", label: "کبد و MASLD", description: "داروهای همراه مرتبط با مدیریت متابولیک کبد" },
  { key: "obesity", label: "چاقی", description: "داروهای همراه مدیریت وزن" }
];

function displays(item: MedicationChecklistItem) {
  const brands = item.brands
    .filter((brand) => brand.showInsteadOfGeneric && !brand.hiddenFromSource && brand.name.trim())
    .sort((left, right) => left.priority - right.priority);
  if (!brands.length || item.displayMode === "generic_with_selected_brands") return [{
    cardId: `${item.referencePresentationId}:generic`,
    name: item.genericName,
    genericName: undefined,
    coverages: item.insuranceCoverages,
    genericRegistryCode: item.genericRegistryCode,
    brandRegistryCode: undefined,
    price: item.price,
    marketBadge: item.marketBadge,
    selectedBrands: item.displayMode === "generic_with_selected_brands"
      ? brands.map((brand) => ({ ...brand, insuranceCoverages: brand.customInsurance ? brand.insuranceCoverages : item.insuranceCoverages }))
      : undefined
  }];
  const brand = brands[0]!;
  return [{
    cardId: `${item.referencePresentationId}:${brand.id}`,
    name: brand.name.trim(),
    genericName: item.genericName,
    coverages: brand.customInsurance ? brand.insuranceCoverages : item.insuranceCoverages,
    genericRegistryCode: brand.genericRegistryCode ?? item.genericRegistryCode,
    brandRegistryCode: brand.brandRegistryCode,
    price: brand.price ?? item.price,
    marketBadge: brand.marketBadge ?? item.marketBadge,
    selectedBrands: undefined
  }];
}

export default function ClinicalDomainMedications() {
  const [items, setItems] = useState<MedicationChecklistItem[]>([]);
  const [selected, setSelected] = useState<Set<Exclude<MedicationClinicalDomain, "diabetes">>>(new Set());

  useEffect(() => {
    apiFetch("/v1/admin/catalog/medication-checklist")
      .then((response) => response.json() as Promise<MedicationChecklistItem[]>)
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const results = useMemo(() => items.filter((item) =>
    item.showInApp && (item.clinicalDomains ?? ["diabetes"]).some((domain) => domain !== "diabetes" && selected.has(domain))
  ), [items, selected]);
  const cards = useMemo(() => results.flatMap((item) => displays(item).map((presentation) => ({ item, presentation }))), [results]);

  function toggle(domain: Exclude<MedicationClinicalDomain, "diabetes">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  return <section className="companion-medication-section">
    <div className="section-heading"><div><span className="eyebrow">Companion medication catalogue</span><h2>نمایش سایر داروهای مورد نیاز</h2><p>داروهای پایه دیابت جدا نمایش داده می‌شوند؛ هر حوزه را فقط در صورت نیاز باز کنید.</p></div></div>
    <div className="domain-toggle-grid">{domains.map((domain) => {
      const count = items.filter((item) => item.showInApp && item.clinicalDomains?.includes(domain.key)).length;
      return <button className={selected.has(domain.key) ? "domain-toggle selected" : "domain-toggle secondary"} key={domain.key} onClick={() => toggle(domain.key)} type="button"><strong>{domain.label}</strong><small>{domain.description}</small><span>{count} داروی فعال</span></button>;
    })}</div>
    {selected.size > 0 && (cards.length ? <div className="consideration-grid companion-grid">{cards.map(({ item, presentation }) =>
      <article className="consideration-card companion-card" key={presentation.cardId}><div className="priority-row"><span className="priority-badge">داروی همراه</span>{presentation.marketBadge?.confirmedByAdmin && <span className="market-new-badge">{presentation.marketBadge.labelFa}</span>}</div><h3>{presentation.name}</h3>{presentation.genericName && <p className="generic-name-note">نام ژنریک: {presentation.genericName}</p>}<p className="muted">{item.dosageForm} · {item.strengthPresentation}</p><MedicationMarketDetails brandRegistryCode={presentation.brandRegistryCode} coverages={presentation.coverages} genericRegistryCode={presentation.genericRegistryCode} marketBadge={presentation.marketBadge} price={presentation.price} selectedBrands={presentation.selectedBrands} /><p className="companion-disclaimer">نمایش این کارت به‌تنهایی توصیه برای شروع درمان نیست؛ تناسب با وضعیت بیمار و ماژول گایدلاین باید بررسی شود.</p></article>
    )}</div> : <div className="empty-catalog"><strong>برای حوزه‌های انتخاب‌شده هنوز داروی فعال و تطبیق‌یافته‌ای وجود ندارد.</strong><p>پس از ورود داده ایران و بازبینی بالینی، اقلام این بخش فعال می‌شوند.</p></div>)}
  </section>;
}
