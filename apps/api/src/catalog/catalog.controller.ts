import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { CatalogImportRequest, GenericMedicationInput, Type2ConsiderationRequest, UpdateMedicationInsuranceInput, UpdateMedicationVisibilityInput } from "@diabeto/contracts";
import { CatalogService } from "./catalog.service.js";

@Controller("v1")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("catalog/generics")
  generics(@Query("therapyGroup") therapyGroup?: string) {
    return this.catalogService.listGenerics(therapyGroup);
  }

  @Get("admin/catalog/reference-presentations")
  referencePresentations() {
    return this.catalogService.listGlobalReferencePresentations();
  }

  @Get("admin/catalog/reference-sources")
  referenceSources() {
    return this.catalogService.listGlobalReferenceSources();
  }

  @Get("admin/catalog/medication-checklist")
  medicationChecklist() {
    return this.catalogService.listMedicationChecklist();
  }

  @Patch("admin/catalog/medication-checklist/:referencePresentationId")
  updateMedicationChecklist(@Param("referencePresentationId") referencePresentationId: string, @Body() input: UpdateMedicationVisibilityInput) {
    return this.catalogService.updateMedicationVisibility(referencePresentationId, input);
  }

  @Patch("admin/catalog/medication-checklist/:referencePresentationId/insurance")
  updateMedicationInsurance(@Param("referencePresentationId") referencePresentationId: string, @Body() input: UpdateMedicationInsuranceInput) {
    return this.catalogService.updateMedicationInsurance(referencePresentationId, input);
  }

  @Get("protocols/type-2")
  type2Protocols() {
    return this.catalogService.listType2Protocols();
  }

  @Post("catalog/type-2/considerations")
  type2MedicationConsiderations(@Body() request: Type2ConsiderationRequest) {
    return this.catalogService.listType2MedicationConsiderations(request);
  }

  @Get("admin/preview/type-2-considerations")
  type2PreviewConsiderations() {
    return this.catalogService.listType2PreviewConsiderations();
  }

  @Post("admin/catalog/generics")
  addGeneric(@Body() input: GenericMedicationInput) {
    return this.catalogService.addGenericMedication(input);
  }

  @Post("admin/catalog/imports")
  importCatalog(@Body() request: CatalogImportRequest) {
    return this.catalogService.queueImport(request);
  }
}
