// @vitest-environment jsdom
/**
 * A token elvix refuses as a session is forgotten (0.26.3). It ended, expired,
 * was revoked, or is bound to another browser's DPoP key: before 0.26.3 it
 * stayed in localStorage and every visit asked `sdk-context` with it again
 * (elvix TF175: one danceclub.dev session refused on every page for days).
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSessionStatus, useElvixSession } from "../src/react/elvix-provider";
import { getElvixToken, setElvixToken } from "../src/react/session";
import { CLIENT_ID, installFakeElvix, json } from "./helpers/fake-elvix";

/** elvix on a site other than the page's: the token is the only way in. */
const CROSS_SITE = "https://elvix.is";
const STORAGE_KEY = "elvix.session.token";

function Status({ onStatus }: { onStatus: (s: ElvixSessionStatus) => void }) {
  onStatus(useElvixSession());
  return null;
}

function mount() {
  const seen: ElvixSessionStatus[] = [];
  render(
    <ElvixProvider
      clientId={CLIENT_ID}
      baseUrl={CROSS_SITE}
      presence={false}
      bootstrapRefreshMs={0}
    >
      <Status onStatus={(s) => seen.push(s)} />
    </ElvixProvider>,
  );
  return seen;
}

describe("a token sdk-context refuses", () => {
  afterEach(() => {
    setElvixToken(null);
    vi.unstubAllGlobals();
  });

  it("is forgotten, so the next visit does not ask with it again", async () => {
    setElvixToken("tok_dead");
    const fake = installFakeElvix({ context: null });
    const seen = mount();
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.ANONYMOUS));
    expect(getElvixToken()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(fake.calls("/sdk-context")).toBe(1);

    // The next visit: the page mounts again with only what storage kept.
    const firstVisit = fake.fetchMock.mock.calls.length;
    cleanup();
    const again = mount();
    await waitFor(() => expect(again.at(-1)).toBe(ElvixSessionStatus.ANONYMOUS));
    const carriesDeadToken = ([, init]: [RequestInfo | URL, RequestInit?]) =>
      new Headers(init?.headers).get("authorization") === "Bearer tok_dead";
    expect(fake.fetchMock.mock.calls.slice(0, firstVisit).some(carriesDeadToken)).toBe(true);
    expect(fake.fetchMock.mock.calls.slice(firstVisit).some(carriesDeadToken)).toBe(false);
    expect(fake.calls("/sdk-context")).toBe(1);
  });

  it("is kept when elvix fails another way, since the session may still be good", async () => {
    setElvixToken("tok_live");
    installFakeElvix({}, [
      ["*", (u) => u.includes("/sdk-context"), () => json({ success: false }, 503)],
    ]);
    const seen = mount();
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.ANONYMOUS));
    expect(getElvixToken()).toBe("tok_live");
  });

  it("never takes a newer sign-in another tab stored meanwhile", async () => {
    setElvixToken("tok_old");
    installFakeElvix({}, [
      [
        "*",
        (u) => u.includes("/sdk-context"),
        () => {
          // Another tab signs in while this answer is on its way.
          setElvixToken("tok_new");
          return json({ success: false, errorMessage: "unauthenticated" }, 401);
        },
      ],
    ]);
    const seen = mount();
    await waitFor(() => expect(seen.at(-1)).toBe(ElvixSessionStatus.ANONYMOUS));
    expect(getElvixToken()).toBe("tok_new");
  });
});
