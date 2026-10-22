"use client";

import { dpopNonceAge, dpopProof } from "./dpop";
import { elvixFetch } from "./elvix-fetch";
import { getElvixToken } from "./session";

/**
 * DPoP for YOUR backend (0.16, RFC 9449). An app with DPoP on binds each
 * session to a key this browser holds and cannot export; elvix then refuses
 * the token alone. These two helpers let your own backend take part:
 *
 * - `elvixProof(url, { method, token })`: a proof for one request to YOUR
 *   route. Send it next to the token (a `DPoP` header, or an argument to a
 *   server action); your backend passes it to `verifyElvixToken({ token,
 *   proof, htm, htu })`. Only this browser can make one, so a token copied out
 *   of a cookie or a log is useless at your backend too.
 * - `exchangeElvixToken()`: the session token exchanged for a JWT your
 *   backend verifies locally (JWKS). A bound session gets a DPoP-bound JWT
 *   (`tokenType: "DPoP"`, `cnf.jkt`): send it as `Authorization: DPoP <jwt>`
 *   with `elvixProof(url, { method, token: jwt })`.
 *
 * Both answer null / `ok: false` where the browser holds no key or no session,
 * never throw.
 */

const DEFAULT_BASE_URL = "https://elvix.is";
/** elvix accepts a nonce for 5 to 10 minutes; fetch a new one past 4. */
const NONCE_FRESH_MS = 4 * 60_000;

/**
 * A proof your backend forwards to elvix, which cannot ask the browser for a
 * second one, so it must carry a live nonce the first time: one is fetched
 * from elvix (`/api/v1/dpop/nonce`) when this tab holds none or an old one.
 */
export async function elvixProof(
  url: string,
  opts: { method: string; token: string; baseUrl?: string },
): Promise<string | null> {
  if (dpopNonceAge() > NONCE_FRESH_MS) {
    await elvixFetch(`${opts.baseUrl ?? DEFAULT_BASE_URL}/api/v1/dpop/nonce`).catch(() => null);
  }
  return dpopProof(opts.method, url, opts.token);
}

export type ElvixJwt =
  | { ok: true; accessToken: string; tokenType: "Bearer" | "DPoP"; expiresAt: string }
  | { ok: false; error: string };

/** The signed-in session exchanged for a JWT (`POST /api/v1/token`), proved when DPoP is on. */
export async function exchangeElvixToken(opts: { baseUrl?: string } = {}): Promise<ElvixJwt> {
  const token = getElvixToken();
  if (!token) return { ok: false, error: "not_signed_in" };
  try {
    const res = await elvixFetch(`${opts.baseUrl ?? DEFAULT_BASE_URL}/api/v1/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as {
      ok?: boolean;
      error?: string;
      access_token?: string;
      token_type?: "Bearer" | "DPoP";
      expires_at?: string;
    };
    if (!body.ok || !body.access_token || !body.token_type || !body.expires_at) {
      return { ok: false, error: body.error ?? `http_${res.status}` };
    }
    return {
      ok: true,
      accessToken: body.access_token,
      tokenType: body.token_type,
      expiresAt: body.expires_at,
    };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
