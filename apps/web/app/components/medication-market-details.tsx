"use client";

import type { InsuranceCoverage, MedicationBrand, MedicationMarketBadge, MedicationPrice } from "@glymize/contracts";
import { coverageHasFinancialBreakdown, effectivePriceToman, formatToman, groupInsuranceCodes, insuranceProviderLabelsFa } from "../../lib/medication-market";

interface MedicationMarketDetailsProps {
  locale?: "fa" | "en";
  genericRegistryCode?: string;
  brandRegistryCode?: string;
  price?: MedicationPrice;
  coverages: InsuranceCoverage[];
  selectedBrands?: MedicationBrand[];
  marketBadge?: MedicationMarketBadge;
}

const insuranceProviderLabelsEn = {
  social_security: "Social Security",
  health_insurance: "Health Insurance",
  armed_forces: "Armed Forces",
  other_organizations: "Other organizations",
  supplementary: "Supplementary insurance"
} as const;

export default function MedicationMarketDetails({
  locale = "fa",
  genericRegistryCode,
  brandRegistryCode,
  price,
  coverages,
  selectedBrands = [],
  marketBadge
}: MedicationMarketDetailsProps) {
  const fa = locale === "fa";
  const genericCodes = groupInsuranceCodes(coverages, "genericCode");
  const brandCodes = groupInsuranceCodes(coverages, "brandCode");
  const providerLabels = fa ? insuranceProviderLabelsFa : insuranceProviderLabelsEn;

  function codeBlock(title: string, codes: ReturnType<typeof groupInsuranceCodes>) {
    if (codes.mode === "none") return null;
    return <div className="insurance-code-block"><strong>{title}</strong>{codes.mode === "common"
      ? <span><b>{fa ? "کد مشترک همه بیمه‌ها:" : "Shared insurer code:"}</b> <code>{codes.commonCode}</code></span>
      : codes.perProvider.map((entry) => <span key={entry.provider}><b>{providerLabels[entry.provider]}:</b> {entry.code ? <code>{entry.code}</code> : fa ? "ثبت نشده" : "Not recorded"}</span>)}</div>;
  }

  return <>
    <div className="market-card-summary">
      <span><b>{fa ? "قیمت مصرف‌کننده:" : "Retail price:"}</b> {formatToman(effectivePriceToman(price), locale)}</span>
      {price?.manualOverrideToman !== undefined && <small className={price.manualOverrideNeedsReview ? "override-warning" : "manual-override"}>{price.manualOverrideNeedsReview ? (fa ? "اصلاح دستی نیازمند بازبینی" : "Manual override needs review") : (fa ? "اصلاح دستی ادمین" : "Admin override")}</small>}
      {marketBadge?.confirmedByAdmin && <span className="market-new-badge">{marketBadge.labelFa}</span>}
    </div>
    <details className="medication-market-details">
      <summary>{fa ? "قیمت، کدها و جزئیات بیمه" : "Price, codes and insurance details"}</summary>
      <div className="market-details-body">
        <div className="registry-code-row">
          {genericRegistryCode && <span><b>{fa ? "کد ژنریک رجیستری:" : "Registry generic code:"}</b> <code>{genericRegistryCode}</code></span>}
          {brandRegistryCode && <span><b>{fa ? "کد برند رجیستری:" : "Registry brand code:"}</b> <code>{brandRegistryCode}</code></span>}
        </div>
        {codeBlock(fa ? "کد ژنریک در بیمه‌ها" : "Generic codes by insurer", genericCodes)}
        {codeBlock(fa ? "کد برند در بیمه‌ها" : "Brand codes by insurer", brandCodes)}
        <div className="coverage-detail-list">{coverages.length ? coverages.map((coverage) => <article key={`${coverage.provider}:${coverage.genericCode ?? ""}:${coverage.brandCode ?? ""}`}>
          <header><strong>{providerLabels[coverage.provider]}</strong><span>{coverage.percent}٪</span></header>
          {coverageHasFinancialBreakdown(coverage) && <div><span>{fa ? "سهم سازمان" : "Insurer share"}: {formatToman(coverage.insurerShareToman, locale)}</span><span>{fa ? "سهم بیمار" : "Patient share"}: {formatToman(coverage.patientShareToman, locale)}</span>{coverage.referencePriceToman !== undefined && <span>{fa ? "تعرفه مرجع" : "Reference tariff"}: {formatToman(coverage.referencePriceToman, locale)}</span>}</div>}
          {coverage.effectiveAt && <small>{fa ? "تاریخ اعتبار:" : "Effective:"} {new Date(coverage.effectiveAt).toLocaleDateString(fa ? "fa-IR" : "en-US")}</small>}
          {coverage.sourceUrl && <a href={coverage.sourceUrl} rel="noreferrer" target="_blank">{fa ? "منبع بیمه" : "Coverage source"}</a>}
        </article>) : <p className="muted">{fa ? "پوشش بیمه ثبت نشده است." : "No insurance coverage is recorded."}</p>}</div>
        {selectedBrands.length > 0 && <section className="selected-brand-details"><h4>{fa ? "برندهای منتخب" : "Selected brands"}</h4>{[...selectedBrands].sort((left, right) => left.priority - right.priority).map((brand) => {
          const brandGenericCodes = groupInsuranceCodes(brand.insuranceCoverages, "genericCode");
          const insurerBrandCodes = groupInsuranceCodes(brand.insuranceCoverages, "brandCode");
          return <article key={brand.id}><div className="selected-brand-heading"><strong>{brand.priority}- {brand.name}</strong>{brand.brandRegistryCode && <code>{brand.brandRegistryCode}</code>}<span>{formatToman(effectivePriceToman(brand.price), locale)}</span>{brand.sourceUrl && <a href={brand.sourceUrl} rel="noreferrer" target="_blank">{fa ? "منبع برند" : "Brand source"}</a>}</div><div className="selected-brand-insurance">{codeBlock(fa ? "کد ژنریک برند در بیمه‌ها" : "Brand generic codes by insurer", brandGenericCodes)}{codeBlock(fa ? "کد برند در بیمه‌ها" : "Brand codes by insurer", insurerBrandCodes)}{brand.insuranceCoverages.map((coverage) => <span key={`${brand.id}:${coverage.provider}`}><b>{providerLabels[coverage.provider]}:</b> {coverage.percent}٪ · {fa ? "سهم بیمار" : "Patient"} {formatToman(coverage.patientShareToman, locale)}</span>)}</div></article>;
        })}</section>}
        {price?.sourceUrl && <a className="source-link" href={price.sourceUrl} rel="noreferrer" target="_blank">{fa ? "منبع قیمت" : "Price source"}</a>}
      </div>
    </details>
  </>;
}
