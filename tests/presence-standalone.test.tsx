// @vitest-environment jsdom
/**
 * elvix's own Console and Account are not customer apps: no `clientId`, no
 * `<ElvixProvider>`. They dogfood the SDK by passing `applicationId` and
 * `baseUrl=""` to `<ElvixPresence>`. Before 0.14 it threw outside a provider,
 * so both kept a private copy of the heartbeat.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixPresence, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<ElvixPresence> without a provider", () => {
  it("beats same-origin for the application it is given", () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ElvixPresence applicationId="app_console" baseUrl="" />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/presence/heartbeat");
    expect(JSON.parse(String(init.body))).toMatchObject({
      applicationId: "app_console",
      status: "online",
    });
    expect(init.credentials).toBe("include");
  });

  it("is inert with no application to beat for", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ElvixPresence baseUrl="" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("inside a provider it still follows the provider's origin", () => {
    const fake = installFakeElvix();
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixPresence applicationId="app_x" />
      </ElvixProvider>,
    );
    expect(fake.calls(`${BASE}/api/presence/heartbeat`)).toBe(1);
  });
});
