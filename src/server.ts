/**
 * Server-side helpers for verifying elvix-issued session tokens.
 * Customer backends call `verifyElvixToken` with the request's
 * Authorization header. Bearer-token auth, no cookies.
 */

import type { ElvixVerifyResult } from "./types/index";

const DEFAULT_BASE_URL = "https://elvix.is";

export type VerifyOptions = {
  /** Override the elvix origin for testing / proxy setups. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
};

/**
 * Verify an end-user session token (the value the SDK handed you via
 * `onSuccess({ token })`) and get back the live user envelope — roles,
 * scopes, memberships — for the token's application.
 *
 * The token is self-authenticating: POST it as a Bearer to
 * `/api/v1/session`. elvix re-checks the session and the user/membership
 * status on every call, so a banned, paused, or signed-out user verifies as
 * `ok:false` here within one request — call this on each protected request
 * (or cache for a few seconds) and you enforce bans server-side too.
 *
 * Returns a discriminated union — never throws on auth failure. Throws only
 * on infra failure (network, timeout, malformed JSON).
 */
export async function verifyElvixToken(
  token: string,
  opts: VerifyOptions = {},
): Promise<ElvixVerifyResult> {
  const url = `${opts.baseUrl ?? DEFAULT_BASE_URL}/api/v1/session`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
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
