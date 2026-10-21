// @vitest-environment jsdom
/**
 * The return leg of a redirect sign-in (`#elvix_token=…` on the host page):
 * the `state` nonce that binds it to the tab that started it (login CSRF),
 * the landing payload's shape, and how the fragment is stripped so routers
 * see it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeElvixReturnToken,
  getElvixToken,
  isSameOrigin,
  parseLandingPayload,
  setElvixToken,
  signInState,
  takeJustReturnedLanding,
  takeJustReturnedToken,
} from "../src/react/session";
import { hostedCeremonyUrl, oauthStartHref } from "../src/react/sign-in-copy";

const landing = (payload: unknown) => btoa(JSON.stringify(payload)).replace(/=+$/, "");

function arriveAt(hash: string) {
  window.history.replaceState(null, "", `/page${hash}`);
}

beforeEach(() => {
  window.sessionStorage.clear();
  setElvixToken(null);
  takeJustReturnedToken();
  takeJustReturnedLanding();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("redirect return: the state nonce (login CSRF)", () => {
  it("accepts a token whose state is the one this tab started with", () => {
    const state = signInState();
    arriveAt(`#elvix_token=mine&elvix_state=${state}`);
    expect(consumeElvixReturnToken()).toBe("mine");
    expect(getElvixToken()).toBe("mine");
  });

  it("rejects a token with no state: an attacker's link signs nobody in", () => {
    signInState();
    arriveAt("#elvix_token=attacker");
    expect(consumeElvixReturnToken()).toBeNull();
    expect(getElvixToken()).toBeNull();
    expect(takeJustReturnedToken()).toBeNull();
  });

  it("rejects a token with someone else's state", () => {
    signInState();
    arriveAt("#elvix_token=attacker&elvix_state=not-mine");
    expect(consumeElvixReturnToken()).toBeNull();
    expect(getElvixToken()).toBeNull();
  });

  it("rejects when this tab never started a sign-in", () => {
    arriveAt("#elvix_token=attacker&elvix_state=anything");
    expect(consumeElvixReturnToken()).toBeNull();
    expect(getElvixToken()).toBeNull();
  });

  it("drops the attacker's landing payload too, so they cannot pick the pane", () => {
    signInState();
    const forged = landing({ next_step: "recover", recover: { appId: "a" } });
    arriveAt(`#elvix_token=attacker&elvix_landing=${forged}`);
    consumeElvixReturnToken();
    expect(takeJustReturnedLanding()).toBeNull();
  });

  it("is spent after one return: replaying the same link fails", () => {
    const state = signInState();
    arriveAt(`#elvix_token=mine&elvix_state=${state}`);
    expect(consumeElvixReturnToken()).toBe("mine");
    setElvixToken(null);
    arriveAt(`#elvix_token=mine&elvix_state=${state}`);
    expect(consumeElvixReturnToken()).toBeNull();
  });

  it("a forged link does not cancel the sign-in the user really started", () => {
    const state = signInState();
    arriveAt("#elvix_token=attacker&elvix_state=forged");
    consumeElvixReturnToken();
    arriveAt(`#elvix_token=mine&elvix_state=${state}`);
    expect(consumeElvixReturnToken()).toBe("mine");
  });

  it("keeps one nonce per tab until it is spent, and it is long enough to guess-proof", () => {
    const first = signInState();
    expect(signInState()).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
  });

  it("carries the nonce through every redirect start", () => {
    const state = signInState();
    const google = new URL(oauthStartHref("google", "https://elvix.test", "app", "pub_x"));
    expect(google.searchParams.get("state")).toBe(state);
    const hosted = new URL(hostedCeremonyUrl("https://elvix.test", "passkey", "pub_x"));
    expect(hosted.searchParams.get("state")).toBe(state);
    const enroll = new URL(hostedCeremonyUrl("https://elvix.test", "passkey-register", "pub_x"));
    expect(enroll.searchParams.get("state")).toBe(state);
  });

  it.each([
    ["same-origin baseUrl", window.location.origin],
    ['baseUrl ""', ""],
  ])("sends no returnUrl from elvix's own hosted page (%s)", (_name, baseUrl) => {
    // elvix refuses a returnUrl on its own origin (no app lists elvix.is):
    // the hosted page completes with the cookie session instead.
    const href = oauthStartHref("google", baseUrl, "app", "pub_x");
    const google = new URL(href, window.location.href);
    expect(google.searchParams.get("returnUrl")).toBeNull();
    expect(google.searchParams.get("state")).toBeNull();
    expect(google.searchParams.get("clientId")).toBe("pub_x");
  });
});

describe("redirect return: the fragment is always stripped", () => {
  it.each([
    ["accepted", true],
    ["rejected", false],
  ])("leaves no token in the address bar when %s", (_name, valid) => {
    const state = signInState();
    arriveAt(`#elvix_token=t&elvix_state=${valid ? state : "bad"}&keep=1`);
    consumeElvixReturnToken();
    expect(window.location.hash).toBe("#keep=1");
    expect(window.location.href).not.toContain("elvix_token");
    expect(window.location.href).not.toContain("elvix_state");
  });

  /**
   * Next's App Router patches `history.replaceState`: a call that passes its
   * own private state (`__NA`) keeps ITS canonical URL, so a strip that
   * reuses `history.state` leaves `#elvix_token` in the router's URL and it
   * writes it back on the next navigation (a duplicate entry, the token in
   * the bar). A call with no state makes it re-derive the URL. This models
   * that contract; it is not the router itself.
   */
  it("strips in a way a Next-style router observes, and adds no history entry", () => {
    const state = signInState();
    arriveAt(`#elvix_token=t&elvix_state=${state}`);
    const router = { canonicalUrl: window.location.href };
    window.history.replaceState({ __NA: true, tree: [] }, "", window.location.href);
    const real = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
      real(data, unused, url);
      if (!(data as { __NA?: boolean } | null)?.__NA)
        router.canonicalUrl = String(window.location.href);
    });
    const entries = window.history.length;

    consumeElvixReturnToken();

    expect(router.canonicalUrl).not.toContain("elvix_token");
    expect(window.location.href).not.toContain("elvix_token");
    expect(window.history.length).toBe(entries);
  });
});

describe("parseLandingPayload", () => {
  it.each([
    [{ next_step: "done", redirect: "/home" }],
    [{ next_step: "username", suggestions: ["a", "b"], final: "/" }],
    [{ next_step: "passkey", final: "/" }],
    [
      {
        next_step: "recover",
        recover: { appId: "a", appName: "A", state: "inactive", sinceAt: "x" },
      },
    ],
  ])("accepts %j", (payload) => {
    expect(parseLandingPayload(payload)).toEqual(payload);
  });

  it.each([
    [null],
    ["x"],
    [{ next_step: "root" }],
    [{ next_step: "username", suggestions: "a" }],
    [{ next_step: "username", suggestions: [1] }],
    [{ next_step: "username", suggestions: Array.from({ length: 50 }, () => "a") }],
    [{ next_step: "passkey", final: 5 }],
    [{ next_step: "recover", recover: { appId: "a" } }],
    [{ next_step: "recover", recover: "x" }],
  ])("rejects %j", (payload) => {
    expect(parseLandingPayload(payload)).toBeNull();
  });
});

describe("isSameOrigin", () => {
  it("fails closed on an unparseable base URL (no credentials)", () => {
    expect(isSameOrigin("http://")).toBe(false);
  });
});
