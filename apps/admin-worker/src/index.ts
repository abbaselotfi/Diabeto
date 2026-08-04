interface Env {
  ADMIN_ORIGIN: string;
  ADMIN_PATH_PREFIX: string;
  ALLOWED_GITHUB_LOGIN: string;
  GITHUB_REPOSITORY: string;
  GITHUB_BRANCH: string;
  CATALOG_PATH: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

interface OAuthState {
  kind: "oauth_state";
  returnTo: string;
  expiresAt: number;
}

interface AdminSession {
  kind: "admin_session";
  login: string;
  githubToken: string;
  expiresAt: number;
}

interface CoverageState {
  provider: string;
  percent: number;
  origin?: string;
  genericCode?: string;
  brandCode?: string;
  insurerShareToman?: number;
  patientShareToman?: number;
  referencePriceToman?: number;
}

interface CatalogState {
  visibility: Record<string, boolean>;
  insurance: Record<string, CoverageState[]>;
  brands: Record<string, Array<{
    id: string;
    name: string;
    showInsteadOfGeneric: boolean;
    priority: number;
    customInsurance: boolean;
    insuranceCoverages: CoverageState[];
    genericRegistryCode?: string;
    brandRegistryCode?: string;
    price?: unknown;
    sourceDiscovered?: boolean;
    hiddenFromSource?: boolean;
  }>>;
  customGenerics: unknown[];
  marketData?: Record<string, unknown>;
  notifications?: unknown[];
  updateRuns?: unknown[];
}

const githubHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "GLYMIZE-Admin-Worker"
};

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sessionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function seal(payload: OAuthState | AdminSession, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionKey(secret);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  ));
  const token = new Uint8Array(iv.length + encrypted.length);
  token.set(iv);
  token.set(encrypted, iv.length);
  return base64UrlEncode(token);
}

async function open<T extends OAuthState | AdminSession>(token: string, secret: string): Promise<T | null> {
  try {
    const encoded = base64UrlDecode(token);
    const iv = encoded.slice(0, 12);
    const encrypted = encoded.slice(12);
    const key = await sessionKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    return null;
  }
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin === env.ADMIN_ORIGIN ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin"
  } : {};
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}

function validatedReturnTo(value: string | null, env: Env) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== env.ADMIN_ORIGIN || !url.pathname.startsWith(env.ADMIN_PATH_PREFIX)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function requireAdmin(request: Request, env: Env): Promise<AdminSession | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const session = await open<AdminSession>(token, env.SESSION_SECRET);
  if (!session || session.kind !== "admin_session" || session.expiresAt <= Date.now()) return null;
  if (session.login.toLocaleLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLocaleLowerCase()) return null;
  return session;
}

function validCoverage(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const coverage = value as Record<string, unknown>;
  const providers = ["social_security", "health_insurance", "armed_forces", "other_organizations", "supplementary"];
  const validOptionalCode = (key: string) => coverage[key] === undefined || (typeof coverage[key] === "string" && (coverage[key] as string).length <= 160);
  const validOptionalMoney = (key: string) => coverage[key] === undefined || (typeof coverage[key] === "number" && Number.isSafeInteger(coverage[key]) && (coverage[key] as number) >= 0);
  const validOptionalRawMoney = (key: string) => coverage[key] === undefined || (typeof coverage[key] === "number" && Number.isFinite(coverage[key]) && (coverage[key] as number) >= 0);
  return typeof coverage.provider === "string" && providers.includes(coverage.provider) &&
    typeof coverage.percent === "number" &&
    Number.isFinite(coverage.percent) &&
    coverage.percent >= 0 &&
    coverage.percent <= 100 &&
    (coverage.origin === undefined || coverage.origin === "source" || coverage.origin === "manual") &&
    validOptionalCode("genericCode") &&
    validOptionalCode("brandCode") &&
    validOptionalMoney("insurerShareToman") &&
    validOptionalMoney("patientShareToman") &&
    validOptionalMoney("referencePriceToman") &&
    (coverage.sourceCurrency === undefined || coverage.sourceCurrency === "IRR" || coverage.sourceCurrency === "TOMAN") &&
    validOptionalRawMoney("sourceInsurerShare") &&
    validOptionalRawMoney("sourcePatientShare") &&
    validOptionalRawMoney("sourceReferencePrice");
}

function validPrice(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const price = value as Record<string, unknown>;
  const validMoney = (amount: unknown) => typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0;
  return validMoney(price.amountToman) &&
    ["consumer_retail", "insurance_reference", "unknown"].includes(String(price.priceKind)) &&
    (price.manualOverrideToman === undefined || validMoney(price.manualOverrideToman)) &&
    (price.sourceCurrency === undefined || price.sourceCurrency === "IRR" || price.sourceCurrency === "TOMAN") &&
    (price.sourceUrl === undefined || (typeof price.sourceUrl === "string" && price.sourceUrl.length <= 2000));
}

function validMarketData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const market = value as Record<string, unknown>;
  const domains = ["diabetes", "cardiovascular", "kidney", "liver", "obesity"];
  return (market.displayMode === undefined || ["generic_or_primary_brand", "generic_with_selected_brands"].includes(String(market.displayMode))) &&
    (market.clinicalDomains === undefined || (Array.isArray(market.clinicalDomains) && market.clinicalDomains.every((domain) => domains.includes(String(domain))))) &&
    (market.genericRegistryCode === undefined || (typeof market.genericRegistryCode === "string" && market.genericRegistryCode.length <= 160)) &&
    (market.price === undefined || validPrice(market.price));
}

function validNotification(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const notification = value as Record<string, unknown>;
  return typeof notification.id === "string" && notification.id.length <= 100 &&
    ["info", "warning", "error"].includes(String(notification.severity)) &&
    ["unread", "read", "resolved"].includes(String(notification.status)) &&
    typeof notification.title === "string" && notification.title.length <= 240 &&
    typeof notification.message === "string" && notification.message.length <= 2000 &&
    typeof notification.createdAt === "string";
}

function validUpdateRun(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return typeof run.id === "string" && run.schemaVersion === 1 &&
    ["staging", "needs_review", "ready_to_publish", "published", "failed"].includes(String(run.status)) &&
    typeof run.startedAt === "string" && Array.isArray(run.sources) && run.sources.length <= 4 &&
    typeof run.summary === "object" && run.summary !== null;
}

function validCatalog(value: unknown): value is CatalogState {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<CatalogState>;
  if (!catalog.visibility || !catalog.insurance || !catalog.brands || !Array.isArray(catalog.customGenerics)) return false;
  if (catalog.marketData !== undefined && (!catalog.marketData || typeof catalog.marketData !== "object" || Array.isArray(catalog.marketData) || Object.values(catalog.marketData).some((item) => !validMarketData(item)))) return false;
  if (catalog.notifications !== undefined && (!Array.isArray(catalog.notifications) || catalog.notifications.length > 200 || catalog.notifications.some((item) => !validNotification(item)))) return false;
  if (catalog.updateRuns !== undefined && (!Array.isArray(catalog.updateRuns) || catalog.updateRuns.length > 24 || catalog.updateRuns.some((item) => !validUpdateRun(item)))) return false;
  if (Object.values(catalog.visibility).some((visible) => typeof visible !== "boolean")) return false;
  if (Object.values(catalog.insurance).some((coverages) => !Array.isArray(coverages) || coverages.some((coverage) => !validCoverage(coverage)))) return false;
  return !Object.values(catalog.brands).some((brands) => !Array.isArray(brands) || brands.some((brand) =>
    !brand ||
    typeof brand.id !== "string" ||
    typeof brand.name !== "string" ||
    brand.name.length > 160 ||
    typeof brand.showInsteadOfGeneric !== "boolean" ||
    typeof brand.priority !== "number" ||
    !Number.isSafeInteger(brand.priority) || brand.priority < 1 ||
    typeof brand.customInsurance !== "boolean" ||
    (brand.genericRegistryCode !== undefined && (typeof brand.genericRegistryCode !== "string" || brand.genericRegistryCode.length > 160)) ||
    (brand.brandRegistryCode !== undefined && (typeof brand.brandRegistryCode !== "string" || brand.brandRegistryCode.length > 160)) ||
    (brand.price !== undefined && !validPrice(brand.price)) ||
    (brand.sourceDiscovered !== undefined && typeof brand.sourceDiscovered !== "boolean") ||
    (brand.hiddenFromSource !== undefined && typeof brand.hiddenFromSource !== "boolean") ||
    !Array.isArray(brand.insuranceCoverages) ||
    brand.insuranceCoverages.some((coverage) => !validCoverage(coverage))
  ));
}

function utf8Base64(value: string) {
  const encoded = base64UrlEncode(new TextEncoder().encode(value))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
}

async function startAuthentication(request: Request, env: Env) {
  const url = new URL(request.url);
  const returnTo = validatedReturnTo(url.searchParams.get("return_to"), env);
  if (!returnTo) return json(request, env, { error: "invalid_return_url" }, 400);
  const redirectUri = `${url.origin}/auth/callback`;
  const state = await seal({
    kind: "oauth_state",
    returnTo,
    expiresAt: Date.now() + 10 * 60 * 1000
  }, env.SESSION_SECRET);
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "read:user public_repo");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("login", env.ALLOWED_GITHUB_LOGIN);
  return Response.redirect(authorizationUrl.toString(), 302);
}

async function completeAuthentication(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken) return json(request, env, { error: "oauth_callback_incomplete" }, 400);
  const state = await open<OAuthState>(stateToken, env.SESSION_SECRET);
  if (!state || state.kind !== "oauth_state" || state.expiresAt <= Date.now()) {
    return json(request, env, { error: "oauth_state_invalid" }, 400);
  }
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`
    })
  });
  const tokenResult = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokenResult.access_token) {
    return json(request, env, { error: tokenResult.error ?? "oauth_exchange_failed" }, 502);
  }
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { ...githubHeaders, authorization: `Bearer ${tokenResult.access_token}` }
  });
  const user = await userResponse.json() as { login?: string };
  if (!userResponse.ok || !user.login || user.login.toLocaleLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLocaleLowerCase()) {
    return json(request, env, { error: "github_account_not_allowed" }, 403);
  }
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const session = await seal({
    kind: "admin_session",
    login: user.login,
    githubToken: tokenResult.access_token,
    expiresAt
  }, env.SESSION_SECRET);
  const returnUrl = new URL(state.returnTo);
  returnUrl.hash = new URLSearchParams({ auth_session: session }).toString();
  return Response.redirect(returnUrl.toString(), 302);
}

async function publishCatalog(request: Request, env: Env, session: AdminSession) {
  const raw = await request.text();
  if (raw.length > 1_500_000) return json(request, env, { error: "catalog_too_large" }, 413);
  let payload: { catalog?: unknown };
  try {
    payload = JSON.parse(raw) as { catalog?: unknown };
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  if (!validCatalog(payload.catalog)) return json(request, env, { error: "invalid_catalog" }, 400);

  const publishedCatalog = {
    ...payload.catalog,
    schemaVersion: 2,
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    updatedBy: session.login
  };
  const contentsUrl = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/contents/${env.CATALOG_PATH}`;
  const currentResponse = await fetch(`${contentsUrl}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, {
    headers: { ...githubHeaders, authorization: `Bearer ${session.githubToken}` }
  });
  const current = currentResponse.ok ? await currentResponse.json() as { sha?: string } : null;
  if (!currentResponse.ok && currentResponse.status !== 404) {
    return json(request, env, { error: "github_catalog_read_failed" }, 502);
  }
  const updateResponse = await fetch(contentsUrl, {
    method: "PUT",
    headers: {
      ...githubHeaders,
      authorization: `Bearer ${session.githubToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: "Publish GLYMIZE admin catalog",
      content: utf8Base64(`${JSON.stringify(publishedCatalog, null, 2)}\n`),
      branch: env.GITHUB_BRANCH,
      ...(current?.sha ? { sha: current.sha } : {})
    })
  });
  const update = await updateResponse.json() as {
    message?: string;
    commit?: { sha?: string; html_url?: string };
  };
  if (!updateResponse.ok || !update.commit?.sha) {
    return json(request, env, { error: update.message ?? "github_catalog_update_failed" }, updateResponse.status === 409 ? 409 : 502);
  }
  return json(request, env, {
    commitSha: update.commit.sha,
    commitUrl: update.commit.html_url ?? "",
    message: "Catalog committed; GitHub Pages deployment started."
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (request.headers.get("origin") !== env.ADMIN_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method === "GET" && url.pathname === "/auth/start") return startAuthentication(request, env);
    if (request.method === "GET" && url.pathname === "/auth/callback") return completeAuthentication(request, env);

    const session = await requireAdmin(request, env);
    if (!session) return json(request, env, { error: "admin_auth_required" }, 401);
    if (request.method === "GET" && url.pathname === "/session") {
      return json(request, env, { login: session.login, expiresAt: new Date(session.expiresAt).toISOString() });
    }
    if (request.method === "POST" && url.pathname === "/catalog/publish") {
      return publishCatalog(request, env, session);
    }
    return json(request, env, { error: "not_found" }, 404);
  }
} satisfies ExportedHandler<Env>;
