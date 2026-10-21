// @vitest-environment node
/**
 * DPoP in the SDK (src/react/dpop.ts, src/react/elvix-fetch.ts): the key the
 * browser keeps, the proofs it signs, and the calls that carry them.
 *
 * Proofs are checked the way elvix checks them (lib/dpop.ts there): the
 * header, a signature that verifies with the embedded public key, the method,
 * the URL without its query, the token's hash, the nonce elvix handed out.
 * elvix's own contract test runs the published SDK against its real verifier.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setDpopKeyForTests,
  currentDpopNonce,
  dpopKey,
  dpopProof,
  rememberDpopNonce,
} from "../src/react/dpop";
import { elvixFetch } from "../src/react/elvix-fetch";

const URL_PROFILE = "https://elvix.test/api/account/profile/identity";
const TOKEN = "session-token-abc";

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (part: string) => JSON.parse(new TextDecoder().decode(fromB64url(part)));

async function sha256b64url(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Verify like elvix: header, signature with the embedded key, then the claims. */
async function verify(proof: string) {
  const [h, p, s] = proof.split(".");
  const header = json(h);
  const key = await crypto.subtle.importKey(
    "jwk",
    header.jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    fromB64url(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  return { header, payload: json(p), valid };
}

const newPair = () =>
  crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
    "verify",
  ]) as Promise<CryptoKeyPair>;

afterEach(() => vi.unstubAllGlobals());

describe("the browser's key", () => {
  it("is created once, kept in IndexedDB, and its private half cannot be exported", async () => {
    const first = await dpopKey();
    if (!first) throw new Error("no key under fake-indexeddb");
    expect(first.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("jwk", first.privateKey)).rejects.toThrow();
    expect(await dpopKey()).toBe(first);
  });

  it("is missing, never an error, where the browser cannot hold one", async () => {
    __setDpopKeyForTests(null);
    expect(await dpopProof("GET", URL_PROFILE, TOKEN)).toBeNull();
  });
});

describe("a proof", () => {
  beforeEach(async () => __setDpopKeyForTests(await newPair()));

  it("is an ES256 dpop+jwt signed by the public key it carries, and carries no private key", async () => {
    const { header, valid } = await verify((await dpopProof("GET", URL_PROFILE, TOKEN)) ?? "");
    expect(valid).toBe(true);
    expect(header).toMatchObject({ typ: "dpop+jwt", alg: "ES256" });
    expect(Object.keys(header.jwk).sort()).toEqual(["crv", "kty", "x", "y"]);
  });

  it("names the method, the URL without query or fragment, the token's hash, a fresh iat and jti", async () => {
    const proof = await dpopProof("patch", `${URL_PROFILE}?tab=1#top`, TOKEN);
    const { payload } = await verify(proof ?? "");
    expect(payload.htm).toBe("PATCH");
    expect(payload.htu).toBe(URL_PROFILE);
    expect(payload.ath).toBe(await sha256b64url(TOKEN));
    expect(Math.abs(payload.iat - Date.now() / 1000)).toBeLessThan(5);
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    const again = await verify((await dpopProof("GET", URL_PROFILE, TOKEN)) ?? "");
    expect(again.payload.jti).not.toBe(payload.jti);
  });

  it("echoes the nonce elvix last handed out", async () => {
    expect((await verify((await dpopProof("GET", URL_PROFILE, TOKEN)) ?? "")).payload.nonce).toBe(
      undefined,
    );
    rememberDpopNonce(new Response(null, { headers: { "DPoP-Nonce": "n-1" } }));
    expect((await verify((await dpopProof("GET", URL_PROFILE, TOKEN)) ?? "")).payload.nonce).toBe(
      "n-1",
    );
  });
});

describe("elvixFetch", () => {
  let calls: { url: string; headers: Headers }[];
  let answers: Response[];

  beforeEach(async () => {
    __setDpopKeyForTests(await newPair());
    calls = [];
    answers = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, headers: new Headers(init.headers) });
        return answers.shift() ?? new Response("{}", { status: 200 });
      }),
    );
  });

  const bearer = { headers: { authorization: `Bearer ${TOKEN}` } };

  it("adds a proof to a call that carries the session token", async () => {
    await elvixFetch(URL_PROFILE, bearer);
    const proof = calls[0].headers.get("dpop");
    expect(proof).not.toBeNull();
    expect((await verify(proof ?? "")).payload.ath).toBe(await sha256b64url(TOKEN));
  });

  it("adds none to a call without the token (sign-in, public config)", async () => {
    await elvixFetch(URL_PROFILE, {});
    expect(calls[0].headers.get("dpop")).toBeNull();
  });

  it("keeps elvix's nonce from every answer", async () => {
    answers.push(new Response("{}", { headers: { "DPoP-Nonce": "n-7" } }));
    await elvixFetch(URL_PROFILE, {});
    expect(currentDpopNonce()).toBe("n-7");
  });

  it("retries once with a fresher nonce when elvix refuses the proof", async () => {
    answers.push(new Response("{}", { status: 401, headers: { "DPoP-Nonce": "n-2" } }));
    const res = await elvixFetch(URL_PROFILE, bearer);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect((await verify(calls[1].headers.get("dpop") ?? "")).payload.nonce).toBe("n-2");
  });

  it("does not loop: a second refusal is the answer", async () => {
    answers.push(new Response("{}", { status: 401, headers: { "DPoP-Nonce": "n-3" } }));
    answers.push(new Response("{}", { status: 401, headers: { "DPoP-Nonce": "n-4" } }));
    expect((await elvixFetch(URL_PROFILE, bearer)).status).toBe(401);
    expect(calls).toHaveLength(2);
  });

  it("does not retry a 401 that carries the nonce it already used", async () => {
    rememberDpopNonce(new Response(null, { headers: { "DPoP-Nonce": "same" } }));
    answers.push(new Response("{}", { status: 401, headers: { "DPoP-Nonce": "same" } }));
    expect((await elvixFetch(URL_PROFILE, bearer)).status).toBe(401);
    expect(calls).toHaveLength(1);
  });
});
