// @vitest-environment jsdom
/**
 * A passkey picked from the autofill is a sign-in (0.26, security review 4, 2026-11-12): it
 * keeps the page's passkey lock until it is done, however slow its finish, so no tap and no
 * `pagehide` ever lets a second ceremony mint a second session; and a host callback that
 * throws on its way is the host's own uncaught error, never words on the page.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { PasskeyLock, passkeyLockState } from "../src/react/passkey-lock";
import { json } from "./helpers/fake-elvix";
import {
  ASSERTION,
  dialogsOf,
  emailField,
  heldRoute,
  mount,
  PANE,
  passkeyButton,
  resetBrowserStubs,
  stubPasskeys,
} from "./helpers/sign-in-keyboard";

/** What reached the page as uncaught (`reportError`'s `error` events, jsdom's path). */
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
const SIGNED_IN = { success: true, data: { ok: true, redirect: "/home", token: "tok_pk" } };

/** A card whose autofill offer has a passkey picked and its finish held open. */
async function pickedWithSlowFinish(onResult: ReturnType<typeof vi.fn>, extra = <></>) {
  let pick: (value: unknown) => void = () => {};
  const get = stubPasskeys((o) =>
    o.mediation === "conditional"
      ? new Promise((resolve) => (pick = resolve))
      : Promise.resolve(ASSERTION),
  );
  const finish = heldRoute("POST", "/api/auth/passkey/sign-in/finish");
  const fake = mount(
    <>
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />
      {extra}
    </>,
    "fine",
    [finish.route],
  );
  await screen.findAllByText("Sign in to Acme", {}, PANE);
  await act(async () => fireEvent.focus(emailField()));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  await act(async () => pick(ASSERTION));
  await waitFor(() => expect(fake.calls("/api/auth/passkey/sign-in/finish")).toBe(1));
  return { get, fake, finish };
}

describe("a picked offer whose finish is slow", () => {
  it("keeps the lock: taps, however late, open no dialog; one finish, one sign-in", async () => {
    const onResult = vi.fn();
    const { get, fake, finish } = await pickedWithSlowFinish(onResult);
    expect(passkeyLockState()).toBe(PasskeyLock.BUSY);
    expect(passkeyButton().hasAttribute("disabled")).toBe(true);
    await act(async () => fireEvent.click(passkeyButton()));
    // A finish slower than any wait: the lock is the sign-in's until it is done.
    await act(async () => tick(3300));
    await act(async () => fireEvent.click(passkeyButton()));
    await tick(200);
    expect(dialogsOf(get)).toBe(0);
    await act(async () => finish.answer(json(SIGNED_IN)));
    await waitFor(() => expect(passkeyLockState()).toBe(PasskeyLock.FREE));
    expect(fake.calls("/api/auth/passkey/sign-in/finish")).toBe(1);
    expect(onResult.mock.calls.filter(([r]) => r?.ok)).toHaveLength(1);
  }, 10_000);

  it("keeps the lock through a pagehide, and still signs in once", async () => {
    const onResult = vi.fn();
    const { get, fake, finish } = await pickedWithSlowFinish(onResult);
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(passkeyLockState()).toBe(PasskeyLock.BUSY);
    await act(async () => fireEvent.click(passkeyButton()));
    await act(async () => finish.answer(json(SIGNED_IN)));
    await waitFor(() => expect(passkeyLockState()).toBe(PasskeyLock.FREE));
    expect(dialogsOf(get)).toBe(0);
    expect(fake.calls("/api/auth/passkey/sign-in/finish")).toBe(1);
    expect(onResult.mock.calls.filter(([r]) => r?.ok)).toHaveLength(1);
  });
});

describe("a host onResult that throws after a picked passkey fails", () => {
  it("is reported once as the host's own error, its words never on the page", async () => {
    window.addEventListener("error", onUncaught);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const hostBug = vi.fn(() => {
      throw new Error("host-internal-detail");
    });
    const { get, finish } = await pickedWithSlowFinish(
      hostBug,
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />,
    );
    await act(async () =>
      finish.answer(json({ success: false, errorMessage: "internal: db timeout at node-7" }, 500)),
    );
    await waitFor(() => expect(passkeyLockState()).toBe(PasskeyLock.FREE));
    expect(document.body.textContent).not.toContain("host-internal-detail");
    expect(document.body.textContent).not.toContain("db timeout");
    const reported = [...uncaught, ...logged.mock.calls.map(([e]) => e)];
    expect(reported).toEqual([expect.objectContaining({ message: "host-internal-detail" })]);
    await act(async () => fireEvent.click(passkeyButton(1)));
    await waitFor(() => expect(dialogsOf(get)).toBe(1));
  });
});
