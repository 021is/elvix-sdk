// @vitest-environment jsdom
/**
 * A redirect sign-in (Google, GitHub, the hosted passkey page) reloads the host
 * page, so on return the sign-in MODAL is closed and nothing is mounted to
 * show the onboarding step the server asked for. The SDK read the step from the
 * URL and dropped it: a user who signed in with Google was never offered the
 * passkey, while the same user signing in with a username (in-frame, modal open)
 * was. The modal must open on a return that carries a step, and the host must
 * not see a signed-in user until that step is done.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ElvixProvider,
  ElvixSessionStatus,
  ElvixSignInForm,
  useElvixOnboarding,
  useElvixSession,
} from "../src/react/index";
import {
  clearOnboardingPending,
  consumeElvixReturnToken,
  setElvixToken,
  signInState,
  takeJustReturnedLanding,
  takeJustReturnedToken,
} from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix, sampleContext } from "./helpers/fake-elvix";

const b64 = (payload: unknown) => btoa(JSON.stringify(payload)).replace(/=+$/, "");

function arriveFromGoogle(landing: unknown) {
  const state = signInState();
  const fragment = new URLSearchParams({ elvix_token: "tok_google", elvix_state: String(state) });
  if (landing) fragment.set("elvix_landing", b64(landing));
  window.history.replaceState(null, "", `/login#${fragment.toString()}`);
}

function Status() {
  return <output data-testid="status">{useElvixSession()}</output>;
}

function mount() {
  // The server holds a valid session for the minted token from the first read.
  const fake = installFakeElvix({ context: sampleContext() });
  const onResult = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <Status />
      <ElvixSignInForm
        presentation="modal"
        navigate={false}
        onResult={onResult}
        methodPasskey
        methodEmailOtp
        appName="Acme"
      />
    </ElvixProvider>,
  );
  return { fake, onResult };
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

const status = () => screen.getByTestId("status").textContent;

describe("a redirect return that carries an onboarding step", () => {
  it("opens the closed modal on the step", async () => {
    arriveFromGoogle({ next_step: "passkey", final: "/" });
    mount();
    expect(await screen.findByText("Sign in faster next time", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not tell the host the user is signed in until the step is done", async () => {
    arriveFromGoogle({ next_step: "passkey", final: "/" });
    const { onResult } = mount();
    await screen.findByText("Sign in faster next time", {}, { timeout: 3000 });
    // Give the provider's first session read time to land: the server would say yes.
    await new Promise((r) => setTimeout(r, 200));
    expect(status()).not.toBe(ElvixSessionStatus.AUTHENTICATED);
    expect(onResult).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Skip for now" })));

    await waitFor(() => expect(onResult).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
  });

  it("works for the username step too, with the server's suggestions", async () => {
    arriveFromGoogle({ next_step: "username", suggestions: ["ada"], final: "/" });
    mount();
    expect(await screen.findByText("Pick a username", {}, { timeout: 3000 })).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Claim @ada" }, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it("lands on the recover pane for a membership the person can restore", async () => {
    arriveFromGoogle({
      next_step: "recover",
      final: "/",
      recover: { appId: "app_1", appName: "Acme", state: "inactive", sinceAt: "2026-01-01" },
    });
    mount();
    // The recover gate names the app and offers restore; not the passkey pane.
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toMatch(/Acme/), {
      timeout: 3000,
    });
    expect(screen.queryByText("Sign in faster next time")).toBeNull();
  });
});

describe("a redirect return with nothing left to do", () => {
  it("leaves the modal closed and the host signed in", async () => {
    arriveFromGoogle({ next_step: "done", redirect: "/home" });
    mount();
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a forged return (no matching state) opens nothing and signs nobody in", async () => {
    window.history.replaceState(
      null,
      "",
      `/login#elvix_token=evil&elvix_landing=${b64({ next_step: "passkey" })}`,
    );
    const { fake } = mount();
    await waitFor(() => expect(fake.calls("/sdk-context")).toBeGreaterThan(0));
    expect(consumeElvixReturnToken()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("handing the step to the host", () => {
  function Probe() {
    const { pending, step } = useElvixOnboarding();
    return <output data-testid="onboarding">{pending ? `pending:${step}` : "none"}</output>;
  }

  function mountCustom(resumeOnReturn: boolean) {
    installFakeElvix({ context: sampleContext() });
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <Probe />
        <Status />
        <ElvixSignInForm
          presentation="modal"
          navigate={false}
          resumeOnReturn={resumeOnReturn}
          methodPasskey
          appName="Acme"
        />
      </ElvixProvider>,
    );
  }

  it("useElvixOnboarding says a passkey step is waiting, while the host stays signed out", async () => {
    arriveFromGoogle({ next_step: "passkey", final: "/" });
    mountCustom(false);
    await waitFor(() =>
      expect(screen.getByTestId("onboarding").textContent).toBe("pending:passkey"),
    );
    expect(status()).not.toBe(ElvixSessionStatus.AUTHENTICATED);
  });

  it("resumeOnReturn={false} leaves the modal closed for the host to open", async () => {
    arriveFromGoogle({ next_step: "passkey", final: "/" });
    mountCustom(false);
    await waitFor(() =>
      expect(screen.getByTestId("onboarding").textContent).toBe("pending:passkey"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is quiet when the return has nothing left to do", async () => {
    arriveFromGoogle({ next_step: "done", redirect: "/home" });
    mountCustom(true);
    await waitFor(() => expect(status()).toBe(ElvixSessionStatus.AUTHENTICATED));
    expect(screen.getByTestId("onboarding").textContent).toBe("none");
  });

  it("clears once the step is finished", async () => {
    arriveFromGoogle({ next_step: "passkey", final: "/" });
    mountCustom(true);
    await screen.findByText("Sign in faster next time", {}, { timeout: 3000 });
    expect(screen.getByTestId("onboarding").textContent).toBe("pending:passkey");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Skip for now" })));
    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("none"));
  });
});
