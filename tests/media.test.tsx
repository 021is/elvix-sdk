// @vitest-environment jsdom
/**
 * The centralized photo, as the signed-in user sees it (0.12 batch #1–#4).
 *
 * Each test reproduces a defect DanceClub hit on 0.11.0 and fails on that code:
 *   #1 `<ElvixUserAvatar>` with no `userId` read the per-app meta, empty since
 *      0.10, and painted initials for everyone.
 *   #2 `<ElvixAvatar>` asked about `"preview-user"` before the session landed,
 *      got elvix's honest "no photo", and kept it forever (seed-once).
 *   #3 hosts had no hook for "does this user have a photo".
 *   #4 an upload never reached the media cache, so the editor remounted with
 *      the OLD photo.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElvixAvatar, ElvixProvider, ElvixUserAvatar, useElvixUserMedia } from "../src/react/index";
import { publishMedia } from "../src/react/live-media";
import { _clearUserMediaCache } from "../src/react/user-media";
import { BASE, CLIENT_ID, installFakeElvix, photo, sampleContext } from "./helpers/fake-elvix";

function Provider({ children }: { children: ReactNode }) {
  return (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {children}
    </ElvixProvider>
  );
}

const imgSrc = (container: HTMLElement) => container.querySelector("img")?.getAttribute("src");

beforeEach(() => {
  _clearUserMediaCache();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("#1 ElvixUserAvatar for the signed-in user", () => {
  it("renders the centralized photo, not initials from the empty per-app meta", async () => {
    installFakeElvix({ context: sampleContext("usr_1"), media: { usr_1: photo(111) } });

    const { container } = render(
      <Provider>
        <ElvixUserAvatar />
      </Provider>,
    );

    await waitFor(() => expect(imgSrc(container)).toContain("/users/usr_1/avatar-"));
    expect(imgSrc(container)).toContain("v=111");
  });
});

describe("#2 ElvixAvatar when the session arrives after mount", () => {
  it("shows the user's photo once the session resolves", async () => {
    const fake = installFakeElvix({
      context: sampleContext("usr_2"),
      media: { usr_2: photo(222) },
      holdContext: true,
    });

    const { container } = render(
      <Provider>
        <ElvixAvatar size={96} />
      </Provider>,
    );
    // Bootstrap is in, the session is not: this is the window where 0.11
    // looked up "preview-user" and locked in its empty answer.
    await waitFor(() => expect(fake.calls("/api/v1/bootstrap/")).toBeGreaterThan(0));
    await act(() => new Promise((r) => setTimeout(r, 30)));

    await act(async () => fake.release());

    await waitFor(() => expect(imgSrc(container)).toContain("v=222"));
    expect(imgSrc(container)).toContain("/users/usr_2/");
  });
});

describe("#3 useElvixUserMedia", () => {
  function Probe({ userId }: { userId?: string }) {
    const m = useElvixUserMedia(userId);
    return <output>{m.loading ? "loading" : m.hasPhoto ? "photo" : "none"}</output>;
  }

  it("answers for the signed-in user without a userId", async () => {
    installFakeElvix({ context: sampleContext("usr_3"), media: { usr_3: photo(333) } });
    render(
      <Provider>
        <Probe />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("photo"));
  });

  it("answers for any user by id, including one with no photo", async () => {
    installFakeElvix({ context: null });
    render(
      <Provider>
        <Probe userId="usr_nobody" />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("none"));
  });

  it("counts an OAuth photo as a photo", async () => {
    const google = photo(1);
    google.avatar = { sizes: [], updatedAt: null, googleUrl: "https://lh3.test/a.jpg" };
    installFakeElvix({ media: { usr_g: google } });
    render(
      <Provider>
        <Probe userId="usr_g" />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("photo"));
  });
});

describe("#4 an upload reaches everything mounted afterwards", () => {
  it("a remounted editor shows the NEW photo, not the cached old one", async () => {
    installFakeElvix({ context: sampleContext("usr_4"), media: { usr_4: photo(100) } });
    const first = render(
      <Provider>
        <ElvixAvatar size={96} />
      </Provider>,
    );
    await waitFor(() => expect(imgSrc(first.container)).toContain("v=100"));
    first.unmount();

    // Exactly what <ElvixAvatar> publishes after a successful PUT.
    publishMedia("avatar", "usr_4", { sizes: [128, 256], updatedAt: 999, fallbackUrl: null });

    const second = render(
      <Provider>
        <ElvixAvatar size={96} />
      </Provider>,
    );
    await waitFor(() => expect(imgSrc(second.container)).toContain("v=999"));
  });

  it("the public hook sees the upload too", async () => {
    installFakeElvix({
      media: { usr_5: { ...photo(1), avatar: { sizes: [], updatedAt: null, googleUrl: null } } },
    });
    function Probe() {
      const m = useElvixUserMedia("usr_5");
      return <output>{m.loading ? "loading" : m.hasPhoto ? "photo" : "none"}</output>;
    }
    render(
      <Provider>
        <Probe />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("none"));

    act(() => publishMedia("avatar", "usr_5", { sizes: [128], updatedAt: 5, fallbackUrl: null }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("photo"));
  });
});
