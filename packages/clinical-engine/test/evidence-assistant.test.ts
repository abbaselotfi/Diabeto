import { describe, expect, it } from "vitest";
import {
  buildExtractiveEvidenceAnswer,
  retrieveApprovedEvidence,
} from "../src/evidence-assistant.js";

describe("approved evidence assistant retrieval", () => {
  it("retrieves KDIGO-backed CKD evidence from a Persian question", () => {
    const result = retrieveApprovedEvidence("در بیمار دیابت نوع ۲ با CKD و eGFR پایین، متفورمین و SGLT2 چه ملاحظاتی دارند؟", "fa");

    expect(result.sufficientEvidence).toBe(true);
    expect(result.hits.some((hit) => hit.ruleId === "T2-CKD-001")).toBe(true);
    expect(result.hits.flatMap((hit) => hit.citations).some((source) => source.shortCode === "KDIGO-CKD 2024")).toBe(true);
  });

  it("retrieves the diabetic-foot parallel pathway and IWGDF provenance", () => {
    const result = retrieveApprovedEvidence("بیمار زخم و عفونت پای دیابتی دارد؛ چه مسیر جداگانه‌ای لازم است؟", "fa");

    expect(result.hits.some((hit) => hit.ruleId === "T2-FOOT-001")).toBe(true);
    const sources = result.hits.flatMap((hit) => hit.citations).map((source) => source.shortCode);
    expect(sources).toContain("IWGDF-INF 2023");
    expect(sources).toContain("IWGDF-WOUND 2023");
  });

  it("refuses to invent an answer when approved evidence is insufficient", () => {
    const result = retrieveApprovedEvidence("آیا این برنامه درباره درمان میگرن مزمن چه توصیه‌ای دارد؟", "fa");
    const answer = buildExtractiveEvidenceAnswer(result);

    expect(result.sufficientEvidence).toBe(false);
    expect(answer).toContain("اطلاعات کافی");
  });
});
