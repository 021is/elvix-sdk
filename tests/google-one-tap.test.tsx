// @vitest-environment jsdom
/**
 * Google Identity Services wiring: initialised once per page in popup mode,
 * not re-prompted when a parent re-renders with an equal config, and its
 * credential callback always runs with the latest props.
 */
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleOneTap } from "../src/react/google-one-tap";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.google = undefined;
});

function stubGis() {
  const id = {
    initialize: vi.fn(),
    prompt: vi.fn(),
    renderButton: vi.fn(),
    cancel: vi.fn(),
    disableAutoSelect: vi.fn(),
  };
  window.google = { accounts: { id } };
  return id;
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe("GoogleOneTap", () => {
  it("initialises once in popup mode and does not re-prompt on an equal re-render", async () => {
    const gis = stubGis();
    const slot = createRef<HTMLDivElement>();
    const ui = (intent: "app" | "account") => (
      <>
        <div ref={slot} />
        <GoogleOneTap
          baseUrl={window.location.origin}
          clientId="g-client"
          intent={intent}
          appClientId="client_1"
          config={{ oneTap: true, autoSelect: false, popup: true, fedcm: true, hostedDomain: "" }}
          renderButton
          buttonContainerRef={slot}
        />
      </>
    );
    const { rerender } = render(ui("app"));
    await flush();
    expect(gis.initialize).toHaveBeenCalledTimes(1);
    expect(gis.initialize.mock.calls[0]?.[0]).toMatchObject({
      client_id: "g-client",
      ux_mode: "popup",
      use_fedcm_for_prompt: true,
    });
    expect(gis.prompt).toHaveBeenCalledTimes(1);

    rerender(ui("app"));
    await flush();
    expect(gis.initialize).toHaveBeenCalledTimes(1);
    expect(gis.prompt).toHaveBeenCalledTimes(1);
  });

  it("the credential callback uses the latest props", async () => {
    const gis = stubGis();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ui = (appClientId: string) => (
      <GoogleOneTap
        baseUrl={window.location.origin}
        clientId="g-client"
        intent="app"
        appClientId={appClientId}
        config={{ oneTap: true, autoSelect: false, popup: true, fedcm: false, hostedDomain: "" }}
      />
    );
    const { rerender } = render(ui("client_old"));
    await flush();
    rerender(ui("client_new"));
    await flush();

    const callback = gis.initialize.mock.calls[0]?.[0].callback;
    await act(async () => callback({ credential: "jwt" }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.clientId).toBe("client_new");
  });
});
