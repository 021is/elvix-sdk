/**
 * Tests for verifyElvixToken — POSTs the end-user session token as a Bearer to
 * /api/v1/session and returns the verified user envelope. Mocks fetch so we can
 * exercise the auth / error / success paths offline.
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

function lastCall(): unknown[] {
  const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  return calls[0] ?? [];
}

describe("verifyElvixToken", () => {
  it("returns the user envelope on success", async () => {
    mockJson(200, {
      ok: true,
      userId: "u_1",
      email: "a@b.test",
      name: "Alice",
      roles: ["user"],
      scopes: ["read:profile"],
      memberships: [],
    });
    const result = await verifyElvixToken("session_tok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("u_1");
      expect(result.user.email).toBe("a@b.test");
      expect(result.roles).toContain("user");
    }
  });

  it("passes through every additive identity + session field", async () => {
    // Regression guard. The route returned all of this while `ElvixUser`
    // described four fields, so hosts either re-declared the envelope by hand
    // or lost data they had already paid a round trip for. If a future refactor
    // narrows the mapping again this fails, rather than dropping it silently.
    mockJson(200, {
      ok: true,
      userId: "u_1",
      email: "a@b.test",
      username: "alice",
      name: "Alice Smith",
      fullName: "Alice Smith",
      givenName: "Alice",
      familyName: "Smith",
      avatarUrl: "https://cdn.021.is/a.webp",
      locale: "de-DE",
      timezone: "Europe/Berlin",
      region: {
        country: "DE",
        uiLocale: "de-DE",
        timeZone: "Europe/Berlin",
        currency: "EUR",
        measurementSystem: "metric",
      },
      applicationId: "app_1",
      status: "active",
      roles: ["user"],
      scopes: [],
      memberships: [],
      avatarSizes: [128, 256, 1200],
      avatarUpdatedAt: "2026-09-07T00:00:00.000Z",
      bannerSizes: [768],
      bannerUpdatedAt: null,
      expiresAt: "2026-10-07T00:00:00.000Z",
    });
    const result = await verifyElvixToken("session_tok");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.username).toBe("alice");
    expect(result.user.givenName).toBe("Alice");
    expect(result.user.familyName).toBe("Smith");
    expect(result.user.fullName).toBe("Alice Smith");
    expect(result.user.locale).toBe("de-DE");
    expect(result.user.timezone).toBe("Europe/Berlin");
    expect(result.region?.currency).toBe("EUR");
    expect(result.applicationId).toBe("app_1");
    expect(result.status).toBe("active");
    expect(result.avatarSizes).toEqual([128, 256, 1200]);
    expect(result.bannerUpdatedAt).toBeNull();
    expect(result.expiresAt).toBe("2026-10-07T00:00:00.000Z");
  });

  it("leaves additive fields undefined against an older elvix", async () => {
    // A host pinned to a server predating these fields must still get a valid
    // ok:true envelope — undefined, never a throw and never "".
    mockJson(200, {
      ok: true,
      userId: "u_1",
      email: "a@b.test",
      roles: [],
      scopes: [],
      memberships: [],
    });
    const result = await verifyElvixToken("session_tok");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.username).toBeUndefined();
    expect(result.region).toBeUndefined();
    expect(result.expiresAt).toBeUndefined();
    // The original four keep their published behaviour.
    expect(result.user.email).toBe("a@b.test");
    expect(result.membershipBrands).toEqual([]);
  });

  it("POSTs the token as a Bearer to /api/v1/session", async () => {
    mockJson(200, {
      ok: true,
      userId: "u_1",
      email: "a@b.test",
      roles: [],
      scopes: [],
      memberships: [],
    });
    await verifyElvixToken("session_tok");
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/session");
    expect((init as { method?: string }).method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer session_tok");
  });

  it("maps a 200 ok:false to ok:false (defensive)", async () => {
    mockJson(200, { ok: false, error: "invalid_token" });
    const result = await verifyElvixToken("tok");
    expect(result.ok).toBe(false);
  });

  it("maps 401 to invalid_token", async () => {
    mockJson(401, { ok: false, error: "invalid_token" });
    const result = await verifyElvixToken("bad");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_token");
  });

  it("maps 403 to membership_blocked", async () => {
    mockJson(403, { ok: false, error: "membership_blocked" });
    const result = await verifyElvixToken("paused-user-token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("membership_blocked");
  });

  it("maps 429 to rate_limited", async () => {
    mockJson(429, { ok: false, error: "rate_limited" });
    const result = await verifyElvixToken("tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("rate_limited");
  });

  it("honours an override baseUrl", async () => {
    mockJson(200, {
      ok: true,
      userId: "u_x",
      email: "x@y.test",
      roles: [],
      scopes: [],
      memberships: [],
    });
    await verifyElvixToken("tok", { baseUrl: "https://staging.elvix.is" });
    expect(String(lastCall()[0])).toContain("staging.elvix.is");
  });
});
