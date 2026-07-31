import { Injectable } from "@nestjs/common";
import type { GuidelineSource, GuidelineUpdateCheckResult } from "@glymize/contracts";
import { guidelineSources } from "./guideline-sources.js";

@Injectable()
export class GuidelineService {
  listSources(): readonly GuidelineSource[] {
    return guidelineSources;
  }

  checkForUpdate(sourceId: string): GuidelineUpdateCheckResult {
    const source = guidelineSources.find((item) => item.id === sourceId);
    const checkedAt = new Date().toISOString();
    if (!source) {
      return { sourceId, status: "blocked", checkedAt, message: "منبع guideline شناخته نشد." };
    }

    source.lastCheckedAt = checkedAt;
    return {
      sourceId,
      status: "queued_for_review",
      checkedAt,
      message: "بررسی نسخهٔ جدید به صف بازبینی ادمین و پزشک ارسال شد؛ هیچ پروتکل بالینی خودکار تغییر نکرده است."
    };
  }
}
