import type {
  BrandDisplayMode,
  BrandMarketEntry,
  ClinicalProtocolBundle,
  DiabetesType,
  GenericMedication,
  OrganizationBrandPreference,
  Type2ConsiderationRequest,
  Type2MedicationConsideration
} from "@diabeto/contracts";

export interface ProtocolGateResult {
  enabled: boolean;
  reason?: "missing_protocol" | "clinical_review_required";
}

/** Treatment output is impossible until an approved, clinician-reviewed bundle exists. */
export function gateClinicalOutput(protocol?: ClinicalProtocolBundle): ProtocolGateResult {
  if (!protocol) return { enabled: false, reason: "missing_protocol" };
  if (protocol.status !== "approved" || protocol.clinicalReviewRequired) return { enabled: false, reason: "clinical_review_required" };
  return { enabled: true };
}

export interface PathwaySelection {
  diabetesType: DiabetesType;
  contentStatus: "not_enabled" | "requires_approved_bundle";
  patientDataPolicy: "anonymous_only";
}

/**
 * This is intentionally not a diagnosis or treatment engine. It only locks a
 * user session to an approved diabetes-specific content bundle in a later step.
 */
export function selectDiabetesPathway(diabetesType: DiabetesType): PathwaySelection {
  return {
    diabetesType,
    contentStatus: diabetesType === "type_2" ? "requires_approved_bundle" : "not_enabled",
    patientDataPolicy: "anonymous_only"
  };
}

export interface MedicationPresentation {
  primaryName: string;
  genericName: string;
  selectedBrand?: BrandMarketEntry;
}

/**
 * The rule engine consumes only genericMedication.id. This function is UI-only.
 */
export function resolveMedicationPresentation(input: {
  medication: GenericMedication;
  brands: readonly BrandMarketEntry[];
  displayMode: BrandDisplayMode;
  preferences: readonly OrganizationBrandPreference[];
}): MedicationPresentation {
  const eligibleBrands = input.brands.filter(
    (brand) =>
      brand.genericMedicationId === input.medication.id &&
      brand.market === "IR" &&
      brand.availability === "active" &&
      brand.reviewState === "published" &&
      Boolean(brand.verifiedAt)
  );

  const priorities = new Map(input.preferences.map((preference) => [preference.brandMarketEntryId, preference.priority]));
  const selectedBrand = [...eligibleBrands].sort((left, right) => {
    const leftPriority = priorities.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priorities.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.brandName.localeCompare(right.brandName);
  })[0];

  if (input.displayMode === "brand_first" && selectedBrand) {
    return {
      primaryName: selectedBrand.brandNameFa ?? selectedBrand.brandName,
      genericName: input.medication.persianName,
      selectedBrand
    };
  }

  return {
    primaryName: input.medication.persianName,
    genericName: input.medication.persianName,
    selectedBrand
  };
}

const ada2026Section9 = {
  sourceUrl: "https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment",
  sourceReference: "ADA Standards of Care in Diabetes—2026, Section 9"
} as const;

/**
 * This layer exposes only class-level clinical considerations for review. It
 * deliberately has no dose, no order set and no patient-specific prescription
 * output. An approved protocol is still required before any treatment output.
 */
export function buildType2MedicationConsiderations(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest
): Type2MedicationConsideration[] {
  return medications.map((medication) => {
    const considerations: string[] = [];
    const cautions: string[] = [];
    const blockedBy: string[] = [];
    const className = medication.className ?? "";
    const name = medication.canonicalName.toLocaleLowerCase();

    if (name === "metformin") {
      considerations.push("داروی پایهٔ رایج؛ وضعیت کلیه، تحمل گوارشی و B12 باید در بازبینی پزشک لحاظ شود.");
      if (request.eGfr !== undefined && request.eGfr < 30) blockedBy.push("eGFR کمتر از ۳۰: این ابزار شروع/ادامه را تأیید نمی‌کند؛ برچسب دارو و تصمیم پزشک بررسی شود.");
      else if (request.eGfr !== undefined && request.eGfr < 45) cautions.push("eGFR کمتر از ۴۵: نیاز به بازبینی کلیوی و برچسب فرآورده.");
    }

    if (className.includes("SGLT2")) {
      if (request.factors.includes("heart_failure")) considerations.push("در نارسایی قلبی، گزینه‌های دارای شواهد این کلاس باید در پروتکل تأییدشده بررسی شوند.");
      if (request.factors.includes("ckd")) considerations.push("در CKD، منفعت قلبی-کلیوی و آستانهٔ eGFR هر فرآورده باید با برچسب و پروتکل بررسی شود.");
      cautions.push("خطرات حجم/فشارخون، عفونت‌های تناسلی-ادراری و وضعیت بالینی حاد باید توسط پزشک مرور شود.");
      if (request.eGfr !== undefined && request.eGfr < 20) cautions.push("eGFR کمتر از ۲۰: برای این ابزار، بررسی تخصصی برچسب و پروتکل لازم است.");
    }

    if (medication.therapyGroup === "glp_1_receptor_agonist" || medication.therapyGroup === "dual_gip_glp_1_receptor_agonist") {
      if (request.factors.includes("ascvd")) considerations.push("در ASCVD، فرآوردهٔ دارای شواهد پیامد قلبی-عروقی باید در پروتکل تأییدشده بررسی شود.");
      if (request.factors.includes("weight_priority")) considerations.push("برای هدف مدیریت وزن، اثربخشی و تحمل‌پذیری فرآورده باید در تصمیم مشترک مرور شود.");
      cautions.push("تحمل گوارشی، سابقهٔ پانکراتیت و هشدارهای اختصاصی برچسب باید مرور شود.");
      cautions.push("هم‌زمانی با DPP-4 inhibitor به‌عنوان ترکیب معمول در این ابزار پیشنهاد نمی‌شود.");
    }

    if (className.includes("DPP-4")) {
      considerations.push("گزینهٔ خوراکی با خطر هیپوگلیسمی پایین در نبود ترکیب‌های هیپوگلیسمی‌زا.");
      if (request.factors.includes("heart_failure") && (name === "saxagliptin" || name === "alogliptin")) cautions.push("در نارسایی قلبی، هشدار اختصاصی این فرآورده باید با برچسب و پزشک مرور شود.");
      cautions.push("در اغلب اعضای کلاس، تنظیمات مرتبط با عملکرد کلیه باید بررسی شود.");
    }

    if (className.includes("Sulfonylurea") || className.includes("Meglitinide")) {
      cautions.push("خطر هیپوگلیسمی و افزایش وزن؛ در ریسک بالای هیپوگلیسمی با احتیاط بررسی شود.");
      if (request.factors.includes("hypoglycemia_risk")) blockedBy.push("ریسک بالای هیپوگلیسمی: این کلاس بدون پروتکل تأییدشده نباید به‌عنوان گزینهٔ پیشنهادی نمایش داده شود.");
    }

    if (className.includes("Thiazolidinedione")) {
      cautions.push("احتباس مایع، افزایش وزن، شکستگی و هشدارهای اختصاصی برچسب باید مرور شود.");
      if (request.factors.includes("heart_failure")) blockedBy.push("نارسایی قلبی/خطر احتباس مایع: نیاز به بازبینی پزشک و برچسب؛ پیشنهاد خودکار مسدود است.");
    }

    if (medication.therapyGroup === "human_insulin" || medication.therapyGroup === "basal_insulin_analog" || medication.therapyGroup === "prandial_insulin_analog" || medication.therapyGroup === "premixed_insulin") {
      considerations.push("مسیر انسولین فقط در پروتکل مستقل و تأییدشدهٔ انسولین بررسی می‌شود.");
      cautions.push("این نسخهٔ برنامه هیچ دوز، تیتر کردن یا تبدیل واحد انسولین تولید نمی‌کند.");
      if (request.factors.includes("hypoglycemia_risk")) cautions.push("ریسک هیپوگلیسمی باید در انتخاب فرآورده و طرح پایش لحاظ شود.");
    }

    if (medication.therapyGroup === "fixed_ratio_combination") {
      considerations.push("ترکیب ثابت انسولین/GLP-1 فقط در مسیر اختصاصی FRC و با فرآورده/قدرتِ تأییدشدهٔ بازار ایران بررسی می‌شود.");
      cautions.push("قدرت‌های Soliqua/Suliqua 100/33 و 100/50 باید به‌صورت فرآورده‌های مجزا و بدون تبدیل خودکار ثبت شوند.");
    }

    if (considerations.length === 0) considerations.push("انتخاب این کلاس نیازمند تطبیق با هدف درمان، هم‌ابتلایی، برچسب و پروتکل تأییدشده است.");

    return {
      genericMedicationId: medication.id,
      genericName: medication.canonicalName,
      persianName: medication.persianName,
      therapeuticClass: className || "سایر",
      therapyGroup: medication.therapyGroup ?? "oral_glucose_lowering",
      ...ada2026Section9,
      considerations,
      cautions,
      blockedBy: blockedBy.length ? blockedBy : undefined,
      outputStatus: "requires_approved_protocol"
    };
  });
}
