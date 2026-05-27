/**
 * Tests for verifyElvixToken — exchanges a session token for the
 * verified user envelope via /api/v1/verify. Mocks fetch so we can
 * exercise the auth/error/success paths offline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyElvixToken } from "../src/server";

const ORIG_FETCH = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

function mockJson(status: number, body: unknown): void {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

describe("verifyElvixToken", () => {
  it("returns the user envelope on success", async () => {
    mockJson(200, {
      success: true,
      data: {
        user: { id: "u_1", email: "a@b.test" },
        roles: ["user"],
        scopes: ["read:profile"],
        memberships: [],
      },
    });
    const result = await verifyElvixToken("session_tok", { apiKey: "eak_test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("u_1");
      expect(result.roles).toContain("user");
    }
  });

  it("maps 401 to invalid_token", async () => {
    mockJson(401, { success: false, errorMessage: "invalid_token" });
    const result = await verifyElvixToken("bad", { apiKey: "eak_test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_token");
  });

  it("maps 403 to membership_blocked", async () => {
    mockJson(403, { success: false, errorMessage: "membership_blocked" });
    const result = await verifyElvixToken("paused-user-token", { apiKey: "eak_test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("membership_blocked");
  });

  it("maps 429 to rate_limited", async () => {
    mockJson(429, { success: false, errorMessage: "rate_limited" });
    const result = await verifyElvixToken("tok", { apiKey: "eak_test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("rate_limited");
  });

  it("honours an override baseUrl", async () => {
    mockJson(200, {
      success: true,
      data: { user: { id: "u_x", email: "x@y.test" }, roles: [], scopes: [], memberships: [] },
    });
    await verifyElvixToken("tok", { apiKey: "eak_test", baseUrl: "https://staging.elvix.is" });
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]?.[0])).toContain("staging.elvix.is");
  });
});
