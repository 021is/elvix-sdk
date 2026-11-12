// @vitest-environment jsdom
/**
 * One passkey request per page, across cards (0.26, the security review, 2026-11-12): two
 * cards on one page (an inline form and a sign-in button's modal) share `passkey-lock.ts`.
 * Card A's autofill offer is ended before card B's dialog, and B's open ceremony keeps A's
 * field from asking: the browser never holds two requests, and B never falls back to the
 * hosted page because the browser refused one.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import {
  ASSERTION,
  type Get,
  mount,
  PANE,
  pendingUntilAborted,
  resetBrowserStubs,
  stubPasskeys,
} from "./helpers/sign-in-keyboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBrowserStubs();
});

/** The browser: one request at a time, as a real one holds; a second open one is refused. */
function oneAtATime(dialog: () => Promise<unknown>) {
  const seen = { open: 0, most: 0, refused: 0 };
  const get: Get = (options) => {
    if (seen.open > 0) {
      seen.refused += 1;
      return Promise.reject(new DOMException("A request is already pending.", "NotAllowedError"));
    }
    seen.open += 1;
    seen.most = Math.max(seen.most, seen.open);
    const answer = options.mediation === "conditional" ? pendingUntilAborted(options) : dialog();
    return answer.finally(() => {
      seen.open -= 1;
    });
  };
  return { seen, get: stubPasskeys(get) };
}

function second<T>(list: T[], which: 0 | 1): T {
  const item = list[which];
  if (item === undefined) throw new Error(`no card ${which}`);
  return item;
}

/** Card A (no `onResult`) and card B, each's field and passkey button. */
async function twoCards(onResult = vi.fn()) {
  mount(
    <>
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />
      <ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />
    </>,
  );
  await screen.findAllByText("Sign in to Acme", {}, PANE);
  const fields = screen.getAllByPlaceholderText("Enter your email");
  const buttons = screen.getAllByRole("button", { name: "Continue with passkey" });
  return { fieldA: second(fields, 0), buttonB: second(buttons, 1), onResult };
}

describe("two cards on one page", () => {
  it("card B's button ends card A's autofill offer before its own dialog", async () => {
    const { seen, get } = oneAtATime(async () => ASSERTION);
    const { fieldA, buttonB, onResult } = await twoCards();
    await act(async () => fireEvent.focus(fieldA));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const offer = get.mock.calls[0]?.[0]?.signal;
    await act(async () => fireEvent.click(buttonB));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, method: "passkey" }),
      ),
    );
    expect(offer?.aborted).toBe(true);
    expect(seen.refused).toBe(0);
    expect(seen.most).toBe(1);
  });

  it("card A's field asks for nothing while card B's ceremony is open", async () => {
    let finish: (value: unknown) => void = () => {};
    const { seen, get } = oneAtATime(() => new Promise((resolve) => (finish = resolve)));
    const { fieldA, buttonB } = await twoCards();
    await act(async () => fireEvent.click(buttonB));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => fireEvent.focus(fieldA));
    await new Promise((r) => setTimeout(r, 60));
    expect(get).toHaveBeenCalledTimes(1);
    expect(seen.refused).toBe(0);
    await act(async () => finish(ASSERTION));
  });
});
