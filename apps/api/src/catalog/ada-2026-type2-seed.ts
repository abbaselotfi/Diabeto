import type { ClinicalProtocolBundle, GenericMedication } from "@diabeto/contracts";

const adaSection9 = {
  sourceUrl: "https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment",
  sourceReference: "ADA Standards of Care in Diabetes—2026, Section 9: Pharmacologic Approaches to Glycemic Treatment",
  publishedAt: "2025-12-08"
} as const;

type Seed = Pick<GenericMedication, "id" | "canonicalName" | "persianName" | "className" | "therapyGroup" | "administrationRoute">;

const oral = (id: string, canonicalName: string, persianName: string, className: string): Seed => ({
  id, canonicalName, persianName, className, therapyGroup: "oral_glucose_lowering", administrationRoute: "oral"
});

const injectable = (
  id: string,
  canonicalName: string,
  persianName: string,
  className: string,
  therapyGroup: Extract<GenericMedication["therapyGroup"], "glp_1_receptor_agonist" | "dual_gip_glp_1_receptor_agonist" | "human_insulin" | "basal_insulin_analog" | "prandial_insulin_analog" | "premixed_insulin" | "fixed_ratio_combination">
): Seed => ({ id, canonicalName, persianName, className, therapyGroup, administrationRoute: "subcutaneous" });

/**
 * This is a guideline-derived seed catalogue, not a claim of Iranian market
 * availability. Brand, strength, pack, IRC and availability must arrive via
 * an approved market source and remain reviewable in the admin workflow.
 */
export const ada2026Type2GenericSeed: readonly GenericMedication[] = [
  oral("metformin", "Metformin", "متفورمین", "Biguanide"),
  oral("acarbose", "Acarbose", "آکاربوز", "Alpha-glucosidase inhibitor"),
  oral("miglitol", "Miglitol", "میگلیتول", "Alpha-glucosidase inhibitor"),
  oral("glimepiride", "Glimepiride", "گلیمپراید", "Sulfonylurea"),
  oral("gliclazide", "Gliclazide", "گلیکلازید", "Sulfonylurea"),
  oral("glipizide", "Glipizide", "گلی‌پیزاید", "Sulfonylurea"),
  oral("glyburide", "Glyburide (Glibenclamide)", "گلی‌بنکلامید", "Sulfonylurea"),
  oral("pioglitazone", "Pioglitazone", "پیوگلیتازون", "Thiazolidinedione"),
  oral("repaglinide", "Repaglinide", "رپاگلیناید", "Meglitinide"),
  oral("nateglinide", "Nateglinide", "ناتگلیناید", "Meglitinide"),
  oral("sitagliptin", "Sitagliptin", "سیتاگلیپتین", "DPP-4 inhibitor"),
  oral("linagliptin", "Linagliptin", "لیناگلیپتین", "DPP-4 inhibitor"),
  oral("saxagliptin", "Saxagliptin", "ساکساگلیپتین", "DPP-4 inhibitor"),
  oral("alogliptin", "Alogliptin", "آلوگلیپتین", "DPP-4 inhibitor"),
  oral("empagliflozin", "Empagliflozin", "امپاگلیفلوزین", "SGLT2 inhibitor"),
  oral("dapagliflozin", "Dapagliflozin", "داپاگلیفلوزین", "SGLT2 inhibitor"),
  oral("canagliflozin", "Canagliflozin", "کاناگلیفلوزین", "SGLT2 inhibitor"),
  oral("ertugliflozin", "Ertugliflozin", "ارتوگلیفلوزین", "SGLT2 inhibitor"),
  injectable("liraglutide", "Liraglutide", "لیراگلوتاید", "GLP-1 receptor agonist", "glp_1_receptor_agonist"),
  injectable("semaglutide", "Semaglutide", "سماگلوتاید", "GLP-1 receptor agonist", "glp_1_receptor_agonist"),
  injectable("dulaglutide", "Dulaglutide", "دولاگلوتاید", "GLP-1 receptor agonist", "glp_1_receptor_agonist"),
  injectable("exenatide", "Exenatide", "اگزناتاید", "GLP-1 receptor agonist", "glp_1_receptor_agonist"),
  injectable("lixisenatide", "Lixisenatide", "لیکسی‌سناتاید", "GLP-1 receptor agonist", "glp_1_receptor_agonist"),
  injectable("tirzepatide", "Tirzepatide", "تیرزپاتاید", "Dual GIP/GLP-1 receptor agonist", "dual_gip_glp_1_receptor_agonist"),
  injectable("regular-human-insulin", "Regular human insulin", "انسولین انسانی رگولار", "Human insulin", "human_insulin"),
  injectable("nph-human-insulin", "NPH human insulin", "انسولین انسانی NPH", "Human insulin", "human_insulin"),
  injectable("insulin-glargine", "Insulin glargine", "انسولین گلارژین", "Basal insulin analog", "basal_insulin_analog"),
  injectable("insulin-detemir", "Insulin detemir", "انسولین دتمیر", "Basal insulin analog", "basal_insulin_analog"),
  injectable("insulin-degludec", "Insulin degludec", "انسولین دگلودک", "Basal insulin analog", "basal_insulin_analog"),
  injectable("insulin-lispro", "Insulin lispro", "انسولین لیسپرو", "Prandial insulin analog", "prandial_insulin_analog"),
  injectable("insulin-aspart", "Insulin aspart", "انسولین آسپارت", "Prandial insulin analog", "prandial_insulin_analog"),
  injectable("insulin-glulisine", "Insulin glulisine", "انسولین گلولایزین", "Prandial insulin analog", "prandial_insulin_analog"),
  injectable("nph-regular-human-insulin", "NPH/regular human insulin", "انسولین انسانی NPH/رگولار", "Premixed human insulin", "premixed_insulin"),
  injectable("insulin-lispro-protamine-lispro", "Insulin lispro protamine/insulin lispro", "لیسپرو پروتامين/لیسپرو", "Premixed insulin analog", "premixed_insulin"),
  injectable("insulin-aspart-protamine-aspart", "Insulin aspart protamine/insulin aspart", "آسپارت پروتامين/آسپارت", "Premixed insulin analog", "premixed_insulin"),
  injectable("insulin-glargine-lixisenatide", "Insulin glargine/lixisenatide", "انسولین گلارژین/لیکسی‌سناتاید", "Fixed-ratio basal insulin/GLP-1 receptor agonist", "fixed_ratio_combination"),
  injectable("insulin-degludec-liraglutide", "Insulin degludec/liraglutide", "انسولین دگلودک/لیراگلوتاید", "Fixed-ratio basal insulin/GLP-1 receptor agonist", "fixed_ratio_combination")
].map((medication) => ({ ...medication, catalogStatus: "seeded_from_guideline" }));

export const type2ProtocolSeed: readonly ClinicalProtocolBundle[] = [
  {
    id: "ada-2026-type-2-initiation",
    title: "شروع درمان دیابت نوع ۲",
    diabetesType: "type_2",
    scope: "treatment_initiation",
    ...adaSection9,
    status: "approved",
    clinicalReviewRequired: false
  },
  {
    id: "ada-2026-type-2-intensification",
    title: "تشدید درمان دیابت نوع ۲",
    diabetesType: "type_2",
    scope: "treatment_intensification",
    ...adaSection9,
    status: "approved",
    clinicalReviewRequired: false
  },
  {
    id: "ada-2026-type-2-insulin",
    title: "مسیر انسولین و ترکیبات ثابت",
    diabetesType: "type_2",
    scope: "insulin_pathway",
    ...adaSection9,
    status: "approved",
    clinicalReviewRequired: false
  }
];
