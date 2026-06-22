/**
 * Tests for `approveDevice` — the network half of `<ElvixDeviceApproval>`. The
 * device-approval surface signs the user in on the host's own domain, then POSTs
 * elvix's device/approve with the session token. This pins the request shape
 * (URL, Bearer, user_code body) and the result mapping for every outcome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { approveDevice } from "../src/react/device-approve";

function fakeResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as unknown as Response;
}

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("approveDevice", () => {
  it("POSTs to {baseUrl}/api/v1/device/approve with Bearer + user_code", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { ok: true }));
    const res = await approveDevice({
      baseUrl: "https://plmhub.eu",
      token: "sess_abc",
      userCode: "WDJB-MJHT",
    });
    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://plmhub.eu/api/v1/device/approve");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer sess_abc");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ user_code: "WDJB-MJHT" });
  });

  it("defaults baseUrl to https://elvix.is", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { ok: true }));
    await approveDevice({ token: "t", userCode: "AAAA-BBBB" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://elvix.is/api/v1/device/approve");
  });

  it("returns ok:true on a 2xx", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { ok: true }));
    expect(await approveDevice({ token: "t", userCode: "C" })).toEqual({ ok: true });
  });

  it("surfaces errorMessage from a non-ok response", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { errorMessage: "Code expired." }));
    expect(await approveDevice({ token: "t", userCode: "C" })).toEqual({
      ok: false,
      error: "Code expired.",
    });
  });

  it("falls back to the `error` field when there's no errorMessage", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: "invalid_code" }));
    expect(await approveDevice({ token: "t", userCode: "C" })).toEqual({
      ok: false,
      error: "invalid_code",
    });
  });

  it("uses a generic message when the error body can't be parsed", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, undefined));
    expect(await approveDevice({ token: "t", userCode: "C" })).toEqual({
      ok: false,
      error: "Approval failed.",
    });
  });

  it("maps a thrown fetch (network) to a retryable error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await approveDevice({ token: "t", userCode: "C" })).toEqual({
      ok: false,
      error: "Network error. Try again.",
    });
  });
});
