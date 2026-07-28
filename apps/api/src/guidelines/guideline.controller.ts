import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AdminAccessGuard } from "../admin/admin-access.guard.js";
import { GuidelineService } from "./guideline.service.js";

@Controller("v1/admin/guidelines")
@UseGuards(AdminAccessGuard)
export class GuidelineController {
  constructor(private readonly guidelineService: GuidelineService) {}

  @Get()
  sources() {
    return this.guidelineService.listSources();
  }

  @Post(":sourceId/check")
  check(@Param("sourceId") sourceId: string) {
    return this.guidelineService.checkForUpdate(sourceId);
  }
}
