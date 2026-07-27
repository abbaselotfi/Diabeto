import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [CatalogModule],
  controllers: [HealthController]
})
export class AppModule {}
