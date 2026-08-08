import { Module } from "@nestjs/common";
import { EvidenceAssistantController } from "./evidence-assistant.controller.js";
import { EvidenceAssistantService } from "./evidence-assistant.service.js";

@Module({
  controllers: [EvidenceAssistantController],
  providers: [EvidenceAssistantService],
})
export class EvidenceAssistantModule {}
