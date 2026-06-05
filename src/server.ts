/**
 * Server-side helpers for elvix integrations.
 *
 *   - `verifyElvixToken`   end-user session token → live user envelope
 *   - `verifyElvixWebhook` HMAC-verify an inbound webhook delivery and
 *                          get a typed `ElvixWebhookEvent` back
 */

import type { ElvixVerifyResult } from "./types/index";

export { verifyElvixWebhook } from "./server/webhook";
export type { VerifyWebhookArgs } from "./server/webhook";
export type {
  ElvixWebhookEvent,
  ElvixWebhookVerifyResult,
  UserLifecycleData,
  UserMembershipData,
  UserProfileData,
  UserRef,
  UserRoleData,
  UserScopeData,
  UserSignedInData,
  UserSignedOutData,
} from "./types/webhook";
export { ElvixWebhookEventType } from "./types/webhook";

const DEFAULT_BASE_URL = "https://elvix.is";

export type VerifyOptions = {
  /** Override the elvix origin for testing / proxy setups. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
};

export type VerifyArgs = {
  /** End-user session token. The value the SDK handed you via `onResult({ token })`. */
  token: string;
  /** Your Application's client ID. Optional, but recommended — lets elvix scope
   *  the verify against the right application when one user spans multiple. */
  clientId?: string;
  /** Override the elvix origin for testing / proxy setups. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
};

/**
 * Verify an end-user session token (the value the SDK handed you via
 * `onResult({ token })`) and get back the live user envelope — roles,
 * scopes, memberships — for the token's application.
 *
 * The token is self-authenticating: POST it as a Bearer to
 * `/api/v1/session`. elvix re-checks the session and the user/membership
 * status on every call, so a banned, paused, or signed-out user verifies as
 * `ok:false` here within one request — call this on each protected request
 * (or cache for a few seconds) and you enforce bans server-side too.
 *
 * Two call shapes — both supported, the object form is the canonical one
 * since 0.6.5:
 *
 *   await verifyElvixToken({ token, clientId })   // canonical
 *   await verifyElvixToken(token)                 // legacy, still works
 *
 * Returns a discriminated union — never throws on auth failure. Throws only
 * on infra failure (network, timeout, malformed JSON).
 */
export async function verifyElvixToken(args: VerifyArgs): Promise<ElvixVerifyResult>;
export async function verifyElvixToken(
  token: string,
  opts?: VerifyOptions,
): Promise<ElvixVerifyResult>;
export async function verifyElvixToken(
  tokenOrArgs: string | VerifyArgs,
  opts: VerifyOptions = {},
): Promise<ElvixVerifyResult> {
  const args: VerifyArgs =
    typeof tokenOrArgs === "string"
      ? { token: tokenOrArgs, baseUrl: opts.baseUrl, timeoutMs: opts.timeoutMs }
      : tokenOrArgs;
  const { token, clientId } = args;
  const url = `${args.baseUrl ?? DEFAULT_BASE_URL}/api/v1/session`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 5000);
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    if (clientId) headers["x-elvix-client-id"] = clientId;
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
    });
    const body = (await res.json()) as {
      ok?: boolean;
      userId?: string;
      email?: string;
      name?: string | null;
      avatarUrl?: string | null;
      roles?: string[];
      scopes?: string[];
      memberships?: string[];
      membershipBrands?: { slug: string; name: string; logoUrl: string | null }[];
      error?: string;
    };
    if (!res.ok || !body.ok || !body.userId) {
      return {
        ok: false,
        error: pickError(body.error, res.status),
        message: body.error,
      };
    }
    return {
      ok: true,
      user: {
        id: body.userId,
        email: body.email ?? "",
        name: body.name ?? undefined,
        avatarUrl: body.avatarUrl ?? undefined,
      },
      roles: body.roles ?? [],
      scopes: body.scopes ?? [],
      memberships: body.memberships ?? [],
      membershipBrands: body.membershipBrands ?? [],
    };
  } finally {
    clearTimeout(timer);
  }
}

function pickError(
  raw: string | undefined,
  status: number,
): import("./types/index").ElvixVerifyErr["error"] {
  if (raw === "expired" || raw === "revoked" || raw === "membership_blocked" || raw === "rate_limited") {
    return raw;
  }
  if (status === 401) return "invalid_token";
  if (status === 403) return "membership_blocked";
  if (status === 429) return "rate_limited";
  return "invalid_token";
}
