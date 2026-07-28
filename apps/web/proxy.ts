import { NextResponse, type NextRequest } from "next/server";

/**
 * Fail closed in production until the verified-doctor session service exists.
 * Local developers may explicitly enable the temporary bypass in .env.local.
 */
export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();
  const developmentBypass = process.env.NODE_ENV !== "production" && process.env.DIABETO_DEV_ADMIN_BYPASS === "true";
  if (developmentBypass) return NextResponse.next();

  const deniedUrl = request.nextUrl.clone();
  deniedUrl.pathname = "/access-denied";
  return NextResponse.rewrite(deniedUrl);
}

export const config = { matcher: ["/admin/:path*"] };
