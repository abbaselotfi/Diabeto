import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Production fails closed until the physician/administrator authentication
 * service is connected. The development bypass is intentionally server-only
 * and must never be used as a production access control mechanism.
 */
@Injectable()
export class AdminAccessGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("دسترسی مدیریت تا زمان فعال‌سازی احراز هویت نقش‌محور غیرفعال است.");
    }
    if (process.env.GLYMIZE_DEV_ADMIN_BYPASS !== "true") {
      throw new ForbiddenException("برای توسعهٔ محلی GLYMIZE_DEV_ADMIN_BYPASS=true را تنظیم کنید.");
    }
    return true;
  }
}
