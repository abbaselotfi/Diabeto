import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { EvidenceAssistantModule } from "./evidence-assistant/evidence-assistant.module.js";
import { GuidelineModule } from "./guidelines/guideline.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [CatalogModule, GuidelineModule, EvidenceAssistantModule],
  controllers: [HealthController]
})
export class AppModule {}
