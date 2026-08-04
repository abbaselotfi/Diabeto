import type { InsuranceCoverage, InsuranceProvider, MedicationPrice } from "@glymize/contracts";

export const insuranceProviderLabelsFa: Record<InsuranceProvider, string> = {
  social_security: "بیمه تأمین اجتماعی",
  health_insurance: "بیمه سلامت",
  armed_forces: "بیمه نیروهای مسلح",
  other_organizations: "سایر ارگان‌ها",
  supplementary: "بیمه تکمیلی"
};

export function toToman(amount: number, currency: "IRR" | "TOMAN") {
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return currency === "IRR" ? Math.round(amount / 10) : Math.round(amount);
}

export function effectivePriceToman(price?: MedicationPrice) {
  return price?.manualOverrideToman ?? price?.amountToman;
}

export function formatToman(amount?: number, locale: "fa" | "en" = "fa") {
  if (amount === undefined || !Number.isFinite(amount)) return locale === "fa" ? "ثبت نشده" : "Not recorded";
  const formatted = Math.round(amount).toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
  return locale === "fa" ? `${formatted} تومان` : `${formatted} toman`;
}

export interface GroupedInsuranceCode {
  mode: "none" | "common" | "per_provider";
  commonCode?: string;
  perProvider: Array<{ provider: InsuranceProvider; code?: string }>;
}

export function groupInsuranceCodes(coverages: InsuranceCoverage[], field: "genericCode" | "brandCode"): GroupedInsuranceCode {
  if (!coverages.length) return { mode: "none", perProvider: [] };
  const perProvider = coverages.map((coverage) => ({ provider: coverage.provider, code: coverage[field]?.trim() || undefined }));
  const codes = perProvider.map((entry) => entry.code).filter((code): code is string => Boolean(code));
  if (!codes.length) return { mode: "none", perProvider };
  const allProvidersHaveCode = perProvider.every((entry) => Boolean(entry.code));
  const uniqueCodes = new Set(codes);
  if (allProvidersHaveCode && uniqueCodes.size === 1) {
    return { mode: "common", commonCode: codes[0], perProvider };
  }
  return { mode: "per_provider", perProvider };
}

export function coverageHasFinancialBreakdown(coverage: InsuranceCoverage) {
  return coverage.insurerShareToman !== undefined || coverage.patientShareToman !== undefined || coverage.referencePriceToman !== undefined;
}
