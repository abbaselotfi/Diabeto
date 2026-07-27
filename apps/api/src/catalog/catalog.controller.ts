import { Body, Controller, Get, Post } from "@nestjs/common";
import type { CatalogImportRequest } from "@diabeto/contracts";
import { CatalogService } from "./catalog.service.js";

@Controller("v1")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("catalog/generics")
  generics() {
    return this.catalogService.listGenerics();
  }

  @Post("admin/catalog/imports")
  importCatalog(@Body() request: CatalogImportRequest) {
    return this.catalogService.queueImport(request);
  }
}
