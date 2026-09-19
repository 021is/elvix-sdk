// @vitest-environment jsdom
/**
 * Host callbacks must not drive the SDK's requests.
 *
 * Hosts pass inline arrows (`onChange={(l) => setLangs(l)}`), so a callback's
 * identity changes on every host render. Components that put such a callback
 * in a fetch effect's dependencies re-fetched on every render, and a callback
 * that sets host state turned that into an endless request loop.
 */
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixLanguages, ElvixProvider, ElvixRegion } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("host callbacks", () => {
  it("ElvixLanguages loads once even when onChange re-renders the host", async () => {
    const fake = installFakeElvix();
    function Host() {
      const [, setRenders] = useState(0);
      return (
        <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
          <ElvixLanguages card={false} onChange={() => setRenders((n) => n + 1)} />
        </ElvixProvider>
      );
    }
    render(<Host />);
    await act(() => new Promise((r) => setTimeout(r, 200)));

    expect(fake.calls("/api/account/profile/languages")).toBe(1);
  });

  it("ElvixRegion loads once even when onChange re-renders the host", async () => {
    const fake = installFakeElvix();
    function Host() {
      const [, setRenders] = useState(0);
      return (
        <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
          <ElvixRegion card={false} onChange={() => setRenders((n) => n + 1)} />
        </ElvixProvider>
      );
    }
    render(<Host />);
    await act(() => new Promise((r) => setTimeout(r, 200)));

    expect(fake.calls("/api/account/profile/region")).toBe(1);
  });
});
