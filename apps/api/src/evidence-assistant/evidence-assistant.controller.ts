import { Body, Controller, Get, Post } from "@nestjs/common";
import { EvidenceAssistantService } from "./evidence-assistant.service.js";

@Controller("v1/evidence-assistant")
export class EvidenceAssistantController {
  constructor(private readonly assistant: EvidenceAssistantService) {}

  @Get("status")
  status() {
    return this.assistant.status();
  }

  @Post("ask")
  ask(@Body() body: { question?: string; locale?: "fa" | "en" }) {
    return this.assistant.ask(body);
  }
}
