// @vitest-environment jsdom
/**
 * The passkey ceremonies' contract: every outcome is a result object, never a
 * throw, with stable error codes hosts branch on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPasskeyRegister, runPasskeySignIn } from "../src/react/passkey";
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
    expect(r).toEqual({ ok: true, token: "tok_1", redirect: "/app" });
    expect(getElvixToken()).toBe("tok_1");
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
});
