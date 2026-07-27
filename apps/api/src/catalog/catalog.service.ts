import { Injectable } from "@nestjs/common";
import type { CatalogImportRequest, CatalogImportResult, GenericMedication } from "@diabeto/contracts";

const initialGenerics: readonly GenericMedication[] = [
  {
    id: "empagliflozin",
    canonicalName: "Empagliflozin",
    persianName: "امپاگلیفلوزین",
    className: "SGLT2 inhibitor"
  }
];

@Injectable()
export class CatalogService {
  listGenerics() {
    return initialGenerics;
  }

  queueImport(request: CatalogImportRequest): CatalogImportResult {
    if (request.sourceKind !== "manual_csv" && !request.sourceUrl) {
      return {
        importId: crypto.randomUUID(),
        status: "blocked",
        message: "برای import خودکار باید URL یا API منبعِ تأییدشده ثبت شود."
      };
    }

    return {
      importId: crypto.randomUUID(),
      status: "queued",
      message: "ورود به صف رفت؛ هیچ برند تا زمان تطبیق و بازبینی ادمین منتشر نمی‌شود."
    };
  }
}
