// @vitest-environment jsdom
/**
 * A signed-out visitor on a host like danceclub.dev is not asked about at
 * elvix (0.21). elvix's session cookies are SameSite=Lax and host-only, so a
 * cross-site `fetch` never carries them: with no bearer token, `sdk-context`
 * could only answer 401, one red console line on every page. Same origin and
 * same site still ask, because there the cookie does arrive.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cookieCanReach } from "../src/react/cookie-reach";
import { ElvixProvider, ElvixSessionStatus, useElvixSession } from "../src/react/elvix-provider";
import { setElvixToken } from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

/** elvix on a site other than the page's (app.elvix.test, vitest.config.ts). */
const CROSS_SITE = "https://elvix.is";

describe("cookieCanReach", () => {
  it.each([
    ["", "danceclub.dev", true],
    ["https://elvix.is", "elvix.is", true],
    ["https://elvix.is", "app.elvix.is", true],
    ["https://auth.danceclub.dev", "danceclub.dev", true],
    ["https://elvix.is", "danceclub.dev", false],
    ["https://elvix.is", "notelvix.is", false],
    ["not a url", "danceclub.dev", true],
  ])("baseUrl %j from %s → %s", (baseUrl, host, expected) => {
    expect(cookieCanReach(baseUrl, host)).toBe(expected);
  });
});

function Status({ onStatus }: { onStatus: (s: ElvixSessionStatus) => void }) {
  onStatus(useElvixSession());
  return null;
}

function mount(baseUrl: string) {
  const seen: ElvixSessionStatus[] = [];
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={baseUrl} presence={false} bootstrapRefreshMs={0}>
      <Status onStatus={(s) => seen.push(s)} />
    </ElvixProvider>,
  );
  return seen;
}

describe("the provider's session probe", () => {
  afterEach(() => {
    setElvixToken(null);
    vi.unstubAllGlobals();
  });

  it("asks nothing cross-site without a token, and reports signed out", async () => {
    const fake = installFakeElvix();
    const seen = mount(CROSS_SITE);
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.ANONYMOUS));
    expect(fake.calls("/sdk-context")).toBe(0);
  });

  it("still asks cross-site with a token", async () => {
    setElvixToken("tok_1");
    const fake = installFakeElvix();
    const seen = mount(CROSS_SITE);
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.AUTHENTICATED));
    expect(fake.calls("/sdk-context")).toBe(1);
  });

  it("still asks same-site without a token, where the cookie arrives", async () => {
    const fake = installFakeElvix();
    const seen = mount(BASE);
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.AUTHENTICATED));
    expect(fake.calls("/sdk-context")).toBe(1);
  });

  it("still asks on the same origin without a token", async () => {
    const fake = installFakeElvix();
    const seen = mount("");
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.AUTHENTICATED));
    expect(fake.calls("/sdk-context")).toBe(1);
  });
});
