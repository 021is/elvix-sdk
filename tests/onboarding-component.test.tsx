// @vitest-environment jsdom
/**
 * `<ElvixOnboarding>`: mounted once, it opens itself on the step a redirect
 * sign-in (Google, GitHub, hosted passkey) brings back, and can be limited to
 * the steps a host wants (passkey only, say).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ElvixOnboarding,
  type ElvixOnboardingProps,
  ElvixProvider,
  ElvixSessionStatus,
  useElvixSession,
} from "../src/react/index";
import {
  clearOnboardingPending,
  setElvixToken,
  signInState,
  takeJustReturnedLanding,
  takeJustReturnedToken,
} from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix, sampleContext } from "./helpers/fake-elvix";

const b64 = (payload: unknown) => btoa(JSON.stringify(payload)).replace(/=+$/, "");

function arrive(landing: unknown) {
  const fragment = new URLSearchParams({
    elvix_token: "tok_redirect",
    elvix_state: String(signInState()),
  });
  if (landing) fragment.set("elvix_landing", b64(landing));
  window.history.replaceState(null, "", `/home#${fragment.toString()}`);
}

function Status() {
  return <output data-testid="status">{useElvixSession()}</output>;
}
const status = () => screen.getByTestId("status").textContent;

function mount(props: ElvixOnboardingProps = {}) {
  installFakeElvix({ context: sampleContext() });
  const onResult = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <Status />
      <ElvixOnboarding onResult={onResult} {...props} />
    </ElvixProvider>,
  );
  return { onResult };
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

const PANE = { timeout: 3000 };

describe("<ElvixOnboarding>", () => {
  it("renders nothing until a redirect return brings a step", async () => {
    mount();
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens itself on the passkey step, and finishing it signs the host in", async () => {
    arrive({ next_step: "passkey", final: "/" });
    const { onResult } = mount();
    await screen.findByText("Sign in faster next time", {}, PANE);
    expect(status()).not.toBe(ElvixSessionStatus.AUTHENTICATED);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Skip for now" })));

    await waitFor(
      () => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
      PANE,
    );
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens on the username step too", async () => {
    arrive({ next_step: "username", suggestions: ["ada"], final: "/" });
    mount();
    await screen.findByText("Pick a username", {}, PANE);
  });

  it("steps={['passkey']} offers the passkey and nothing else", async () => {
    arrive({ next_step: "passkey", final: "/" });
    mount({ steps: ["passkey"] });
    await screen.findByText("Sign in faster next time", {}, PANE);
  });

  it("a step left out of `steps` is not shown and the sign-in just completes", async () => {
    arrive({ next_step: "username", suggestions: ["ada"], final: "/" });
    mount({ steps: ["passkey"] });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED), PANE);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismissing it means 'not now': the host is signed in and it does not reopen", async () => {
    arrive({ next_step: "passkey", final: "/" });
    mount();
    await screen.findByText("Sign in faster next time", {}, PANE);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED), PANE);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can be a drawer", async () => {
    arrive({ next_step: "passkey", final: "/" });
    mount({ presentation: "drawer" });
    await screen.findByText("Sign in faster next time", {}, PANE);
    expect(document.querySelector("[data-vaul-drawer]")).not.toBeNull();
  });

  it("ignores a forged return (no matching state): nothing opens, nobody is signed in", async () => {
    window.history.replaceState(
      null,
      "",
      `/home#elvix_token=evil&elvix_landing=${b64({ next_step: "passkey" })}`,
    );
    mount();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
