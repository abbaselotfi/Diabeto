import { Module } from "@nestjs/common";
import { AdminAccessGuard } from "../admin/admin-access.guard.js";
import { GuidelineController } from "./guideline.controller.js";
import { GuidelineService } from "./guideline.service.js";

@Module({
  controllers: [GuidelineController],
  providers: [AdminAccessGuard, GuidelineService]
})
export class GuidelineModule {}
