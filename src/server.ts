/**
 * Server-side helpers for verifying elvix-issued session tokens.
 * Customer backends call `verifyElvixToken` with the request's
 * Authorization header. Bearer-token auth, no cookies.
 */

import type { ElvixVerifyResult } from "./types/index";

const DEFAULT_BASE_URL = "https://elvix.is";

export type VerifyOptions = {
  /** Application API key (Console → Credentials). */
  apiKey: string;
  /** Override the elvix origin for testing / proxy setups. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
};

/**
 * Exchange an end-user session token for the verified user envelope
 * (roles + scopes + memberships). Hit the `/api/v1/verify` endpoint
 * with the customer's Application API key.
 *
 * Returns a discriminated union — never throws on auth failure.
 * Throws only on infra failure (network, timeout, malformed JSON).
 */
export async function verifyElvixToken(
  token: string,
  opts: VerifyOptions,
): Promise<ElvixVerifyResult> {
  const url = `${opts.baseUrl ?? DEFAULT_BASE_URL}/api/v1/verify`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({ token }),
      signal: ctrl.signal,
    });
    const body = (await res.json()) as {
      success: boolean;
      data?: { user: import("./types/index").ElvixUser; roles: string[]; scopes: string[]; memberships: string[] };
      errorMessage?: string;
    };
    if (!res.ok || !body.success || !body.data) {
      return {
        ok: false,
        error: pickError(body.errorMessage, res.status),
        message: body.errorMessage,
      };
    }
    return {
      ok: true,
      user: body.data.user,
      roles: body.data.roles,
      scopes: body.data.scopes,
      memberships: body.data.memberships,
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
