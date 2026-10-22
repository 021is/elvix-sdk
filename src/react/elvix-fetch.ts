"use client";

import { currentDpopNonce, dpopProof, rememberDpopNonce } from "./dpop";

/**
 * Every SDK call to elvix goes through here. A call carrying the session token
 * as a bearer also carries a DPoP proof (./dpop.ts), and elvix's latest nonce
 * is kept from every answer. When elvix refuses a proved call (401) and its
 * answer carries a fresher nonce (the first call after a page load, or a
 * window turning over), the call is made once more with it.
 *
 * A call that FINISHES a sign-in (`SIGN_IN_FINISHERS`, 0.16) carries a proof
 * too, with no token in it yet: elvix binds the session it mints to this
 * browser's key at once, so a token taken before its first call cannot be
 * bound to someone else's key. The list is here, not at the call sites, so a
 * sign-in method cannot forget it.
 */
export async function elvixFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = bearerOf(init.headers);
  const proves = token !== null || finishesSignIn(url);
  const attempt = async () => fetch(url, proves ? await withProof(url, init, token) : init);
  const usedNonce = currentDpopNonce();
  let res = await attempt();
  const fresh = rememberDpopNonce(res);
  if (proves && res.status === 401 && fresh && fresh !== usedNonce) {
    res = await attempt();
    rememberDpopNonce(res);
  }
  return res;
}

/** The elvix routes that mint a session in-frame (their `createSession` binds at mint). */
export const SIGN_IN_FINISHERS: ReadonlySet<string> = new Set([
  "/api/auth/otp/verify",
  "/api/auth/passkey/sign-in/finish",
  "/api/auth/google/credential",
]);

function finishesSignIn(url: string): boolean {
  try {
    const base = typeof window === "undefined" ? undefined : window.location.href;
    return SIGN_IN_FINISHERS.has(new URL(url, base).pathname);
  } catch {
    // Not a URL fetch could reach either; it gets no proof and fails on its own.
    return false;
  }
}

function bearerOf(headers: HeadersInit | undefined): string | null {
  const auth = new Headers(headers).get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
}

async function withProof(
  url: string,
  init: RequestInit,
  token: string | null,
): Promise<RequestInit> {
  const proof = await dpopProof(init.method ?? "GET", url, token);
  if (!proof) return init;
  const headers = new Headers(init.headers);
  headers.set("DPoP", proof);
  return { ...init, headers };
}
