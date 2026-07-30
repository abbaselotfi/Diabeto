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

interface CatalogState {
  visibility: Record<string, boolean>;
  insurance: Record<string, Array<{ provider: string; percent: number }>>;
  brands: Record<string, Array<{
    id: string;
    name: string;
    showInsteadOfGeneric: boolean;
    priority: number;
    customInsurance: boolean;
    insuranceCoverages: Array<{ provider: string; percent: number }>;
  }>>;
  customGenerics: unknown[];
}

const githubHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "DiaYar-Admin-Worker"
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
  const coverage = value as { provider?: unknown; percent?: unknown };
  return typeof coverage.provider === "string" &&
    typeof coverage.percent === "number" &&
    Number.isFinite(coverage.percent) &&
    coverage.percent >= 0 &&
    coverage.percent <= 100;
}

function validCatalog(value: unknown): value is CatalogState {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<CatalogState>;
  if (!catalog.visibility || !catalog.insurance || !catalog.brands || !Array.isArray(catalog.customGenerics)) return false;
  if (Object.values(catalog.visibility).some((visible) => typeof visible !== "boolean")) return false;
  if (Object.values(catalog.insurance).some((coverages) => !Array.isArray(coverages) || coverages.some((coverage) => !validCoverage(coverage)))) return false;
  return !Object.values(catalog.brands).some((brands) => !Array.isArray(brands) || brands.some((brand) =>
    !brand ||
    typeof brand.id !== "string" ||
    typeof brand.name !== "string" ||
    brand.name.length > 160 ||
    typeof brand.showInsteadOfGeneric !== "boolean" ||
    typeof brand.priority !== "number" ||
    typeof brand.customInsurance !== "boolean" ||
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
    schemaVersion: 1,
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    updatedBy: session.login,
    ...payload.catalog
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
      message: "Publish DiaYar admin catalog",
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
