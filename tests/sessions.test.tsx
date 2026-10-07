// @vitest-environment jsdom
/** `<ElvixSessions>`: list, end one session, end all the others. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSessions } from "../src/react/index";
import { getElvixToken, setElvixToken } from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (id: string, isCurrent: boolean) => ({
  id,
  isCurrent,
  method: "otp",
  ipCountry: "DE",
  userAgent: "Mozilla/5.0",
  device: { browser: "Firefox", os: "Linux", kind: "desktop" },
  createdAt: new Date(0).toISOString(),
  expiresAt: new Date(0).toISOString(),
});

function mount(onResult = vi.fn()) {
  const fake = installFakeElvix({
    sessions: [row("s1", true), row("s2", false), row("s3", false)],
  });
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixSessions onResult={onResult} />
    </ElvixProvider>,
  );
  return { fake, onResult };
}

const revokeButtons = () => screen.queryAllByTitle("Sign out");

describe("ElvixSessions", () => {
  it("ends one session and drops it from the list", async () => {
    const { onResult } = mount();
    await waitFor(() => expect(revokeButtons()).toHaveLength(2));

    await act(async () => fireEvent.click(revokeButtons()[0] as HTMLElement));

    await waitFor(() => expect(revokeButtons()).toHaveLength(1));
    expect(onResult).toHaveBeenCalledWith({ ok: true, action: "revoke_one", ended: 1 });
  });

  it("ends every other session and shows the done pane", async () => {
    const { onResult, fake } = mount();
    await waitFor(() => expect(revokeButtons()).toHaveLength(2));

    fireEvent.click(screen.getByText("Sign out of devices..."));
    const others = await screen.findByText(/Sign out of the other/, {}, { timeout: 3000 });
    await act(async () => fireEvent.click(others));

    await screen.findByText("2 devices signed out.", {}, { timeout: 3000 });
    expect(onResult).toHaveBeenCalledWith({ ok: true, action: "sign_out_others", ended: 2 });
    expect(fake.state.sessions.map((s) => s.id)).toEqual(["s1"]);
  });

  // #6 (0.13): "Sign out everywhere" ends this device the way signOut() does,
  // before onResult, and `signInUrl={null}` leaves navigation to the host.
  it("tears down this device before onResult and lets the host navigate", async () => {
    installFakeElvix({ sessions: [row("s1", true), row("s2", false)] });
    setElvixToken("tok");
    document.cookie = "elvix_token=tok; path=/";
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    const seen: { token: string | null; cookie: string }[] = [];
    const onResult = vi.fn(() => seen.push({ token: getElvixToken(), cookie: document.cookie }));
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixSessions onResult={onResult} signInUrl={null} />
      </ElvixProvider>,
    );
    await waitFor(() => expect(revokeButtons()).toHaveLength(1));

    fireEvent.click(screen.getByText("Sign out of devices..."));
    const all = await screen.findByText(/Sign out everywhere/, {}, { timeout: 3000 });
    await act(async () => fireEvent.click(all));

    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult).toHaveBeenCalledWith({ ok: true, action: "sign_out_all", ended: 1 });
    expect(seen[0]?.token).toBeNull();
    expect(seen[0]?.cookie).not.toContain("elvix_token=tok");
    expect(replace).not.toHaveBeenCalled();
  });
});
