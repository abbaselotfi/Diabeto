import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getActiveClinicalRulePack } from "@glymize/clinical-engine";
import { guidelineSources } from "./guideline-sources.js";

type SourceFingerprint = {
  sha256: string;
  etag?: string;
  lastModified?: string;
  checkedAt: string;
};

@Injectable()
export class GuidelineService {
  /**
   * Runtime observation cache. Durable candidate/review persistence belongs in
   * the clinical-governance store; this cache is intentionally non-executable.
   */
  private readonly observed = new Map<string, SourceFingerprint>();

  listSources() {
    return guidelineSources;
  }

  activeRulePack() {
    const pack = getActiveClinicalRulePack();
    return {
      id: pack.id,
      version: pack.version,
      status: pack.status,
      effectiveAt: pack.effectiveAt,
      approvedAt: pack.approvedAt,
      approvedBy: pack.approvedBy,
      ruleCount: pack.rules.length,
      sourceVersions: pack.sourceVersions,
    };
  }

  async checkForUpdate(sourceId: string) {
    const source = guidelineSources.find((item) => item.id === sourceId);
    const checkedAt = new Date().toISOString();
    if (!source) {
      return {
        sourceId,
        status: "blocked" as const,
        checkedAt,
        message: "منبع شواهد بالینی شناخته نشد.",
      };
    }

    try {
      const response = await fetch(source.sourceUrl, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "accept": "text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "user-agent": "GLYMIZE-Clinical-Evidence-Monitor/1.0 (+clinical-review-required)",
        },
      });
      if (!response.ok) {
        return {
          sourceId,
          status: "blocked" as const,
          checkedAt,
          message: `منبع رسمی ${source.shortCode} پاسخ ${response.status} داد؛ Rule فعال بدون تغییر باقی ماند.`,
        };
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const fingerprint: SourceFingerprint = {
        sha256,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        checkedAt,
      };
      const previous = this.observed.get(sourceId);
      this.observed.set(sourceId, fingerprint);
      source.lastCheckedAt = checkedAt;

      if (previous?.sha256 === sha256) {
        return {
          sourceId,
          status: "no_change_detected" as const,
          checkedAt,
          sha256,
          etag: fingerprint.etag,
          lastModified: fingerprint.lastModified,
          message: `در محتوای رسمی ${source.shortCode} نسبت به آخرین بررسی این سرویس تغییری تشخیص داده نشد. نسخه Rule فعال: ${getActiveClinicalRulePack().version}.`,
        };
      }

      const baselineOnly = !previous;
      return {
        sourceId,
        status: "queued_for_review" as const,
        checkedAt,
        sha256,
        previousSha256: previous?.sha256,
        etag: fingerprint.etag,
        lastModified: fingerprint.lastModified,
        message: baselineOnly
          ? `اثر انگشت منبع رسمی ${source.shortCode} ثبت شد. برای ایمنی، اولین مشاهده به‌عنوان baseline بازبینی می‌شود و هیچ Rule بالینی خودکار تغییر نکرد.`
          : `تغییر در منبع رسمی ${source.shortCode} تشخیص داده شد و برای استخراج/مقایسه Ruleها وارد صف بازبینی می‌شود؛ Rule فعال تا تایید بالینی بدون تغییر باقی می‌ماند.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      return {
        sourceId,
        status: "blocked" as const,
        checkedAt,
        message: `بررسی منبع رسمی ${source.shortCode} کامل نشد (${reason}). Rule فعال بدون تغییر باقی ماند.`,
      };
    }
  }
}
