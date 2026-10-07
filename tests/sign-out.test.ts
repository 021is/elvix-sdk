// @vitest-environment jsdom
/**
 * #5 (0.13): `signOut()` reports `ok: false` only when the user may still be
 * signed in. On 0.12 a 401 (the session had already ended: expired, revoked,
 * signed out in another tab) came back as `http_401`, so a host that trusted
 * `ok` stranded someone who was already out.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getElvixToken, setElvixToken } from "../src/react/session";
import { signOut } from "../src/react/sign-out";

afterEach(() => {
  vi.unstubAllGlobals();
  setElvixToken(null);
});

function answer(status: number) {
  const fetchMock = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("signOut", () => {
  it("treats an already-ended session (401) as signed out", async () => {
    answer(401);
    setElvixToken("tok");

    const result = await signOut({ redirectAfterSignOut: null });

    expect(result).toEqual({ ok: true, redirect: undefined });
    expect(getElvixToken()).toBeNull();
  });

  it("fails when the server may not have ended the session, and still clears this device", async () => {
    answer(503);
    setElvixToken("tok");

    const result = await signOut({ redirectAfterSignOut: null });

    expect(result).toMatchObject({ ok: false, error: "http_503" });
    expect(getElvixToken()).toBeNull();
  });

  it("clears the elvix_token cookie", async () => {
    answer(204);
    document.cookie = "elvix_token=tok; path=/";

    await signOut({ redirectAfterSignOut: null });

    expect(document.cookie).not.toContain("elvix_token=tok");
  });
});
