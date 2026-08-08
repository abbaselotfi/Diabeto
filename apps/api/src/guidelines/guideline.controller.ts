import { Controller, Get, Param, Post } from "@nestjs/common";
import { GuidelineService } from "./guideline.service.js";

@Controller("v1/admin/guidelines")
export class GuidelineController {
  constructor(private readonly guidelineService: GuidelineService) {}

  @Get()
  sources() {
    return this.guidelineService.listSources();
  }

  @Get("rule-pack")
  rulePack() {
    return this.guidelineService.activeRulePack();
  }

  @Post(":sourceId/check")
  check(@Param("sourceId") sourceId: string) {
    return this.guidelineService.checkForUpdate(sourceId);
  }
}
