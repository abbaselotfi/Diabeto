"use client";

import type { InsuranceProvider, MedicationChecklistItem } from "@glymize/contracts";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import MedicationMarketDetails from "./medication-market-details";

const insuranceLabels: Record<InsuranceProvider, string> = {
  social_security: "بیمه تأمین اجتماعی", health_insurance: "بیمه سلامت", armed_forces: "بیمه نیروهای مسلح",
  other_organizations: "سایر ارگان‌ها", supplementary: "بیمه تکمیلی"
};
function risks(item: MedicationChecklistItem) {
  const text = `${item.genericName} ${item.therapeuticClass}`.toLocaleLowerCase();
  if (text.includes("insulin") || text.includes("انسولین")) return ["ریسک هیپوگلیسمی و احتمال افزایش وزن", "نیاز به آموزش تزریق، پایش و برنامهٔ روز بیماری"];
  return ["عوارض و منع مصرف اختصاصی برچسب فرآورده باید بررسی شود"];
}
function isGlargine(item: MedicationChecklistItem) {
  const text = item.genericName.toLocaleLowerCase();
  return text.includes("glargine") || text.includes("گلارژین");
}
function displays(item: MedicationChecklistItem) {
  const brands = [...item.brands].filter((entry) => entry.showInsteadOfGeneric && !entry.hiddenFromSource && entry.name.trim()).sort((left, right) => left.priority - right.priority);
  if (brands.length === 0 || item.displayMode === "generic_with_selected_brands") return [{
    cardId: `${item.referencePresentationId}:generic`,
    name: item.genericName,
    brand: undefined,
    selectedBrands: item.displayMode === "generic_with_selected_brands" ? brands.map((brand) => ({ ...brand, insuranceCoverages: brand.customInsurance ? brand.insuranceCoverages : item.insuranceCoverages })) : undefined,
    coverage: item.insuranceCoverages,
    price: item.price,
    genericRegistryCode: item.genericRegistryCode,
    brandRegistryCode: undefined,
    marketBadge: item.marketBadge
  }];
  return brands.slice(0, 1).map((brand) => ({
    cardId: `${item.referencePresentationId}:${brand.id}`,
    name: brand.name.trim(),
    brand,
    selectedBrands: undefined,
    coverage: brand.customInsurance ? brand.insuranceCoverages : item.insuranceCoverages,
    price: brand.price ?? item.price,
    genericRegistryCode: brand.genericRegistryCode ?? item.genericRegistryCode,
    brandRegistryCode: brand.brandRegistryCode,
    marketBadge: brand.marketBadge ?? item.marketBadge
  }));
}

export default function PathwayMedicationCards({ pathway }: { pathway: "type1" | "pregnancy" }) {
  const [items, setItems] = useState<MedicationChecklistItem[]>([]);
  useEffect(() => { apiFetch("/v1/admin/catalog/medication-checklist").then((response) => response.json() as Promise<MedicationChecklistItem[]>).then(setItems).catch(() => setItems([])); }, []);
  const medications = useMemo(() => items
    .filter((item) => item.showInApp && /insulin|انسولین/i.test(`${item.genericName} ${item.therapeuticClass}`))
    .sort((left, right) => Number(isGlargine(right)) - Number(isGlargine(left)))
    .flatMap((item) => displays(item).map((presentation) => ({ item, presentation }))), [items]);
  return <section className="medication-results"><div className="section-heading"><div><h2>داروهای فعال و پوشش بیمه</h2><p>{pathway === "pregnancy" ? "فقط انسولین‌ها نمایش داده می‌شوند و مناسب‌بودن فرآورده باید جداگانه تأیید شود." : "انسولین‌های پایه گلارژین در ابتدای فهرست قرار دارند."}</p></div><span className="version-badge">{medications.length} فرآورده</span></div><div className="consideration-grid">{medications.map(({ item, presentation }, index) => {
    return <article className={`consideration-card ${isGlargine(item) ? "priority-recommended" : "priority-preferred"}`} key={presentation.cardId}><div className="priority-row"><span className="priority-badge">#{index + 1}{isGlargine(item) ? " · اولویت گلارژین" : ""}</span><span className="cost-chip">هزینه نسبی متوسط</span></div><h3>{presentation.name}</h3>{presentation.brand && <p className="generic-name-note">نام ژنریک: {item.genericName}</p>}<p className="muted">{item.dosageForm} · {item.strengthPresentation}</p><div className={presentation.coverage.length ? "insurance-summary covered" : "insurance-summary"}><strong>{presentation.coverage.length ? "✓ دارای پوشش بیمه" : "بدون پوشش بیمه ثبت‌شده"}</strong>{presentation.coverage.map((entry) => <span key={entry.provider}>{insuranceLabels[entry.provider]}: {entry.percent}٪</span>)}</div><MedicationMarketDetails brandRegistryCode={presentation.brandRegistryCode} coverages={presentation.coverage} genericRegistryCode={presentation.genericRegistryCode} marketBadge={presentation.marketBadge} price={presentation.price} selectedBrands={presentation.selectedBrands} /><div className="risk-box"><strong>ریسک‌ها و معایب</strong><ul>{risks(item).map((risk) => <li key={risk}>{risk}</li>)}</ul></div></article>;
  })}</div></section>;
}
