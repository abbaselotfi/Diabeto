import { NextResponse, type NextRequest } from "next/server";

/**
 * Pre-publication mode: every route remains available to the project owner.
 * This hook is intentionally a no-op until production authentication and RBAC
 * are enabled before publication.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}
