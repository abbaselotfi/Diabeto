import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { CatalogImportRequest, GenericMedicationInput, Type2ConsiderationRequest, UpdateMedicationVisibilityInput } from "@diabeto/contracts";
import { AdminAccessGuard } from "../admin/admin-access.guard.js";
import { CatalogService } from "./catalog.service.js";

@Controller("v1")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("catalog/generics")
  generics(@Query("therapyGroup") therapyGroup?: string) {
    return this.catalogService.listGenerics(therapyGroup);
  }

  @Get("admin/catalog/reference-presentations")
  @UseGuards(AdminAccessGuard)
  referencePresentations() {
    return this.catalogService.listGlobalReferencePresentations();
  }

  @Get("admin/catalog/reference-sources")
  @UseGuards(AdminAccessGuard)
  referenceSources() {
    return this.catalogService.listGlobalReferenceSources();
  }

  @Get("admin/catalog/medication-checklist")
  @UseGuards(AdminAccessGuard)
  medicationChecklist() {
    return this.catalogService.listMedicationChecklist();
  }

  @Patch("admin/catalog/medication-checklist/:referencePresentationId")
  @UseGuards(AdminAccessGuard)
  updateMedicationChecklist(@Param("referencePresentationId") referencePresentationId: string, @Body() input: UpdateMedicationVisibilityInput) {
    return this.catalogService.updateMedicationVisibility(referencePresentationId, input);
  }

  @Get("protocols/type-2")
  type2Protocols() {
    return this.catalogService.listType2Protocols();
  }

  @Post("catalog/type-2/considerations")
  type2MedicationConsiderations(@Body() request: Type2ConsiderationRequest) {
    return this.catalogService.listType2MedicationConsiderations(request);
  }

  @Post("admin/catalog/generics")
  @UseGuards(AdminAccessGuard)
  addGeneric(@Body() input: GenericMedicationInput) {
    return this.catalogService.addGenericMedication(input);
  }

  @Post("admin/catalog/imports")
  @UseGuards(AdminAccessGuard)
  importCatalog(@Body() request: CatalogImportRequest) {
    return this.catalogService.queueImport(request);
  }
}
