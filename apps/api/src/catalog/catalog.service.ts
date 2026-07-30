import { Injectable } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
import { buildType2Assessment, buildType2MedicationConsiderations } from "@diabeto/clinical-engine";
import type {
  CatalogImportRequest,
  CatalogImportResult,
  CreateMedicationBrandInput,
  GenericMedication,
  GenericMedicationInput,
  InsuranceCoverage,
  MedicationChecklistItem,
  MedicationBrand,
  Type2ConsiderationRequest,
  UpdateMedicationInsuranceInput,
  UpdateMedicationBrandInput,
  UpdateMedicationVisibilityInput
} from "@diabeto/contracts";
import { ada2026Type2GenericSeed, type2ProtocolSeed } from "./ada-2026-type2-seed.js";
import { globalReferenceCatalogue, globalReferenceCatalogueSources } from "./global-reference-catalog.js";

@Injectable()
export class CatalogService {
  private readonly genericMedications: GenericMedication[] = [...ada2026Type2GenericSeed];
  private readonly referenceVisibility = new Map(globalReferenceCatalogue.map((presentation) => [presentation.id, true]));
  private readonly referenceInsurance = new Map<string, InsuranceCoverage[]>();
  private readonly referenceBrands = new Map<string, MedicationBrand[]>();

  listGenerics(therapyGroup?: string) {
    return therapyGroup ? this.genericMedications.filter((medication) => medication.therapyGroup === therapyGroup) : this.genericMedications;
  }

  listType2Protocols() {
    return type2ProtocolSeed;
  }

  listType2MedicationConsiderations(request: Type2ConsiderationRequest) {
    const visible = this.genericMedications.filter((medication) => this.isGenericMedicationVisible(medication));
    const presentations = Object.fromEntries(visible.map((medication) => [medication.id, this.resolveMedicationDisplay(medication)]));
    const insuranceCoverageByMedicationId = Object.fromEntries(visible.map((medication) => [medication.id, presentations[medication.id]!.insuranceCoverages]));
    const assessment = buildType2Assessment(visible, { ...request, insuranceCoverageByMedicationId });
    return {
      ...assessment,
      medications: assessment.medications.map((medication) => ({
        ...medication,
        displayName: presentations[medication.genericMedicationId]?.displayName ?? medication.persianName,
        selectedBrandName: presentations[medication.genericMedicationId]?.selectedBrandName
      }))
    };
  }

  listType2PreviewConsiderations() {
    return buildType2MedicationConsiderations(this.genericMedications, {
      currentHba1c: 8,
      targetHba1c: 7,
      workflow: "initiation",
      factors: []
    });
  }

  private isGenericMedicationVisible(medication: GenericMedication): boolean {
    // A guideline-seeded generic with no equivalent imported presentation is
    // not exposed until it is explicitly added/reviewed through the catalogue.
    return this.matchingReferences(medication).some((item) => this.referenceVisibility.get(item.id) === true);
  }

  private matchingReferences(medication: GenericMedication) {
    const medicationTerms = this.normalizedTerms(medication.canonicalName);
    return globalReferenceCatalogue.filter((presentation) => {
      const referenceTerms = this.normalizedTerms(presentation.genericName);
      return medicationTerms.some((term) => referenceTerms.includes(term));
    });
  }

  private resolveMedicationDisplay(medication: GenericMedication) {
    const references = this.matchingReferences(medication);
    const brands = references.flatMap((item) => this.referenceBrands.get(item.id) ?? []);
    const selectedBrand = [...brands].filter((brand) => brand.showInsteadOfGeneric && brand.name.trim()).sort((left, right) => left.priority - right.priority)[0];
    const genericCoverage = references.flatMap((item) => this.referenceInsurance.get(item.id) ?? []);
    return {
      displayName: selectedBrand?.name.trim() || medication.persianName,
      selectedBrandName: selectedBrand?.name.trim(),
      insuranceCoverages: selectedBrand?.customInsurance ? selectedBrand.insuranceCoverages : genericCoverage
    };
  }

  private normalizedTerms(value: string): string[] {
    return value
      .toLocaleLowerCase()
      .replace(/[^a-z]+/g, " ")
      .split(" ")
      .filter((term) => term.length >= 5);
  }

  listGlobalReferencePresentations() {
    return globalReferenceCatalogue;
  }

  listMedicationChecklist(): MedicationChecklistItem[] {
    return globalReferenceCatalogue.map((presentation) => ({
      referencePresentationId: presentation.id,
      genericName: presentation.genericName,
      therapeuticClass: presentation.therapeuticClass,
      administrationRoute: presentation.administrationRoute,
      dosageForm: presentation.dosageForm,
      strengthPresentation: presentation.strengthPresentation,
      sourceUrl: presentation.sourceUrl,
      reviewState: presentation.reviewState,
      showInApp: this.referenceVisibility.get(presentation.id) ?? false
      ,
      insuranceCoverages: this.referenceInsurance.get(presentation.id) ?? [],
      brands: this.referenceBrands.get(presentation.id) ?? []
    }));
  }

  updateMedicationInsurance(referencePresentationId: string, input: UpdateMedicationInsuranceInput): MedicationChecklistItem {
    const presentation = globalReferenceCatalogue.find((item) => item.id === referencePresentationId);
    if (!presentation) throw new NotFoundException("رکورد مرجع دارو پیدا نشد.");
    if (!input.enabled) this.referenceInsurance.delete(referencePresentationId);
    else {
      if (!input.provider || input.percent === undefined || input.percent < 0 || input.percent > 100) {
        throw new NotFoundException("ارگان بیمه و درصد معتبر بین صفر تا صد لازم است.");
      }
      const current = this.referenceInsurance.get(referencePresentationId) ?? [];
      this.referenceInsurance.set(referencePresentationId, [...current.filter((item) => item.provider !== input.provider), { provider: input.provider, percent: input.percent }]);
    }
    return this.listMedicationChecklist().find((item) => item.referencePresentationId === referencePresentationId)!;
  }

  addMedicationBrand(referencePresentationId: string, input: CreateMedicationBrandInput): MedicationChecklistItem {
    const presentation = globalReferenceCatalogue.find((item) => item.id === referencePresentationId);
    if (!presentation) throw new NotFoundException("رکورد مرجع دارو پیدا نشد.");
    const current = this.referenceBrands.get(referencePresentationId) ?? [];
    this.referenceBrands.set(referencePresentationId, [...current, {
      id: crypto.randomUUID(),
      name: input.name?.trim() ?? "",
      showInsteadOfGeneric: false,
      priority: current.length + 1,
      customInsurance: false,
      insuranceCoverages: []
    }]);
    return this.listMedicationChecklist().find((item) => item.referencePresentationId === referencePresentationId)!;
  }

  updateMedicationBrand(referencePresentationId: string, brandId: string, input: UpdateMedicationBrandInput): MedicationChecklistItem {
    const current = this.referenceBrands.get(referencePresentationId) ?? [];
    const target = current.find((brand) => brand.id === brandId);
    if (!target) throw new NotFoundException("برند پیدا نشد.");
    let updated = current.map((brand) => brand.id === brandId ? { ...brand, ...input } : brand);
    if (input.priority !== undefined) {
      const selected = updated.find((brand) => brand.id === brandId)!;
      const without = updated.filter((brand) => brand.id !== brandId).sort((left, right) => left.priority - right.priority);
      without.splice(Math.max(0, Math.min(input.priority - 1, without.length)), 0, selected);
      updated = without.map((brand, index) => ({ ...brand, priority: index + 1 }));
    }
    this.referenceBrands.set(referencePresentationId, updated);
    return this.listMedicationChecklist().find((item) => item.referencePresentationId === referencePresentationId)!;
  }

  updateMedicationVisibility(referencePresentationId: string, input: UpdateMedicationVisibilityInput): MedicationChecklistItem {
    const presentation = globalReferenceCatalogue.find((item) => item.id === referencePresentationId);
    if (!presentation) throw new NotFoundException("رکورد مرجع دارو پیدا نشد.");
    this.referenceVisibility.set(referencePresentationId, input.showInApp);
    return this.listMedicationChecklist().find((item) => item.referencePresentationId === referencePresentationId)!;
  }

  listGlobalReferenceSources() {
    return globalReferenceCatalogueSources;
  }

  addGenericMedication(input: GenericMedicationInput): GenericMedication {
    const canonicalName = input.canonicalName.trim();
    const existing = this.genericMedications.find((medication) => medication.canonicalName.toLocaleLowerCase() === canonicalName.toLocaleLowerCase());
    if (existing) {
      return existing;
    }

    const id = canonicalName
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const medication: GenericMedication = { id, ...input, canonicalName, catalogStatus: "admin_added" };
    this.genericMedications.push(medication);
    return medication;
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
