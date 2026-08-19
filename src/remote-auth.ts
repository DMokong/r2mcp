/**
 * SPEC-059 (Task 05) — the MCP authorization spec's RESOURCE-SERVER role.
 *
 * This module does exactly one thing: turn an env-configured external
 * authorization server into (a) the metadata this server must publish per
 * RFC 9728 and (b) a token verifier the SDK's `requireBearerAuth` middleware
 * can call. There is deliberately NO token issuance, no session store, no user
 * model, no dynamic-client-registration proxying and no refresh flow — the AS
 * owns all of that (spec.md Anti-Patterns: "hand-rolled OAuth"; the sanctioned
 * pattern is verification via standard libraries, which is what `jose` is
 * doing below).
 *
 * Why this exists at all, given the Cloudflare edge in front of the tunnel:
 * claude.ai's connector flow hard-requires a 401 carrying
 * `WWW-Authenticate: Bearer resource_metadata="…"` and Cloudflare Access's
 * Managed OAuth does not emit it (anthropics/claude-ai-mcp#410). Owning the
 * resource-server role here makes the contract true regardless of what sits at
 * the edge — and makes the server safe if the tunnel is ever reached directly.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { OAuthMetadataSchema, type OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

/** Wall-clock budget for each authorization-server metadata fetch at startup. */
const DEFAULT_METADATA_TIMEOUT_MS = 10_000;

export interface RemoteAuthOptions {
  /** `R2MCP_OAUTH_ISSUER` — the authorization server's issuer identifier. */
  issuer: string;
  /** `R2MCP_OAUTH_AUDIENCE` — this resource server's canonical identifier. */
  audience: string;
  /** Per-request timeout for the startup metadata fetch (tests keep it short). */
  timeoutMs?: number;
}

export interface RemoteAuth {
  /**
   * The authorization server's own published metadata, passed through verbatim
   * to the SDK's `mcpAuthMetadataRouter` — which is what makes
   * `authorization_servers` in the protected-resource document name the real
   * issuer rather than a value we invented.
   */
  oauthMetadata: OAuthMetadata;
  /** This resource server's identifier, i.e. `R2MCP_OAUTH_AUDIENCE`. */
  resourceServerUrl: URL;
  /** RFC 9728 metadata URL, for `WWW-Authenticate`'s `resource_metadata`. */
  resourceMetadataUrl: string;
  /** The SDK's slim token-verifier interface — validation only. */
  verifier: OAuthTokenVerifier;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Trailing slashes are not significant when comparing issuer identifiers:
 * Auth0 publishes `https://tenant.auth0.com/` while tokens minted by it may
 * carry either form, and `new URL(...).href` always appends one. Compare on the
 * canonical (slash-stripped) form, but keep BOTH literal spellings in the set
 * of issuers we accept in a token's `iss` claim.
 */
function canonicalIssuer(value: string): string {
  return value.replace(/\/+$/, '');
}

function wellKnown(issuer: URL, suffix: string): URL {
  return new URL(`${canonicalIssuer(issuer.href)}${suffix}`);
}

async function fetchJson(url: URL, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

interface DiscoveredAuthorizationServer {
  metadata: OAuthMetadata;
  jwksUri: URL;
}

/**
 * Fetches the issuer's authorization-server metadata: RFC 8414 first, OIDC
 * discovery as the documented fallback. Every candidate must (1) parse as the
 * SDK's own `OAuthMetadataSchema`, (2) claim the issuer we actually configured
 * — the standard issuer mix-up defence, and the reason a copy-pasted wrong
 * `R2MCP_OAUTH_ISSUER` dies at boot instead of at the first token — and (3)
 * publish a `jwks_uri` (kept by the schema, which is a loose object).
 */
async function discoverAuthorizationServer(
  issuer: URL,
  timeoutMs: number,
): Promise<DiscoveredAuthorizationServer> {
  const candidates = [
    wellKnown(issuer, '/.well-known/oauth-authorization-server'),
    wellKnown(issuer, '/.well-known/openid-configuration'),
  ];

  const failures: string[] = [];
  for (const candidate of candidates) {
    let raw: unknown;
    try {
      raw = await fetchJson(candidate, timeoutMs);
    } catch (err) {
      failures.push(`${candidate.href}: ${errMsg(err)}`);
      continue;
    }

    const parsed = OAuthMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      failures.push(`${candidate.href}: not valid authorization-server metadata`);
      continue;
    }
    const metadata = parsed.data;

    if (canonicalIssuer(metadata.issuer) !== canonicalIssuer(issuer.href)) {
      failures.push(
        `${candidate.href}: document claims issuer ${JSON.stringify(metadata.issuer)}, ` +
          `which is not the configured issuer ${JSON.stringify(issuer.href)}`,
      );
      continue;
    }

    const jwksUri = (metadata as { jwks_uri?: unknown }).jwks_uri;
    if (typeof jwksUri !== 'string' || jwksUri.trim() === '') {
      failures.push(`${candidate.href}: no jwks_uri — signatures could not be verified`);
      continue;
    }

    return { metadata, jwksUri: new URL(jwksUri) };
  }

  throw new Error(
    `no usable authorization-server metadata for issuer ${issuer.href}. Tried:\n  - ` +
      failures.join('\n  - '),
  );
}

/** `scope` (RFC 8693 / OAuth) or `scp` (Entra ID) — both spellings occur. */
function scopesFromClaims(payload: JWTPayload): string[] {
  const scope = (payload as { scope?: unknown }).scope;
  if (typeof scope === 'string') return scope.split(' ').filter((s) => s.length > 0);
  const scp = (payload as { scp?: unknown }).scp;
  if (Array.isArray(scp)) return scp.filter((s): s is string => typeof s === 'string');
  return [];
}

/**
 * `AuthInfo.clientId` is required by the SDK. Different authorization servers
 * put the OAuth client in different claims; fall back to the subject so the
 * field is always populated with something meaningful for logs.
 */
function clientIdFromClaims(payload: JWTPayload): string {
  for (const claim of ['azp', 'client_id', 'cid'] as const) {
    const value = (payload as Record<string, unknown>)[claim];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return typeof payload.sub === 'string' ? payload.sub : '';
}

/**
 * Resolves the issuer's metadata and returns everything `src/remote.ts` needs
 * to mount the resource-server role. THROWS if the issuer cannot be discovered
 * — the caller turns that into a fail-loud, refuse-to-start exit, because a
 * server that cannot verify tokens must not accept requests.
 */
export async function createRemoteAuth(options: RemoteAuthOptions): Promise<RemoteAuth> {
  const issuerUrl = new URL(options.issuer);
  const resourceServerUrl = new URL(options.audience);

  const { metadata, jwksUri } = await discoverAuthorizationServer(
    issuerUrl,
    options.timeoutMs ?? DEFAULT_METADATA_TIMEOUT_MS,
  );

  // jose owns key fetching, caching and rotation-driven refetch; deliberately
  // no caching layer of our own on top of it.
  const jwks = createRemoteJWKSet(jwksUri);

  // Both literal spellings of the issuer are acceptable in a token's `iss`.
  const acceptedIssuers = Array.from(new Set([options.issuer, metadata.issuer, issuerUrl.href]));

  const verifier: OAuthTokenVerifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: JWTPayload;
      try {
        // Signature + `iss` + `aud` + `exp`/`nbf` are all checked here; jose
        // throws JWTExpired / JWTClaimValidationFailed /
        // JWSSignatureVerificationFailed as appropriate.
        ({ payload } = await jwtVerify(token, jwks, {
          issuer: acceptedIssuers,
          audience: options.audience,
        }));
      } catch (err) {
        // MUST be the SDK's own InvalidTokenError: `requireBearerAuth` maps
        // only that (and InsufficientScopeError) onto the
        // 401 + `WWW-Authenticate: … resource_metadata="…"` contract. Any other
        // throw falls through to its else branch and becomes a bare 500 with no
        // resource_metadata hint — i.e. exactly the failure mode that breaks
        // claude.ai's connector.
        throw new InvalidTokenError(errMsg(err));
      }

      // `requireBearerAuth` rejects an AuthInfo without a numeric expiresAt, so
      // surface the missing claim with an accurate message rather than letting
      // it report a generic "Token has no expiration time".
      if (typeof payload.exp !== 'number') {
        throw new InvalidTokenError('Token has no exp claim');
      }

      return {
        token,
        clientId: clientIdFromClaims(payload),
        scopes: scopesFromClaims(payload),
        expiresAt: payload.exp,
        extra: { sub: payload.sub },
      };
    },
  };

  return {
    oauthMetadata: metadata,
    resourceServerUrl,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
    verifier,
  };
}
