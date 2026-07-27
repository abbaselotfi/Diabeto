import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { CatalogImportRequest, GenericMedicationInput } from "@diabeto/contracts";
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
  addGeneric(@Body() input: GenericMedicationInput) {
    return this.catalogService.addGenericMedication(input);
  }

  @Post("admin/catalog/imports")
  importCatalog(@Body() request: CatalogImportRequest) {
    return this.catalogService.queueImport(request);
  }
}
