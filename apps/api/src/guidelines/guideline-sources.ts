import type { GuidelineSource } from "@glymize/contracts";

export const guidelineSources: GuidelineSource[] = [
  {
    id: "ada-standards-2026-section-9",
    publisher: "ADA",
    title: "Pharmacologic Approaches to Glycemic Treatment",
    sourceUrl: "https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment",
    activeVersion: "Standards of Care 2026 / Section 9",
    publishedAt: "2025-12-08",
    monitored: true
  },
  {
    id: "easd-statements-guidelines",
    publisher: "EASD",
    title: "Statements & Guidelines",
    sourceUrl: "https://www.easd.org/guidelines/statements-guidelines/",
    activeVersion: "ADA/EASD Type 2 consensus reference (2022) + monitored EASD updates",
    publishedAt: "2022-09-23",
    monitored: true
  }
];
