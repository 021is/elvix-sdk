// @vitest-environment jsdom
/**
 * `<ElvixSignInCard>`: elvix's sign-in card with no container, for a host's own sheet,
 * page or dialog (0.25). elvix ships the card and its brand; the host owns the container
 * (Edvard, 2026-11-11). What a host's sheet needs from it, as DanceClub's listed it: it
 * fills its parent and never scrolls itself; no overlay, whatever the Console says; no
 * request when it opens; its steps replace each other in place; a focused field stays
 * focused through the host's re-renders; `onResult` once; the provider's theme; and after
 * a redirect, `useElvixOnboarding()` brings the step back and `dismiss()` says "not now".
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ElvixProvider,
  ElvixSessionStatus,
  ElvixSignInCard,
  useElvixApp,
  useElvixOnboarding,
  useElvixSession,
} from "../src/react/index";
import {
  clearOnboardingPending,
  setElvixToken,
  signInState,
  takeJustReturnedLanding,
  takeJustReturnedToken,
} from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix, json, sampleContext } from "./helpers/fake-elvix";

const PANE = { timeout: 3000 };
const CODE_ROUTES = [
  [
    "POST",
    (u: string) => u.includes("/api/auth/otp/start"),
    () => json({ success: true, data: { ok: true, challengeId: "c1" } }),
  ],
  [
    "POST",
    (u: string) => u.includes("/api/auth/otp/verify"),
    () => json({ success: true, data: { ok: true, redirect: "/home", token: "tok_1" } }),
  ],
] as const;

function Provider({ children, theme }: { children: ReactNode; theme?: "light" | "dark" }) {
  return (
    <ElvixProvider
      clientId={CLIENT_ID}
      baseUrl={BASE}
      presence={false}
      bootstrapRefreshMs={0}
      theme={theme}
    >
      {children}
    </ElvixProvider>
  );
}

/** A host that opens its sheet only once the envelope is in, as a page-load provider does. */
function SheetWhenReady({ children }: { children: ReactNode }) {
  const app = useElvixApp();
  const [open, setOpen] = useState(false);
  return (
    <section data-testid="sheet">
      <button type="button" onClick={() => setOpen(true)} disabled={!app}>
        open
      </button>
      {open && children}
    </section>
  );
}

const cardRoot = () => document.querySelector<HTMLElement>("[data-elvix-sign-in-card]");

async function openWhenReady() {
  const button = screen.getByRole("button", { name: "open" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  await act(async () => fireEvent.click(button));
}

async function sendCode() {
  fireEvent.change(await screen.findByPlaceholderText("Enter your email"), {
    target: { value: "ada@example.test" },
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Continue/ })));
}

beforeEach(() => {
  window.sessionStorage.clear();
  setElvixToken(null);
  takeJustReturnedToken();
  takeJustReturnedLanding();
  clearOnboardingPending();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setElvixToken(null);
  window.history.replaceState(null, "", "/");
});

describe("<ElvixSignInCard> in its container", () => {
  it("is the card alone: elvix's brand, in its parent, filling it, never scrolling itself", async () => {
    installFakeElvix({ context: null });
    render(
      <Provider>
        <div data-testid="host">
          <ElvixSignInCard navigate={false} />
        </div>
      </Provider>,
    );
    await screen.findByPlaceholderText("Enter your email", {}, PANE);
    expect(screen.getAllByText(/Acme/).length).toBeGreaterThan(0);
    const root = cardRoot();
    expect(root && screen.getByTestId("host").contains(root)).toBe(true);
    expect(root?.className).toContain("w-full");
    expect(root?.querySelector("[class*='max-w-']")).toBeNull();
    expect(root?.querySelector("[class*='overflow-y-auto'], [class*='overflow-auto']")).toBeNull();
    expect(screen.getByRole("link", { name: /Secured by\s*elvix/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays a card when the Console asks for a drawer or a modal", async () => {
    const fake = installFakeElvix({ context: null });
    fake.state.bootstrap = { ...fake.state.bootstrap, presentation: "drawer" };
    render(
      <Provider>
        <ElvixSignInCard navigate={false} />
      </Provider>,
    );
    await screen.findByPlaceholderText("Enter your email", {}, PANE);
    expect(document.querySelector("[data-vaul-drawer]")).toBeNull();
    expect(cardRoot()).not.toBeNull();
  });

  it("makes no request when it opens on a page whose provider has loaded", async () => {
    const fake = installFakeElvix({ context: null });
    render(
      <Provider>
        <SheetWhenReady>
          <ElvixSignInCard navigate={false} />
        </SheetWhenReady>
      </Provider>,
    );
    await openWhenReady();
    await waitFor(() => expect(cardRoot()).not.toBeNull());
    const before = fake.fetchMock.mock.calls.length;
    await screen.findByPlaceholderText("Enter your email");
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.fetchMock.mock.calls.length).toBe(before);
  });

  it("renders inert with mode='preview', for docs and design tools", async () => {
    const fake = installFakeElvix({ context: null });
    render(
      <Provider>
        <ElvixSignInCard mode="preview" navigate={false} />
      </Provider>,
    );
    fireEvent.change(await screen.findByPlaceholderText("Enter your email"), {
      target: { value: "ada@example.test" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Continue/ })));
    expect(fake.calls("/api/auth/otp/start")).toBe(0);
  });
});

describe("<ElvixSignInCard>'s flow", () => {
  it("replaces its steps in place and reports the sign-in once", async () => {
    installFakeElvix({ context: null }, [...CODE_ROUTES]);
    const onResult = vi.fn();
    render(
      <Provider>
        <ElvixSignInCard navigate={false} onResult={onResult} />
      </Provider>,
    );
    await sendCode();
    const root = cardRoot();
    await screen.findByText(/We sent a code to/, {}, PANE);
    expect(cardRoot()).toBe(root);
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "123456" } }),
    );
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1), PANE);
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, method: "email_otp" }),
    );
    expect(cardRoot()).toBe(root);
  });

  it("keeps the focused field focused when the host re-renders it", async () => {
    installFakeElvix({ context: null });
    const { rerender } = render(
      <Provider>
        <ElvixSignInCard navigate={false} onResult={() => undefined} />
      </Provider>,
    );
    const field = await screen.findByPlaceholderText("Enter your email");
    act(() => field.focus());
    rerender(
      <Provider>
        <ElvixSignInCard navigate={false} onResult={() => undefined} />
      </Provider>,
    );
    expect(document.activeElement).toBe(field);
  });

  it("gives the host's line under the methods room of its own", async () => {
    // Edvard, 2026-11-11, DanceClub's tagline glued to Continue: "I hope this is going to
    // get fixed soon". It gets the legal line's 20 px.
    installFakeElvix({ context: null });
    render(
      <Provider>
        <ElvixSignInCard navigate={false} belowMethods={<p>Nobody dances alone.</p>} />
      </Provider>,
    );
    const line = await screen.findByText("Nobody dances alone.");
    expect(line.parentElement?.className).toContain("mt-5");
  });

  it("wears the provider's pinned theme", async () => {
    installFakeElvix({ context: null });
    render(
      <Provider theme="dark">
        <ElvixSignInCard navigate={false} />
      </Provider>,
    );
    await screen.findByPlaceholderText("Enter your email");
    expect(cardRoot()?.style.getPropertyValue("--elvix-surface")).toBe("#0d0d10");
  });
});

describe("a host's own sheet after a redirect sign-in", () => {
  function Status() {
    return <output data-testid="status">{useElvixSession()}</output>;
  }

  function HostSheet() {
    const { pending, dismiss } = useElvixOnboarding();
    if (!pending) return null;
    return (
      <section>
        <button type="button" onClick={dismiss}>
          close sheet
        </button>
        <ElvixSignInCard navigate={false} />
      </section>
    );
  }

  function arrive(landing: unknown) {
    const fragment = new URLSearchParams({
      elvix_token: "tok_redirect",
      elvix_state: String(signInState()),
      elvix_landing: btoa(JSON.stringify(landing)).replace(/=+$/, ""),
    });
    window.history.replaceState(null, "", `/home#${fragment.toString()}`);
  }

  it("opens on the step, and dismiss() means 'not now': the host is signed in", async () => {
    arrive({ next_step: "passkey", final: "/" });
    installFakeElvix({ context: sampleContext() });
    render(
      <Provider>
        <Status />
        <HostSheet />
      </Provider>,
    );
    await screen.findByText("Sign in faster next time", {}, PANE);
    expect(screen.getByTestId("status").textContent).not.toBe(ElvixSessionStatus.AUTHENTICATED);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "close sheet" })));

    await waitFor(
      () => expect(screen.getByTestId("status").textContent).toBe(ElvixSessionStatus.AUTHENTICATED),
      PANE,
    );
    expect(screen.queryByText("Sign in faster next time")).toBeNull();
  });
});
