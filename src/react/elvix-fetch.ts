"use client";

import { currentDpopNonce, dpopProof, rememberDpopNonce } from "./dpop";

/**
 * Every SDK call to elvix goes through here. A call carrying the session token
 * as a bearer also carries a DPoP proof (./dpop.ts), and elvix's latest nonce
 * is kept from every answer. When elvix refuses a proved call (401) and its
 * answer carries a fresher nonce (the first call after a page load, or a
 * window turning over), the call is made once more with it.
 */
export async function elvixFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = bearerOf(init.headers);
  const attempt = async () => fetch(url, token ? await withProof(url, init, token) : init);
  const usedNonce = currentDpopNonce();
  let res = await attempt();
  const fresh = rememberDpopNonce(res);
  if (token && res.status === 401 && fresh && fresh !== usedNonce) {
    res = await attempt();
    rememberDpopNonce(res);
  }
  return res;
}

function bearerOf(headers: HeadersInit | undefined): string | null {
  const auth = new Headers(headers).get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
}

async function withProof(url: string, init: RequestInit, token: string): Promise<RequestInit> {
  const proof = await dpopProof(init.method ?? "GET", url, token);
  if (!proof) return init;
  const headers = new Headers(init.headers);
  headers.set("DPoP", proof);
  return { ...init, headers };
}
