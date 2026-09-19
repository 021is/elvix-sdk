// @vitest-environment jsdom
/**
 * The provider's user envelope and brand (0.12 batch #7, #8, #9, #10).
 *
 *   #9  the envelope was fetched once per mount, and no refresh existed, so a
 *       username or name change stayed stale in every host consumer.
 *   #8  the sign-in button and form ignored the app's Console brand unless the
 *       host restated it as props — and never picked the dark variant.
 *   #7/#10 the envelope now carries the identity summary and languages.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixProvider,
  ElvixSignInButton,
  ElvixSignInForm,
  useElvixAppContext,
  useElvixContext,
  useElvixSession,
} from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, sampleContext } from "./helpers/fake-elvix";

function Provider({ children, theme }: { children: ReactNode; theme?: "light" | "dark" }) {
  return (
    <ElvixProvider
      clientId={CLIENT_ID}
      baseUrl={BASE}
      theme={theme}
      presence={false}
      bootstrapRefreshMs={0}
    >
      {children}
    </ElvixProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("#9 refresh()", () => {
  function Probe() {
    const appCtx = useElvixAppContext();
    const status = useElvixSession();
    const { refresh } = useElvixContext();
    return (
      <>
        <output>{`${status}:${appCtx?.membership?.username ?? "-"}`}</output>
        <button type="button" onClick={() => void refresh()}>
          refresh
        </button>
      </>
    );
  }

  it("re-reads the envelope so consumers see a new value, without flashing signed-out", async () => {
    const fake = installFakeElvix({ context: sampleContext("usr_9") });
    render(
      <Provider>
        <Probe />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("authenticated:ada"));

    const next = sampleContext("usr_9");
    next.membership.username = "augusta";
    fake.state.context = next;
    fake.state.holdContext = true;
    await act(async () => screen.getByRole("button", { name: "refresh" }).click());

    // While the new envelope is in flight, the old one stays.
    expect(screen.getByRole("status").textContent).toBe("authenticated:ada");
    await act(async () => fake.release());
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("authenticated:augusta"),
    );
  });
});

describe("bootstrap refresh", () => {
  it("returning to the tab reloads the bootstrap at most once, not per event", async () => {
    const fake = installFakeElvix();
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false}>
        <span />
      </ElvixProvider>,
    );
    await waitFor(() => expect(fake.calls("/api/v1/bootstrap/")).toBe(1));
    // A tab return fires both; the mount load was just now, so neither refetches.
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(fake.calls("/api/v1/bootstrap/")).toBe(1);
  });
});

describe("#7/#10 identity summary and languages", () => {
  it("passes the new fields through to hosts", async () => {
    installFakeElvix({
      context: sampleContext("usr_7", {
        pronouns: "she_her",
        languages: [{ code: "en", level: "NATIVE" }],
      }),
    });
    function Probe() {
      const user = useElvixAppContext()?.user;
      return (
        <output>
          {user
            ? `${user.givenName} ${user.familyName} ${user.pronouns} ${user.languages[0]?.code}`
            : ""}
        </output>
      );
    }
    render(
      <Provider>
        <Probe />
      </Provider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Ada Lovelace she_her en"),
    );
  });
});

describe("#8 sign-in surfaces default to the app's brand", () => {
  // The fake app's Console brand: #112233 light, #ddeeff dark.
  const LIGHT = "rgb(17, 34, 51)";
  const DARK = "rgb(221, 238, 255)";

  const button = () => screen.getByRole("button") as HTMLButtonElement;

  it("ElvixSignInButton paints the light brand on a light provider", async () => {
    installFakeElvix();
    render(
      <Provider theme="light">
        <ElvixSignInButton mode="callback" onClick={() => {}} />
      </Provider>,
    );
    await waitFor(() => expect(button().style.background).toBe(LIGHT));
  });

  it("ElvixSignInButton paints the dark brand on a dark provider", async () => {
    installFakeElvix();
    render(
      <Provider theme="dark">
        <ElvixSignInButton mode="callback" onClick={() => {}} />
      </Provider>,
    );
    await waitFor(() => expect(button().style.background).toBe(DARK));
  });

  it("an explicit brandColor prop still wins", async () => {
    installFakeElvix();
    render(
      <Provider theme="dark">
        <ElvixSignInButton mode="callback" onClick={() => {}} brandColor="#ff0000" />
      </Provider>,
    );
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(button().style.background).toBe("rgb(255, 0, 0)");
  });

  it("ElvixSignInForm's trigger follows the provider's dark theme over the Console default", async () => {
    // The app's Console theme is "light"; the host pinned dark on the provider.
    installFakeElvix();
    render(
      <Provider theme="dark">
        <ElvixSignInForm presentation="drawer" />
      </Provider>,
    );
    await waitFor(() => expect(button().style.background).toBe(DARK));
  });
});
