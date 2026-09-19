// @vitest-environment jsdom
/** `<ElvixRegion>`: first country, a country change with its cascade, one field edit. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixRegion } from "../src/react/index";
import { defaultsFor } from "../src/react/regions";
import { BASE, CLIENT_ID, installFakeElvix, regionFor } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(region: Record<string, unknown> | null) {
  const fake = installFakeElvix({ region });
  const onResult = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixRegion onResult={onResult} />
    </ElvixProvider>,
  );
  return { fake, onResult };
}

const pickCountry = async (name: string) =>
  act(async () => fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) })));

describe("ElvixRegion", () => {
  it("sets the first country with its defaults", async () => {
    const { fake, onResult } = mount(null);
    fireEvent.click(await screen.findByText("Pick your region"));
    await pickCountry("France");

    await waitFor(() => expect(fake.state.region?.country).toBe("FR"));
    expect(onResult).toHaveBeenCalledWith({
      ok: true,
      country: "FR",
      locale: defaultsFor("FR").uiLocale,
    });
  });

  // The result used to carry the locale from before the save, so a host
  // switching its UI language on `onResult` stayed on the old country's.
  it("reports the cascaded locale after a country change", async () => {
    const { onResult } = mount(regionFor("DE"));
    fireEvent.click(await screen.findByLabelText("Change country"));
    await pickCountry("France");
    const reset = (await screen.findByText("Reset defaults")).closest("button") as HTMLElement;
    await act(async () => fireEvent.click(reset));

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        ok: true,
        country: "FR",
        locale: defaultsFor("FR").uiLocale,
      }),
    );
  });
});
