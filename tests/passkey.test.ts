// @vitest-environment jsdom
/**
 * The passkey ceremonies' contract: every outcome is a result object, never a
 * throw, with stable error codes hosts branch on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPasskeySignIn } from "../src/react/passkey";
import {
  holdCeremony,
  holdOffer,
  PasskeyLock,
  passkeyLockState,
  releaseCeremony,
} from "../src/react/passkey-lock";
import { runPasskeyRegister } from "../src/react/passkey-register";
import { getElvixToken, setElvixToken } from "../src/react/session";

const BASE = "https://elvix.test";
const buf = (s: string) => new TextEncoder().encode(s).buffer;

function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const hit = Object.entries(routes).find(([suffix]) => String(url).endsWith(suffix));
      if (!hit) throw new TypeError("network down");
      return hit[1]();
    }),
  );
}
const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

function stubCredentials(impl: { get?: () => unknown; create?: () => unknown }) {
  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: class {} });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { get: vi.fn(impl.get), create: vi.fn(impl.create) },
  });
}

const assertion = {
  id: "cred1",
  rawId: buf("raw"),
  authenticatorAttachment: "platform",
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: buf("cd"),
    authenticatorData: buf("ad"),
    signature: buf("sig"),
    userHandle: null,
  },
};

beforeEach(() => setElvixToken(null));
afterEach(() => vi.unstubAllGlobals());

describe("runPasskeySignIn", () => {
  it("signs in and stores the returned token", async () => {
    stubCredentials({ get: async () => assertion });
    stubFetch({
      "/sign-in/start": () => ok({ options: { challenge: "Y2g" } }),
      "/sign-in/finish": () => ok({ token: "tok_1", redirect: "/app" }),
    });
    const r = await runPasskeySignIn(BASE, "client_1");
    expect(r).toEqual({ ok: true, landing: { token: "tok_1", redirect: "/app" } });
    expect(getElvixToken()).toBe("tok_1");
  });

  it("keeps the onboarding step the server named", async () => {
    // A passkey skips the passkey gate only: a username or a restore is still owed.
    stubCredentials({ get: async () => assertion });
    const landing = { token: "tok_1", next_step: "username", suggestions: ["ada"], final: "/w" };
    stubFetch({
      "/sign-in/start": () => ok({ options: { challenge: "Y2g" } }),
      "/sign-in/finish": () => ok(landing),
    });
    expect(await runPasskeySignIn(BASE, "client_1")).toEqual({ ok: true, landing });
  });

  it("maps a dismissed prompt to passkey_cancelled", async () => {
    stubCredentials({
      get: async () => {
        throw Object.assign(new Error("x"), { name: "NotAllowedError" });
      },
    });
    stubFetch({ "/sign-in/start": () => ok({ options: { challenge: "Y2g" } }) });
    expect(await runPasskeySignIn(BASE, "client_1")).toEqual({
      ok: false,
      error: "passkey_cancelled",
    });
  });

  it("reports the server's error, a missing options body, and a network failure", async () => {
    stubCredentials({ get: async () => assertion });
    stubFetch({
      "/sign-in/start": () =>
        new Response(JSON.stringify({ success: false, errorMessage: "gate_closed" }), {
          status: 403,
        }),
    });
    expect(await runPasskeySignIn(BASE, "client_1")).toEqual({ ok: false, error: "gate_closed" });

    stubFetch({ "/sign-in/start": () => ok({}) });
    expect(await runPasskeySignIn(BASE, "client_1")).toEqual({
      ok: false,
      error: "passkey_start_failed",
    });

    stubFetch({});
    expect(await runPasskeySignIn(BASE, "client_1")).toMatchObject({ ok: false, error: "network" });
  });

  it("requires a clientId for an app sign-in", async () => {
    expect(await runPasskeySignIn(BASE, undefined)).toMatchObject({ error: "missing_client_id" });
  });
});

describe("runPasskeyRegister", () => {
  it("registers, and maps a failed finish to its error", async () => {
    stubCredentials({
      create: async () => ({
        ...assertion,
        response: {
          clientDataJSON: buf("cd"),
          attestationObject: buf("ao"),
          getTransports: () => ["internal"],
        },
      }),
    });
    const options = {
      challenge: "Y2g",
      rp: { name: "elvix" },
      user: { id: "dXNy", name: "ada", displayName: "Ada" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    };
    stubFetch({
      "/register/start": () => ok({ options }),
      "/register/finish": () => ok(null),
    });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({ ok: true });

    stubFetch({
      "/register/start": () => ok({ options }),
      "/register/finish": () => new Response(JSON.stringify({ success: false }), { status: 400 }),
    });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({
      ok: false,
      error: "passkey_register_failed",
    });
  });

  // Security review 5 (2026-11-12): a create() never opens beside another card's request.
  it("holds the page's passkey lock: ends a waiting offer first, and waits out a ceremony", async () => {
    const offer = { controller: new AbortController(), picked: false, done: Promise.resolve() };
    const created = vi.fn(async () => {
      expect(offer.controller.signal.aborted).toBe(true);
      expect(passkeyLockState()).toBe(PasskeyLock.BUSY);
      return {
        ...assertion,
        response: { clientDataJSON: buf("cd"), attestationObject: buf("ao") },
      };
    });
    stubCredentials({ create: created });
    const options = {
      challenge: "Y2g",
      rp: { name: "e" },
      user: { id: "dQ", name: "a", displayName: "A" },
      pubKeyCredParams: [],
    };
    stubFetch({
      "/register/start": () => ok({ options }),
      "/register/finish": () => ok(null),
    });
    expect(holdOffer(offer)).toBe(true);
    expect(await runPasskeyRegister(BASE, "app")).toEqual({ ok: true });
    expect(passkeyLockState()).toBe(PasskeyLock.FREE);

    expect(await holdCeremony()).toBe(true);
    expect(await runPasskeyRegister(BASE, "app")).toEqual({ ok: false, error: "passkey_busy" });
    releaseCeremony();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("returns a code only, never the browser's or an extension's words", async () => {
    stubCredentials({
      create: async () => {
        throw Object.assign(new Error("PWNED: call +1 555 0100"), { name: "UnknownError" });
      },
    });
    stubFetch({ "/register/start": () => ok({ options: { challenge: "Y2g" } }) });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({
      ok: false,
      error: "passkey_register_failed",
    });
  });

  it("takes a refusal's errorMessage only when it is a code, never a 500's free text", async () => {
    const refuse = (errorMessage: string) => () =>
      new Response(JSON.stringify({ success: false, errorMessage }), { status: 500 });
    stubCredentials({ create: async () => null });
    stubFetch({ "/register/start": refuse("Invalid `prisma.x()`: ECONNREFUSED 10.0.3.7:5432") });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({
      ok: false,
      error: "passkey_register_failed",
    });
    stubFetch({ "/register/start": refuse("not_a_member") });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({ ok: false, error: "not_a_member" });
  });
});
