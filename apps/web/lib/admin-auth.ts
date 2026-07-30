const adminApiUrl = process.env.NEXT_PUBLIC_ADMIN_API_URL?.replace(/\/$/, "") ?? "";
const sessionStorageKey = "diayar-admin-session";

export interface AdminIdentity {
  login: string;
  expiresAt: string;
}

export interface CatalogPublishResult {
  commitSha: string;
  commitUrl: string;
  message: string;
}

export function isAdminApiConfigured() {
  return Boolean(adminApiUrl);
}

export function consumeAdminSessionFromLocation() {
  if (typeof window === "undefined") return null;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const session = fragment.get("auth_session");
  if (!session) return null;
  window.sessionStorage.setItem(sessionStorageKey, session);
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  return session;
}

export function getAdminSession() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(sessionStorageKey);
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(sessionStorageKey);
}

export function getAdminLoginUrl(returnTo: string) {
  if (!adminApiUrl) return "";
  const url = new URL(`${adminApiUrl}/auth/start`);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

async function authenticatedFetch(path: string, init?: RequestInit) {
  const session = getAdminSession();
  if (!adminApiUrl || !session) throw new Error("admin_auth_required");
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${session}`);
  headers.set("content-type", "application/json");
  return fetch(`${adminApiUrl}${path}`, { ...init, headers, cache: "no-store" });
}

export async function getAdminIdentity(): Promise<AdminIdentity> {
  const response = await authenticatedFetch("/session");
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearAdminSession();
    throw new Error("admin_auth_invalid");
  }
  return response.json() as Promise<AdminIdentity>;
}

export async function publishAdminCatalog(catalog: unknown): Promise<CatalogPublishResult> {
  const response = await authenticatedFetch("/catalog/publish", {
    method: "POST",
    body: JSON.stringify({ catalog })
  });
  const result = await response.json() as CatalogPublishResult & { error?: string };
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearAdminSession();
    throw new Error(result.error ?? "catalog_publish_failed");
  }
  return result;
}
