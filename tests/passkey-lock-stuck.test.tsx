// @vitest-environment jsdom
/**
 * The page-wide passkey lock never sticks (0.26, security review 3, 2026-11-12). A stalled
 * offer, a host callback that throws, a card gone mid-dialog, a page left for the
 * back-forward cache: after each, a tap on a passkey button still opens one dialog.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { OFFER_END_WAIT_MS, PasskeyLock, passkeyLockState } from "../src/react/passkey-lock";
import { json, type Route } from "./helpers/fake-elvix";
import {
  ASSERTION,
  mount,
  PANE,
  pendingUntilAborted,
  resetBrowserStubs,
  stubPasskeys,
} from "./helpers/sign-in-keyboard";

/** What reached the page as uncaught: `reportError`'s `error` events (jsdom's path), or
 *  the console where a browser has no `reportError`. */
const uncaught: unknown[] = [];
const onUncaught = (e: ErrorEvent) => {
  e.preventDefault();
  uncaught.push(e.error);
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBrowserStubs();
  window.removeEventListener("error", onUncaught);
  uncaught.length = 0;
});

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const buttons = () => screen.getAllByRole("button", { name: "Continue with passkey" });
const fields = () => screen.getAllByPlaceholderText("Enter your email");
const first = <T,>(list: T[], at = 0): T => {
  const item = list[at];
  if (item === undefined) throw new Error(`nothing at ${at}`);
  return item;
};
const dialogs = (get: ReturnType<typeof stubPasskeys>) =>
  get.mock.calls.filter(([o]) => o?.mediation !== "conditional").length;

/** The first `sign-in/start` (the offer's) never answers: `abortable` ends it on its
 *  signal, as a browser's fetch does; otherwise it ignores even that. */
function stalledStart(abortable: boolean): Route {
  let starts = 0;
  return [
    "POST",
    (u) => u.includes("/api/auth/passkey/sign-in/start") && starts++ === 0,
    (_, init) =>
      new Promise<Response>((_resolve, reject) => {
        if (abortable) init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  ];
}

async function offerThenTap(route: Route) {
  const get = stubPasskeys((o) =>
    o.mediation === "conditional" ? pendingUntilAborted(o) : Promise.resolve(ASSERTION),
  );
  const onResult = vi.fn();
  mount(
    <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />,
    "fine",
    [route],
  );
  await screen.findByText("Sign in to Acme", {}, PANE);
  await act(async () => fireEvent.focus(first(fields())));
  await tick();
  await act(async () => fireEvent.click(first(buttons())));
  return { get, onResult };
}

describe("an offer whose start never answers", () => {
  it("is ended by the tap: its start is aborted, and the dialog opens at once", async () => {
    const { get, onResult } = await offerThenTap(stalledStart(true));
    await waitFor(() => expect(dialogs(get)).toBe(1));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, method: "passkey" }),
      ),
    );
  });

  it(
    "holds the button at most OFFER_END_WAIT_MS, even when it ignores the abort",
    async () => {
      const { get } = await offerThenTap(stalledStart(false));
      expect(dialogs(get)).toBe(0);
      await waitFor(() => expect(dialogs(get)).toBe(1), { timeout: OFFER_END_WAIT_MS + 1500 });
    },
    OFFER_END_WAIT_MS + 5000,
  );
});

describe("a host onResult that throws after an autofill pick", () => {
  it("is reported, and the next tap still opens a dialog", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    window.addEventListener("error", onUncaught);
    let pick: (value: unknown) => void = () => {};
    const get = stubPasskeys((o) =>
      o.mediation === "conditional"
        ? new Promise((resolve) => (pick = resolve))
        : Promise.resolve(ASSERTION),
    );
    let refuse: () => void = () => {};
    const finish: Route = [
      "POST",
      (u) => u.includes("/api/auth/passkey/sign-in/finish") && get.mock.calls.length === 1,
      () =>
        new Promise<Response>((resolve) => (refuse = () => resolve(json({ success: false }, 400)))),
    ];
    const hostBug = vi.fn(() => {
      throw new Error("host bug");
    });
    mount(
      <>
        <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={hostBug} />
        <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />
      </>,
      "fine",
      [finish],
    );
    await screen.findAllByText("Sign in to Acme", {}, PANE);
    await act(async () => fireEvent.focus(first(fields())));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => pick(ASSERTION));
    await tick();
    await act(async () => fireEvent.click(first(buttons(), 1)));
    await act(async () => refuse());
    await tick(200);
    expect(dialogs(get)).toBe(0);
    await act(async () => fireEvent.click(first(buttons(), 1)));
    await waitFor(() => expect(dialogs(get)).toBe(1));
    // The host's own error, reported once as uncaught: not swallowed, not in the lock's way.
    const reported = [...uncaught, ...logged.mock.calls.map(([e]) => e)];
    expect(reported).toEqual([expect.objectContaining({ message: "host bug" })]);
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
    await act(async () => fireEvent.click(first(buttons())));
    await waitFor(() => expect(dialogs(get)).toBe(1));
    cleanup();
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    await screen.findByText("Sign in to Acme", {}, PANE);
    expect(first(buttons()).hasAttribute("disabled")).toBe(true);
    await act(async () => dismiss());
    await waitFor(() => expect(first(buttons()).hasAttribute("disabled")).toBe(false));
    await act(async () => fireEvent.click(first(buttons())));
    await waitFor(() => expect(dialogs(get)).toBe(2));
  });
});

describe("a page left for the back-forward cache", () => {
  it("ends its offer and frees the lock", async () => {
    const get = stubPasskeys(pendingUntilAborted);
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    await screen.findByText("Sign in to Acme", {}, PANE);
    await act(async () => fireEvent.focus(first(fields())));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(passkeyLockState()).toBe(PasskeyLock.OFFER);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(passkeyLockState()).toBe(PasskeyLock.FREE);
    expect(get.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  });
});
