"use client";

import type { InsuranceProvider, MedicationChecklistItem } from "@diabeto/contracts";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api-client";

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
  const brands = [...item.brands].filter((entry) => entry.showInsteadOfGeneric && entry.name.trim()).sort((left, right) => left.priority - right.priority);
  if (brands.length === 0) return [{
    cardId: `${item.referencePresentationId}:generic`,
    name: item.genericName,
    brand: undefined,
    coverage: item.insuranceCoverages
  }];
  return brands.map((brand) => ({
    cardId: `${item.referencePresentationId}:${brand.id}`,
    name: brand.name.trim(),
    brand,
    coverage: brand.customInsurance ? brand.insuranceCoverages : item.insuranceCoverages
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
    return <article className={`consideration-card ${isGlargine(item) ? "priority-recommended" : "priority-preferred"}`} key={presentation.cardId}><div className="priority-row"><span className="priority-badge">#{index + 1}{isGlargine(item) ? " · اولویت گلارژین" : ""}</span><span className="cost-chip">هزینه نسبی متوسط</span></div><h3>{presentation.name}</h3>{presentation.brand && <p className="generic-name-note">نام ژنریک: {item.genericName}</p>}<p className="muted">{item.dosageForm} · {item.strengthPresentation}</p><div className={presentation.coverage.length ? "insurance-summary covered" : "insurance-summary"}><strong>{presentation.coverage.length ? "✓ دارای پوشش بیمه" : "بدون پوشش بیمه ثبت‌شده"}</strong>{presentation.coverage.map((entry) => <span key={entry.provider}>{insuranceLabels[entry.provider]}: {entry.percent}٪</span>)}</div><div className="risk-box"><strong>ریسک‌ها و معایب</strong><ul>{risks(item).map((risk) => <li key={risk}>{risk}</li>)}</ul></div></article>;
  })}</div></section>;
}
