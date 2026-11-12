// @vitest-environment jsdom
/**
 * The page-wide passkey lock never sticks (0.26, security reviews 3 and 4, 2026-11-12):
 * every passkey request is bounded, so a request that never answers ends as a retryable
 * error and frees the lock; a tap ends an offer still waiting for its pick; a card gone
 * mid-dialog shows its dialog on the next card; a page left for the back-forward cache ends
 * its waiting offer. Nobody takes the lock over: see `passkey-lock-picked.test.tsx`.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { PasskeyLock, passkeyLockState } from "../src/react/passkey-lock";
import { PASSKEY_REQUEST_TIMEOUT_MS } from "../src/react/passkey-timeout";
import {
  ASSERTION,
  dialogsOf,
  emailField,
  heldRoute,
  mount,
  PANE,
  passkeyButton,
  pendingUntilAborted,
  resetBrowserStubs,
  stubPasskeys,
} from "./helpers/sign-in-keyboard";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBrowserStubs();
});

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const signedIn = (onResult: ReturnType<typeof vi.fn>) =>
  waitFor(() =>
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true, method: "passkey" })),
  );

const browser = () =>
  stubPasskeys((o) =>
    o.mediation === "conditional" ? pendingUntilAborted(o) : Promise.resolve(ASSERTION),
  );

describe("a request that never answers", () => {
  it("an offer's start: the tap aborts it, and the dialog opens at once", async () => {
    const get = browser();
    const start = heldRoute("POST", "/api/auth/passkey/sign-in/start");
    const onResult = vi.fn();
    mount(
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />,
      "fine",
      [start.route],
    );
    await screen.findByText("Sign in to Acme", {}, PANE);
    await act(async () => fireEvent.focus(emailField()));
    await tick();
    await act(async () => fireEvent.click(passkeyButton()));
    await waitFor(() => expect(dialogsOf(get)).toBe(1));
    await signedIn(onResult);
  });

  it("the button's start: after the timeout it says so, frees the lock, and a retry works", async () => {
    const get = browser();
    const start = heldRoute("POST", "/api/auth/passkey/sign-in/start");
    const onResult = vi.fn();
    mount(
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />,
      "fine",
      [start.route],
    );
    await screen.findByText("Sign in to Acme", {}, PANE);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => fireEvent.click(passkeyButton()));
    expect(passkeyLockState()).toBe(PasskeyLock.BUSY);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PASSKEY_REQUEST_TIMEOUT_MS);
    });
    expect(await screen.findByRole("alert", {}, PANE)).toHaveProperty(
      "textContent",
      "Network hiccup. Try again.",
    );
    expect(passkeyLockState()).toBe(PasskeyLock.FREE);
    await act(async () => fireEvent.click(passkeyButton()));
    await waitFor(() => expect(dialogsOf(get)).toBe(1));
    await signedIn(onResult);
  });

  it("a body that never ends: the timeout frees the lock, with the retry line", async () => {
    browser();
    let starts = 0;
    const endless = () => new Response(new ReadableStream({ start() {} }), { status: 200 });
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />, "fine", [
      ["POST", (u) => u.includes("/api/auth/passkey/sign-in/start") && starts++ === 0, endless],
    ]);
    await screen.findByText("Sign in to Acme", {}, PANE);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => fireEvent.click(passkeyButton()));
    expect(passkeyLockState()).toBe(PasskeyLock.BUSY);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PASSKEY_REQUEST_TIMEOUT_MS);
    });
    expect((await screen.findByRole("alert", {}, PANE)).textContent).toBe(
      "Network hiccup. Try again.",
    );
    expect(passkeyLockState()).toBe(PasskeyLock.FREE);
  });
});

describe("a ceremony whose card is gone", () => {
  it("shows on the next card's button until it ends", async () => {
    let dismiss: () => void = () => {};
    let n = 0;
    const get = stubPasskeys((o) => {
      if (o.mediation === "conditional") return pendingUntilAborted(o);
      n += 1;
      if (n > 1) return Promise.resolve(ASSERTION);
      return new Promise((_, reject) => {
        dismiss = () => reject(new DOMException("dismissed", "NotAllowedError"));
      });
    });
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    await screen.findByText("Sign in to Acme", {}, PANE);
    await act(async () => fireEvent.click(passkeyButton()));
    await waitFor(() => expect(dialogsOf(get)).toBe(1));
    cleanup();
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    await screen.findByText("Sign in to Acme", {}, PANE);
    expect(passkeyButton().hasAttribute("disabled")).toBe(true);
    await act(async () => dismiss());
    await waitFor(() => expect(passkeyButton().hasAttribute("disabled")).toBe(false));
    await act(async () => fireEvent.click(passkeyButton()));
    await waitFor(() => expect(dialogsOf(get)).toBe(2));
  });
});

describe("a page left for the back-forward cache", () => {
  it("ends an offer still waiting for its pick, which frees the lock", async () => {
    const get = stubPasskeys(pendingUntilAborted);
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    await screen.findByText("Sign in to Acme", {}, PANE);
    await act(async () => fireEvent.focus(emailField()));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(passkeyLockState()).toBe(PasskeyLock.OFFER);
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(passkeyLockState()).toBe(PasskeyLock.FREE));
    expect(get.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  });
});
