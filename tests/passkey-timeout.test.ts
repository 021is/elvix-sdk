// @vitest-environment jsdom
/**
 * A passkey request's timer and abort listener end with the request (0.26.1): every
 * request and the browser prompt's own time limit used to leave a live 20 to 120 s timer
 * behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postEnvelope, runPasskeySignIn } from "../src/react/passkey";
import { runPasskeyRegister } from "../src/react/passkey-register";
import { passkeyRequestSignal } from "../src/react/passkey-timeout";

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a passkey request's timer", () => {
  it("is gone once the request succeeded", async () => {
    vi.stubGlobal("fetch", async () => answer(200, { success: true, data: {} }));
    const res = await postEnvelope("https://elvix.test/x", { body: "{}" }, "failed");
    expect(res.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is gone once the request was refused", async () => {
    vi.stubGlobal("fetch", async () => answer(400, { success: false, errorMessage: "nope" }));
    const res = await postEnvelope("https://elvix.test/x", { body: "{}" }, "failed");
    expect(res.ok).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is gone once the request failed on the network", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await postEnvelope("https://elvix.test/x", { body: "{}" }, "failed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is gone once the caller aborted", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError")));
      });
    });
    const own = new AbortController();
    const pending = postEnvelope("https://elvix.test/x", { body: "{}", signal: own.signal }, "f");
    own.abort();
    expect(await pending).toEqual({ ok: false, error: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still ends a request that never answers, at its limit", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
    const pending = postEnvelope("https://elvix.test/x", { body: "{}" }, "failed");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ ok: false, error: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a passkey request's abort listener", () => {
  it("is removed from the caller's signal once the request settled", async () => {
    vi.stubGlobal("fetch", async () => answer(200, { success: true, data: {} }));
    const own = new AbortController();
    const add = vi.spyOn(own.signal, "addEventListener");
    const remove = vi.spyOn(own.signal, "removeEventListener");
    await postEnvelope("https://elvix.test/x", { body: "{}", signal: own.signal }, "failed");
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
  });

  it("is removed when released directly, and releasing twice is harmless", () => {
    const own = new AbortController();
    const remove = vi.spyOn(own.signal, "removeEventListener");
    const request = passkeyRequestSignal(own.signal);
    request.release();
    request.release();
    expect(remove).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// The browser prompt's own limit (120 s). Its signal has no caller listener to remove: the
// timer is the whole of what it holds. A prompt that fails ends before `finish`, so the
// prompt's timer is the only one that could be left.
describe("the browser prompt's timer", () => {
  const BASE = "https://elvix.test";
  const buf = (s: string) => new TextEncoder().encode(s).buffer;
  const ok = (data: unknown) => answer(200, { success: true, data });
  const regOptions = {
    challenge: "Y2g",
    rp: { name: "elvix" },
    user: { id: "dXNy", name: "ada", displayName: "Ada" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  };

  function stubBrowser(credentials: { get?: () => unknown; create?: () => unknown }) {
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: class {} });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { get: vi.fn(credentials.get), create: vi.fn(credentials.create) },
    });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/start")) return ok({ options: regOptions });
      // No token: storing one makes jsdom's localStorage start a timer of its own.
      return ok({});
    });
  }
  const credential = (response: object) => ({
    id: "cred1",
    rawId: buf("raw"),
    getClientExtensionResults: () => ({}),
    response: { clientDataJSON: buf("cd"), ...response },
  });

  it("sign-in: is gone after the prompt answered", async () => {
    stubBrowser({
      get: async () =>
        credential({ authenticatorData: buf("ad"), signature: buf("sig"), userHandle: null }),
    });
    expect(await runPasskeySignIn(BASE, "client_1")).toMatchObject({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sign-in: is gone after the prompt failed", async () => {
    stubBrowser({
      get: async () => {
        throw new DOMException("dismissed", "NotAllowedError");
      },
    });
    expect(await runPasskeySignIn(BASE, "client_1")).toEqual({
      ok: false,
      error: "passkey_cancelled",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("register: is gone after the prompt answered", async () => {
    stubBrowser({
      create: async () => credential({ attestationObject: buf("ao"), getTransports: () => [] }),
    });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("register: is gone after the prompt failed", async () => {
    stubBrowser({
      create: async () => {
        throw new DOMException("dismissed", "NotAllowedError");
      },
    });
    expect(await runPasskeyRegister(BASE, "app")).toEqual({
      ok: false,
      error: "passkey_cancelled",
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
