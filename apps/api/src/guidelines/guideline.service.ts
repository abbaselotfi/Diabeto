import { Injectable } from "@nestjs/common";
import type { GuidelineUpdateCheckResult } from "@glymize/contracts";
import { guidelineSources } from "./guideline-sources.js";

@Injectable()
export class GuidelineService {
  listSources() {
    return guidelineSources;
  }

  checkForUpdate(sourceId: string): GuidelineUpdateCheckResult {
    const source = guidelineSources.find((item) => item.id === sourceId);
    const checkedAt = new Date().toISOString();
    if (!source) {
      return { sourceId, status: "blocked", checkedAt, message: "منبع شواهد بالینی شناخته نشد." };
    }

    source.lastCheckedAt = checkedAt;
    return {
      sourceId,
      status: "queued_for_review",
      checkedAt,
      message: `بررسی نسخهٔ جدید ${source.shortCode} به صف بازبینی ادمین و پزشک ارسال شد؛ هیچ Rule بالینی خودکار تغییر نکرده است.`
    };
  }
}
