import { describe, expect, it } from "vitest";
import {
  activeGuidelineSources,
  buildType2MedicationConsiderations,
  buildType2PathwayRecommendation,
} from "../src/index.js";

const empagliflozin = {
  id: "empagliflozin",
  canonicalName: "Empagliflozin",
  persianName: "امپاگلیفلوزین",
  className: "SGLT2 inhibitor",
  therapyGroup: "oral_glucose_lowering" as const,
  administrationRoute: "oral" as const,
};

const semaglutide = {
  id: "semaglutide",
  canonicalName: "Semaglutide",
  persianName: "سماگلوتاید",
  className: "GLP-1 receptor agonist",
  therapyGroup: "glp_1_receptor_agonist" as const,
  administrationRoute: "subcutaneous" as const,
};

const resmetirom = {
  id: "resmetirom",
  canonicalName: "Resmetirom",
  persianName: "رسمتی‌روم",
  className: "THR-beta agonist",
  therapyGroup: "liver_directed_therapy" as const,
  administrationRoute: "oral" as const,
};

describe("clinical evidence registry", () => {
  it("contains every source shown as active scientific evidence", () => {
    const ids = activeGuidelineSources.map((source) => source.id);
    expect(ids).toEqual(expect.arrayContaining([
      "ada-2026",
      "easd-2022",
      "kdigo-ckd-2024",
      "kdigo-dmckd-2022",
      "easl-masld-2024",
      "esc-dm-cvd-2023",
      "iwgdf-inf-2023",
      "iwgdf-wound-2023",
      "ema-resmetirom-2025",
    ]));
    expect(activeGuidelineSources.every((source) => source.engineInfluence)).toBe(true);
  });

  it("uses KDIGO evidence when CKD changes SGLT2 ranking", () => {
    const [result] = buildType2MedicationConsiderations([empagliflozin], {
      currentHba1c: 8.2,
      targetHba1c: 7,
      clinicalContext: { kidney: { ckd: true, eGfr: 42, uacrMgG: 220 } },
      factors: ["ckd"],
    });

    expect(result?.rankingReasons.some((reason) => reason.includes("HF/CKD"))).toBe(true);
    expect(result?.sourceReference).toContain("KDIGO-CKD 2024");
    expect(result?.sourceReference).toContain("KDIGO-DMCKD 2022");
  });

  it("uses ESC evidence when ASCVD changes GLP-1 ranking", () => {
    const [result] = buildType2MedicationConsiderations([semaglutide], {
      currentHba1c: 8,
      targetHba1c: 7,
      factors: ["ascvd"],
    });

    expect(result?.rankingReasons.some((reason) => reason.includes("قلبی‌عروقی"))).toBe(true);
    expect(result?.sourceReference).toContain("ESC-DM-CVD 2023");
  });

  it("uses IWGDF sources as a diabetic-foot pathway escalation rather than a fake drug-ranking bonus", () => {
    const result = buildType2PathwayRecommendation({
      currentHba1c: 7.8,
      targetHba1c: 7,
      factors: ["diabetic_foot"],
    });

    expect(result.rationale.some((line) => line.includes("پای دیابتی"))).toBe(true);
    expect(result.sourceReference).toContain("IWGDF-INF 2023");
    expect(result.sourceReference).toContain("IWGDF-WOUND 2023");
  });

  it("uses EASL and EMA eligibility rules for resmetirom only in non-cirrhotic MASH F2-F3", () => {
    const [eligible] = buildType2MedicationConsiderations([resmetirom], {
      currentHba1c: 7.5,
      targetHba1c: 7,
      factors: ["masld_mash"],
      clinicalContext: { liver: { masldMash: true, fibrosisStage: "F2", cirrhosis: false } },
    });
    expect(eligible?.sourceReference).toContain("EASL-MASLD 2024");
    expect(eligible?.sourceReference).toContain("EMA-RESMETIROM 2025");
    expect(eligible?.blockedBy).toBeUndefined();

    const [blocked] = buildType2MedicationConsiderations([resmetirom], {
      currentHba1c: 7.5,
      targetHba1c: 7,
      factors: ["masld_mash"],
      clinicalContext: { liver: { masldMash: true, fibrosisStage: "F4", cirrhosis: true } },
    });
    expect(blocked?.blockedBy?.some((item) => item.includes("F2–F3"))).toBe(true);
  });
});
