// @vitest-environment jsdom
/**
 * DPoP phase 2 in the SDK (0.16): binding at sign-in, proofs for a customer
 * backend, the bound JWT, and `verifyElvixToken` forwarding a proof.
 *
 * Proofs are verified the way elvix verifies them (tests/helpers/dpop-verify.ts).
 * elvix's own contract test runs the published SDK against its real verifier.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setDpopKeyForTests,
  currentDpopThumbprint,
  dpopThumbprint,
  rememberDpopNonce,
} from "../src/react/dpop";
import { elvixFetch, SIGN_IN_FINISHERS } from "../src/react/elvix-fetch";
import { elvixProof, exchangeElvixToken } from "../src/react/elvix-proof";
import { setElvixToken } from "../src/react/session";
import { hostedCeremonyUrl, oauthStartHref } from "../src/react/sign-in-copy";
import { verifyElvixToken } from "../src/server";
import { newPair, sha256b64url, verifyProof } from "./helpers/dpop-verify";

const ELVIX = "https://elvix.test";
const BACKEND = "https://api.customer.test/styles/suggest";
const TOKEN = "session-token-abc";

let calls: { url: string; headers: Headers; method: string }[];
let answers: Response[];

beforeEach(async () => {
  __setDpopKeyForTests(await newPair());
  calls = [];
  answers = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: new Headers(init.headers), method: init.method ?? "GET" });
      return answers.shift() ?? new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("binding at sign-in", () => {
  it.each([...SIGN_IN_FINISHERS])("proves %s with no token in the proof", async (path) => {
    await elvixFetch(`${ELVIX}${path}`, { method: "POST" });
    const proof = calls[0]?.headers.get("dpop");
    expect(proof).not.toBeNull();
    const { payload, valid } = await verifyProof(proof ?? "");
    expect(valid).toBe(true);
    expect(payload.ath).toBeUndefined();
    expect(payload.htu).toBe(`${ELVIX}${path}`);
  });

  it("names the browser key on a redirect start (dpop_jkt) once it is known", async () => {
    const jkt = await dpopThumbprint();
    expect(jkt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(currentDpopThumbprint()).toBe(jkt);
    const google = new URL(oauthStartHref("google", ELVIX, "app", "elvix_pub_test_x"));
    expect(google.searchParams.get("dpop_jkt")).toBe(jkt);
    const passkey = new URL(hostedCeremonyUrl(ELVIX, "passkey", "elvix_pub_test_x"));
    expect(passkey.searchParams.get("dpop_jkt")).toBe(jkt);
    // Enrollment mints no session: nothing to bind.
    const register = new URL(hostedCeremonyUrl(ELVIX, "passkey-register", "elvix_pub_test_x"));
    expect(register.searchParams.get("dpop_jkt")).toBeNull();
  });

  it("starts a redirect without dpop_jkt where the browser holds no key", async () => {
    __setDpopKeyForTests(null);
    expect(await dpopThumbprint()).toBeNull();
    const href = new URL(oauthStartHref("google", ELVIX, "app", "elvix_pub_test_x"));
    expect(href.searchParams.get("dpop_jkt")).toBeNull();
  });
});

describe("elvixProof: a proof for the customer's own backend", () => {
  it("fetches a live nonce first when the tab holds none, then proves the backend URL and token", async () => {
    answers.push(new Response("{}", { headers: { "DPoP-Nonce": "n-fresh" } }));
    const proof = await elvixProof(BACKEND, { method: "post", token: TOKEN, baseUrl: ELVIX });
    expect(calls.map((c) => c.url)).toEqual([`${ELVIX}/api/v1/dpop/nonce`]);
    const { payload, valid } = await verifyProof(proof ?? "");
    expect(valid).toBe(true);
    expect(payload).toMatchObject({ htm: "POST", htu: BACKEND, nonce: "n-fresh" });
    expect(payload.ath).toBe(await sha256b64url(TOKEN));
  });

  it("reuses a fresh nonce without asking elvix", async () => {
    rememberDpopNonce(new Response(null, { headers: { "DPoP-Nonce": "n-1" } }));
    await elvixProof(BACKEND, { method: "POST", token: TOKEN, baseUrl: ELVIX });
    expect(calls).toHaveLength(0);
  });

  it("is null where the browser holds no key", async () => {
    __setDpopKeyForTests(null);
    expect(await elvixProof(BACKEND, { method: "POST", token: TOKEN, baseUrl: ELVIX })).toBeNull();
  });
});

describe("exchangeElvixToken", () => {
  it("exchanges the session with a proof and returns the bound JWT", async () => {
    setElvixToken(TOKEN);
    answers.push(
      Response.json({
        ok: true,
        access_token: "jwt.a.b",
        token_type: "DPoP",
        expires_at: "2026-10-22T12:00:00.000Z",
      }),
    );
    const out = await exchangeElvixToken({ baseUrl: ELVIX });
    expect(out).toEqual({
      ok: true,
      accessToken: "jwt.a.b",
      tokenType: "DPoP",
      expiresAt: "2026-10-22T12:00:00.000Z",
    });
    expect(calls[0]?.url).toBe(`${ELVIX}/api/v1/token`);
    expect(calls[0]?.headers.get("dpop")).not.toBeNull();
  });

  it("reports elvix's refusal", async () => {
    setElvixToken(TOKEN);
    answers.push(Response.json({ ok: false, error: "dpop_missing" }, { status: 401 }));
    expect(await exchangeElvixToken({ baseUrl: ELVIX })).toEqual({
      ok: false,
      error: "dpop_missing",
    });
  });
});

describe("verifyElvixToken forwards the proof", () => {
  it("sends the proof, method and URL in elvix's forwarded headers, and reads cnf", async () => {
    answers.push(Response.json({ ok: true, userId: "u1", cnf: { jkt: "jkt-1" } }));
    const out = await verifyElvixToken({
      token: TOKEN,
      proof: "p.r.f",
      htm: "post",
      htu: BACKEND,
      baseUrl: ELVIX,
    });
    expect(calls[0]?.headers.get("elvix-dpop-proof")).toBe("p.r.f");
    expect(calls[0]?.headers.get("elvix-dpop-htm")).toBe("POST");
    expect(calls[0]?.headers.get("elvix-dpop-htu")).toBe(BACKEND);
    expect(out.ok && out.boundTo).toBe("jkt-1");
  });

  it("names a DPoP refusal dpop_refused, with elvix's reason as the message", async () => {
    answers.push(Response.json({ ok: false, error: "dpop_wrong_key" }, { status: 401 }));
    const out = await verifyElvixToken({ token: TOKEN, baseUrl: ELVIX });
    expect(out).toEqual({ ok: false, error: "dpop_refused", message: "dpop_wrong_key" });
  });

  it("sends no DPoP headers without a proof (apps with DPoP off, unchanged)", async () => {
    answers.push(Response.json({ ok: true, userId: "u1" }));
    await verifyElvixToken({ token: TOKEN, baseUrl: ELVIX });
    expect(calls[0]?.headers.get("elvix-dpop-proof")).toBeNull();
  });
});
