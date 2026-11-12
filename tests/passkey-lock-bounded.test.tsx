// @vitest-environment jsdom
/**
 * Every wait in the passkey path is bounded or abortable, and an abandoned offer never
 * finishes (0.26, security review 5, 2026-11-12). A probe that never answers, an autofill
 * request that ignores its abort (a password-manager extension wrapping WebAuthn), its
 * passkey arriving after the tap: the tap's dialog is the one sign-in. And no browser or
 * extension text ever reaches the page or `onResult`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSignInCard } from "../src/react/index";
import { PasskeyLock, passkeyLockState } from "../src/react/passkey-lock";
import { CLIENT_ID, installFakeElvix, json } from "./helpers/fake-elvix";
import {
  ASSERTION,
  dialogsOf,
  emailField,
  mount,
  PANE,
  passkeyButton,
  pendingUntilAborted,
  resetBrowserStubs,
  stubPasskeys,
  stubPointer,
} from "./helpers/sign-in-keyboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBrowserStubs();
});

const signedInOnce = (onResult: ReturnType<typeof vi.fn>) =>
  waitFor(() => expect(onResult.mock.calls.filter(([r]) => r?.ok)).toHaveLength(1));

async function card(onResult = vi.fn()) {
  const fake = mount(
    <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />,
  );
  await screen.findByText("Sign in to Acme", {}, PANE);
  return { fake, onResult };
}

describe("an autofill offer that does not end by itself", () => {
  it("a probe that never answers: the tap still opens its dialog", async () => {
    const get = stubPasskeys((o) =>
      o.mediation === "conditional" ? pendingUntilAborted(o) : Promise.resolve(ASSERTION),
    );
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: { isConditionalMediationAvailable: () => new Promise(() => {}) },
    });
    const { onResult } = await card();
    await act(async () => fireEvent.focus(emailField()));
    expect(passkeyLockState()).toBe(PasskeyLock.OFFER);
    await act(async () => fireEvent.click(passkeyButton()));
    await waitFor(() => expect(dialogsOf(get)).toBe(1));
    await signedInOnce(onResult);
    expect(passkeyLockState()).toBe(PasskeyLock.FREE);
  });

  it("a request deaf to its abort, its passkey arriving after the tap: one sign-in, the dialog's", async () => {
    let late: (credential: unknown) => void = () => {};
    const get = stubPasskeys((o) =>
      o.mediation === "conditional"
        ? new Promise((resolve) => (late = resolve))
        : Promise.resolve(ASSERTION),
    );
    const { fake, onResult } = await card();
    await act(async () => fireEvent.focus(emailField()));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => fireEvent.click(passkeyButton()));
    await waitFor(() => expect(dialogsOf(get)).toBe(1));
    await signedInOnce(onResult);
    await act(async () => late(ASSERTION));
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.calls("/api/auth/passkey/sign-in/finish")).toBe(1);
    expect(onResult.mock.calls.filter(([r]) => r?.ok)).toHaveLength(1);
    expect(passkeyLockState()).toBe(PasskeyLock.FREE);
  });

  it("a request deaf to its abort: a pagehide still frees the lock", async () => {
    const get = stubPasskeys(() => new Promise(() => {}));
    await card();
    await act(async () => fireEvent.focus(emailField()));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(passkeyLockState()).toBe(PasskeyLock.FREE));
  });

  it("a tap in the very task its passkey arrives: still one sign-in", async () => {
    let arrive: (credential: unknown) => void = () => {};
    const get = stubPasskeys((o) =>
      o.mediation === "conditional"
        ? new Promise((resolve) => (arrive = resolve))
        : Promise.resolve(ASSERTION),
    );
    const { fake, onResult } = await card();
    await act(async () => fireEvent.focus(emailField()));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      arrive(ASSERTION);
      fireEvent.click(passkeyButton());
      fireEvent.click(passkeyButton());
    });
    await signedInOnce(onResult);
    await waitFor(() => expect(passkeyLockState()).toBe(PasskeyLock.FREE));
    expect(fake.calls("/api/auth/passkey/sign-in/finish")).toBe(1);
  });
});

describe("a browser's or an extension's own words", () => {
  it("never reach the page or onResult", async () => {
    installFakeElvix({ context: null }, [
      [
        "POST",
        (u) => u.includes("/sign-in/start"),
        () => json({ success: true, data: { options: { challenge: "Y2g" } } }),
      ],
    ]);
    stubPointer("fine");
    stubPasskeys(() =>
      Promise.reject(Object.assign(new Error("PWNED: call +1 555 0100"), { name: "UnknownError" })),
    );
    const onResult = vi.fn();
    render(
      <ElvixProvider
        clientId={CLIENT_ID}
        baseUrl={window.location.origin}
        presence={false}
        bootstrapRefreshMs={0}
      >
        <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />
      </ElvixProvider>,
    );
    const button = await screen.findByRole("button", { name: "Continue with passkey" }, PANE);
    await act(async () => fireEvent.click(button));
    expect((await screen.findByRole("alert", {}, PANE)).textContent).toBe(
      "Something went wrong. Try again.",
    );
    expect(document.body.textContent).not.toContain("PWNED");
    expect(JSON.stringify(onResult.mock.calls)).not.toContain("PWNED");
  });
});
