import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { CatalogImportRequest, GenericMedicationInput } from "@diabeto/contracts";
import { AdminAccessGuard } from "../admin/admin-access.guard.js";
import { CatalogService } from "./catalog.service.js";

@Controller("v1")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("catalog/generics")
  generics(@Query("therapyGroup") therapyGroup?: string) {
    return this.catalogService.listGenerics(therapyGroup);
  }

  @Get("protocols/type-2")
  type2Protocols() {
    return this.catalogService.listType2Protocols();
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
