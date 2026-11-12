/**
 * A passkey request's timer and abort listener end with the request (0.26.1): every
 * request and every autofill focus used to leave a live 20 to 120 s timer behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postEnvelope } from "../src/react/passkey";
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
