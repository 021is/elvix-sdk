/**
 * Tests for isSameOrigin — the predicate ElvixSignIn uses to choose
 * credentials mode. Cross-origin must be "omit" (elvix answers with a
 * wildcard CORS that forbids credentialed requests); same-origin keeps
 * "include" so the Set-Cookie lands. Getting this wrong silently breaks
 * cross-origin sign-in, so it's worth pinning.
 */
import { afterEach, describe, expect, it } from "vitest";

import { isSameOrigin } from "../src/react/session";

const g = globalThis as { window?: { location: { origin: string; href: string } } };

afterEach(() => {
  g.window = undefined;
});

describe("isSameOrigin", () => {
  it("treats an empty baseUrl as same-origin", () => {
    expect(isSameOrigin("")).toBe(true);
  });

  it("is same-origin under SSR (no window)", () => {
    expect(isSameOrigin("https://elvix.is")).toBe(true);
  });

  it("detects a cross-origin baseUrl in the browser", () => {
    g.window = { location: { origin: "https://app.test", href: "https://app.test/" } };
    expect(isSameOrigin("https://elvix.is")).toBe(false);
  });

  it("detects a same-origin baseUrl in the browser", () => {
    g.window = { location: { origin: "https://app.test", href: "https://app.test/dashboard" } };
    expect(isSameOrigin("https://app.test")).toBe(true);
  });
});
