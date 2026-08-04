import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AdminNotification, CatalogImportRequest, CreateAdminNotificationInput, CreateMedicationBrandInput, GenericMedicationInput, MedicationMarketDataInput, Type2ConsiderationRequest, UpdateMedicationBrandInput, UpdateMedicationInsuranceInput, UpdateMedicationVisibilityInput } from "@glymize/contracts";
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

  @Patch("admin/catalog/medication-checklist/:referencePresentationId/market-data")
  updateMedicationMarketData(@Param("referencePresentationId") referencePresentationId: string, @Body() input: MedicationMarketDataInput) {
    return this.catalogService.updateMedicationMarketData(referencePresentationId, input);
  }

  @Get("admin/notifications")
  notifications() {
    return this.catalogService.listNotifications();
  }

  @Post("admin/notifications")
  createNotification(@Body() input: CreateAdminNotificationInput) {
    return this.catalogService.createNotification(input);
  }

  @Patch("admin/notifications/:notificationId")
  updateNotification(@Param("notificationId") notificationId: string, @Body() input: { status: AdminNotification["status"] }) {
    return this.catalogService.updateNotification(notificationId, input.status);
  }

  @Get("admin/catalog/update-runs")
  updateRuns() {
    return [];
  }

  @Post("admin/catalog/medication-checklist/:referencePresentationId/brands")
  addMedicationBrand(@Param("referencePresentationId") referencePresentationId: string, @Body() input: CreateMedicationBrandInput) {
    return this.catalogService.addMedicationBrand(referencePresentationId, input);
  }

  @Patch("admin/catalog/medication-checklist/:referencePresentationId/brands/:brandId")
  updateMedicationBrand(@Param("referencePresentationId") referencePresentationId: string, @Param("brandId") brandId: string, @Body() input: UpdateMedicationBrandInput) {
    return this.catalogService.updateMedicationBrand(referencePresentationId, brandId, input);
  }

  @Delete("admin/catalog/medication-checklist/:referencePresentationId/brands/:brandId")
  removeMedicationBrand(@Param("referencePresentationId") referencePresentationId: string, @Param("brandId") brandId: string) {
    return this.catalogService.removeMedicationBrand(referencePresentationId, brandId);
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
