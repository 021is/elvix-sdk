// @vitest-environment jsdom
/**
 * After a sign-in the HOST must see the session at once. Before 0.14 the form
 * stored the token and fired `onResult`, but nothing told the provider, so
 * `useElvixSession()` stayed anonymous until the tab regained focus (every
 * method; Google hid it by reloading). The same went for a new user's
 * username claim, and for signing out.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixProvider,
  ElvixSessionStatus,
  ElvixSignInForm,
  signOut,
  useElvixSession,
} from "../src/react/index";
import { setElvixToken } from "../src/react/session";
import {
  BASE,
  CLIENT_ID,
  installFakeElvix,
  json,
  type Route,
  sampleContext,
} from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setElvixToken(null);
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const PANE = { timeout: 3000 };
type Body = Record<string, unknown>;

/** What the host renders from the provider, as a host's header would. */
function Status() {
  return <output data-testid="status">{useElvixSession()}</output>;
}

function mount(verify: Body, extraRoutes: Route[] = [], props = {}) {
  let signedIn = false;
  const routes: Route[] = [
    [
      "POST",
      (u) => u.includes("/api/auth/otp/start"),
      () => json({ success: true, data: { ok: true, challengeId: "c1" } }),
    ],
    [
      "POST",
      (u) => u.includes("/api/auth/otp/verify"),
      () => {
        if (verify.token) signedIn = true;
        return json({ success: true, data: { ok: true, ...verify } });
      },
    ],
    [
      "GET",
      (u) => u.includes("/api/onboarding/username/check"),
      () => json({ success: true, data: { ok: true, available: true } }),
    ],
    [
      "POST",
      (u) => u.endsWith("/api/onboarding/username"),
      () => {
        signedIn = true;
        return json({ success: true, data: { ok: true, redirect: "/claimed" } });
      },
    ],
    ...extraRoutes,
  ];
  const fake = installFakeElvix({ context: null }, routes);
  // The server answers sdk-context for a session once it has been minted.
  fake.state.context = null;
  const orig = fake.fetchMock.getMockImplementation();
  fake.fetchMock.mockImplementation(async (input, init) => {
    if (String(input).includes("/sdk-context") && signedIn) {
      return json({ success: true, data: sampleContext() });
    }
    return orig ? orig(input, init) : json({}, 404);
  });
  const seen: { status: string; sdkContextCalls: number }[] = [];
  const onResult = vi.fn(() => {
    seen.push({
      status: screen.getByTestId("status").textContent ?? "",
      sdkContextCalls: fake.calls("/sdk-context"),
    });
  });
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <Status />
      <ElvixSignInForm navigate={false} onResult={onResult} {...props} />
    </ElvixProvider>,
  );
  return {
    fake,
    onResult,
    seen,
    signOutNow: () => signOut({ baseUrl: BASE, redirectAfterSignOut: null }),
  };
}

async function signInByCode() {
  fireEvent.change(await screen.findByPlaceholderText("Enter your email"), {
    target: { value: "a@b.co" },
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Continue/ })));
  await screen.findByText(/We sent a code to/, {}, PANE);
  await act(async () =>
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "123456" } }),
  );
}

const status = () => screen.getByTestId("status").textContent;

describe("sign-in updates the host's session", () => {
  it("email code: authenticated by the time onResult fires, with no refocus", async () => {
    const { onResult, seen, fake } = mount({ token: "tok_1", redirect: "/home" });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.ANONYMOUS));
    const before = fake.calls("/sdk-context");

    await signInByCode();

    await waitFor(() => expect(onResult).toHaveBeenCalled(), PANE);
    // The provider re-read the session BEFORE the host's callback ran.
    expect(seen[0]?.sdkContextCalls).toBeGreaterThan(before);
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
  });

  it("works the same with the host owning navigation (onAuthenticated)", async () => {
    const onAuthenticated = vi.fn();
    mount({ token: "tok_1", redirect: "/home" }, [], { onAuthenticated, navigate: undefined });
    await signInByCode();
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled(), PANE);
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
  });

  it("a new user claiming a username is authenticated afterwards, no refresh needed", async () => {
    const { onResult } = mount({
      token: "tok_new",
      next_step: "username",
      suggestions: ["ada"],
      final: "/",
    });
    await signInByCode();
    await screen.findByText("Looks good. This one's yours.", {}, PANE);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Claim @ada" })));

    await waitFor(() => expect(onResult).toHaveBeenCalled(), PANE);
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
  });

  it("stays anonymous to the host while an onboarding gate is still open", async () => {
    const { onResult } = mount({
      token: "tok_new",
      next_step: "username",
      suggestions: [],
      final: "/",
    });
    await signInByCode();
    await screen.findByLabelText(/username/i, {}, PANE);
    expect(onResult).not.toHaveBeenCalled();
    expect(status()).toBe(ElvixSessionStatus.ANONYMOUS);
  });

  it("an unsafe redirect from the server never reaches the host or the browser", async () => {
    const { onResult } = mount({ token: "tok_1", redirect: "javascript:alert(1)" });
    await signInByCode();
    await waitFor(() => expect(onResult).toHaveBeenCalled(), PANE);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true, redirect: "/" }));
  });
});

describe("the session ending updates the host", () => {
  it("signing out flips the provider to anonymous with no refocus", async () => {
    const { fake, signOutNow } = mount({ token: "tok_1" }, [
      ["POST", (u) => u.includes("/api/auth/sign-out"), () => new Response(null, { status: 204 })],
    ]);
    fake.state.context = sampleContext();
    setElvixToken("tok_1");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "elvix.session.token", newValue: "tok_1" }),
      );
    });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));

    fake.state.context = null;
    await act(async () => {
      await signOutNow();
    });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.ANONYMOUS));
  });

  it("a sign-in in another tab reaches this one (storage event)", async () => {
    const { fake } = mount({ token: "tok_1" });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.ANONYMOUS));
    fake.state.context = sampleContext();
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "elvix.session.token", newValue: "tok_x" }),
      );
    });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
  });

  it("an old read that lands after a sign-out does not bring the user back", async () => {
    const { fake, signOutNow } = mount({ token: "tok_1" }, [
      ["POST", (u) => u.includes("/api/auth/sign-out"), () => new Response(null, { status: 204 })],
    ]);
    fake.state.context = sampleContext();
    fake.state.holdContext = true;
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "elvix.session.token", newValue: "t" }),
      );
    });
    // The read above is held at the server; sign out meanwhile.
    fake.state.holdContext = false;
    fake.state.context = null;
    await act(async () => {
      await signOutNow();
    });
    await act(async () => fake.release());
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.ANONYMOUS));
  });
});
