// @vitest-environment jsdom
/** `<ElvixAppPasskeys>`: the app's passkeys, and removing one. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixAppPasskeys, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const passkey = (id: string, nickname: string) => ({
  id,
  nickname,
  deviceType: "multiDevice",
  backedUp: true,
  transports: ["internal"],
  aaguid: null,
  createdUserAgent: null,
  lastUsedAt: null,
  createdAt: new Date(0).toISOString(),
});

describe("ElvixAppPasskeys", () => {
  // Mounted on elvix.is itself, the way /account/apps/<id>/passkeys does.
  it("lists the app's passkeys and removes one", async () => {
    const fake = installFakeElvix({
      passkeys: [passkey("pk1", "Laptop"), passkey("pk2", "Phone")],
    });
    const onResult = vi.fn();
    render(
      <ElvixProvider
        clientId={CLIENT_ID}
        baseUrl={window.location.origin}
        presence={false}
        bootstrapRefreshMs={0}
      >
        <ElvixAppPasskeys appId="app_1" appName="Acme" onResult={onResult} />
      </ElvixProvider>,
    );

    const remove = await screen.findByLabelText("Remove Phone");
    await act(async () => fireEvent.click(remove));

    await waitFor(() => expect(screen.queryByLabelText("Remove Phone")).toBeNull());
    expect(screen.getByLabelText("Remove Laptop")).toBeTruthy();
    expect(fake.state.passkeys.map((p) => p.id)).toEqual(["pk1"]);
    expect(onResult).toHaveBeenCalledWith({ ok: true, kind: "removed", passkeyId: "pk2" });
  });

  // #7 (0.13): on 0.12 a customer origin fetched with no elvix session and
  // told a signed-in user "Sign in first". It now links to the account page.
  it("links to the elvix account page on a customer origin", async () => {
    const fake = installFakeElvix({ passkeys: [passkey("pk1", "Laptop")] });
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixAppPasskeys appId="app_1" appName="Acme" />
      </ElvixProvider>,
    );

    const link = await screen.findByText("Open your elvix account");
    expect(link.getAttribute("href")).toBe(`${BASE}/account/apps/app_1/passkeys`);
    expect(screen.getByText(/Passkeys for Acme are added and removed/)).toBeTruthy();
    expect(screen.queryByText(/Sign in first/)).toBeNull();
    expect(fake.calls("/passkeys")).toBe(0);
  });
});
