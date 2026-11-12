// @vitest-environment jsdom
/**
 * Passkeys in the identifier field's autofill (0.26, part of Edvard's "the elvix sdk for sign
 * in must be aware of the keyboard on mobile"): a phone offers the person's passkeys over the
 * keyboard, no dialog. Nothing is asked on open; one conditional request on the field's
 * focus; the passkey button ends it before its own dialog, so there is never a second
 * prompt; a picked passkey signs in, a refused one says so, and an offer the browser cannot
 * make is silent.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { json, type Route } from "./helpers/fake-elvix";
import {
  ASSERTION,
  mount,
  PANE,
  pendingUntilAborted,
  readyField,
  resetBrowserStubs,
  stubPasskeys,
} from "./helpers/sign-in-keyboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBrowserStubs();
});

const signedInWithPasskey = (onResult: ReturnType<typeof vi.fn>) =>
  waitFor(() =>
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true, method: "passkey" })),
  );

describe("the field and its request", () => {
  it("names the field for the browser's passkey autofill only when passkeys are on", async () => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    const field = await readyField();
    expect(field.getAttribute("autocomplete")).toBe("email webauthn");
    cleanup();
    mount(<ElvixSignInCard navigate={false} methodUsername />);
    const plain = await screen.findByPlaceholderText(/username/i, {}, PANE);
    expect(plain.getAttribute("autocomplete")).toBe("username");
  });

  it("asks for nothing on open, then one conditional request when the field is focused", async () => {
    const get = stubPasskeys(pendingUntilAborted);
    const fake = mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    const field = await readyField();
    expect(fake.calls("/api/auth/passkey/")).toBe(0);
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0]?.[0]).toMatchObject({ mediation: "conditional" });
    expect(get.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
    // A second focus while it is open does not ask again.
    await act(async () => fireEvent.focus(field));
    expect(get).toHaveBeenCalledTimes(1);
    expect(fake.calls("/api/auth/passkey/sign-in/start")).toBe(1);
  });

  it("stays silent when the browser cannot offer it, and asks nothing", async () => {
    const get = stubPasskeys(pendingUntilAborted, false);
    const fake = mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await act(async () => {});
    expect(get).not.toHaveBeenCalled();
    expect(fake.calls("/api/auth/passkey/")).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stays silent when elvix refuses to start it, and the next focus asks again", async () => {
    const get = stubPasskeys(pendingUntilAborted);
    const refused: Route = [
      "POST",
      (u) => u.includes("/api/auth/passkey/sign-in/start"),
      () => json({ success: false, errorMessage: "passkey_start_failed" }, 500),
    ];
    const fake = mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />, "fine", [
      refused,
    ]);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(fake.calls("/api/auth/passkey/sign-in/start")).toBe(1));
    await act(async () => {});
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByText(/went wrong/)).toBeNull();
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(fake.calls("/api/auth/passkey/sign-in/start")).toBe(2));
  });
});

describe("what comes of it", () => {
  it("the passkey button ends the autofill offer before its dialog: never two prompts", async () => {
    let open = 0;
    let most = 0;
    const get = stubPasskeys((options) => {
      open += 1;
      most = Math.max(most, open);
      if (options.mediation === "conditional") {
        return pendingUntilAborted(options).finally(() => {
          open -= 1;
        });
      }
      open -= 1;
      return Promise.resolve(ASSERTION);
    });
    const onResult = vi.fn();
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const conditionalSignal = get.mock.calls[0]?.[0]?.signal;
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Continue with passkey" })),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(conditionalSignal?.aborted).toBe(true);
    expect(get.mock.calls[1]?.[0]?.mediation).toBeUndefined();
    expect(most).toBe(1);
    await signedInWithPasskey(onResult);
  });

  it("a passkey picked from the autofill signs the person in", async () => {
    stubPasskeys(async () => ASSERTION);
    const onResult = vi.fn();
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await signedInWithPasskey(onResult);
  });

  it("a passkey picked from the autofill that elvix refuses says so", async () => {
    stubPasskeys(async () => ASSERTION);
    const refused: Route = [
      "POST",
      (u) => u.includes("/api/auth/passkey/sign-in/finish"),
      () => json({ success: false, errorMessage: "passkey_verify_failed" }, 400),
    ];
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />, "fine", [refused]);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    // The entry step's error line (its words for this code are the generic ones, as for the
    // button: `humanError` names `verify_failed`, not `passkey_verify_failed`), announced to
    // a screen reader and 12 px under Continue.
    const line = await screen.findByRole("alert", {}, PANE);
    expect(line.textContent).toMatch(/went wrong/);
    expect(line.className).toMatch(/\bmt-3\b/);
  });
});

/** A route whose answer waits until the test lets it through. */
function held(path: string, answer: () => Response) {
  const releases: (() => void)[] = [];
  const route: Route = [
    "POST",
    (u) => u.includes(path),
    () => new Promise<Response>((resolve) => releases.push(() => resolve(answer()))),
  ];
  return { route, releases };
}

describe("one passkey sign-in at a time (the security review, 2026-11-11)", () => {
  it("a field focused while the button's ceremony runs asks for nothing", async () => {
    const start = held("/sign-in/start", () =>
      json({ success: true, data: { options: { challenge: "Y2g" } } }),
    );
    let open = 0;
    let most = 0;
    const get = stubPasskeys((options) => {
      open += 1;
      most = Math.max(most, open);
      if (options.mediation === "conditional") {
        return pendingUntilAborted(options).finally(() => {
          open -= 1;
        });
      }
      return new Promise((resolve) =>
        setTimeout(() => {
          open -= 1;
          resolve(ASSERTION);
        }, 20),
      );
    });
    const fake = mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />, "fine", [
      start.route,
    ]);
    const field = await readyField();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Continue with passkey" })),
    );
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(start.releases).toHaveLength(1));
    await act(async () => {
      for (const release of start.releases) release();
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 60));
    expect(get.mock.calls.map(([o]) => o?.mediation ?? "dialog")).toEqual(["dialog"]);
    expect(most).toBe(1);
    expect(fake.calls("/sign-in/start")).toBe(1);
  });

  it("the button after a passkey picked from the autofill opens no dialog and signs in once", async () => {
    const finish = held("/sign-in/finish", () =>
      json({ success: true, data: { ok: true, redirect: "/home", token: "tok_pk" } }),
    );
    const get = stubPasskeys(async () => ASSERTION);
    const onResult = vi.fn();
    const fake = mount(
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />,
      "fine",
      [finish.route],
    );
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(finish.releases).toHaveLength(1));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Continue with passkey" })),
    );
    await act(async () => {
      for (const release of finish.releases) release();
    });
    await signedInWithPasskey(onResult);
    await new Promise((r) => setTimeout(r, 60));
    expect(get.mock.calls.map(([o]) => o?.mediation ?? "dialog")).toEqual(["conditional"]);
    expect(fake.calls("/sign-in/finish")).toBe(1);
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
