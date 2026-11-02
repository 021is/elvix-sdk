// @vitest-environment jsdom
/**
 * `useElvixLegalEntityPickerControls()` (0.19): with `controls`, the host's
 * own Back and Continue drive "Add a company" and the picker draws none of
 * its own, so the screen holds one of each (DanceClub, 2026-11-02). Without
 * `controls`, nothing changes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixLegalEntityPicker,
  type ElvixLegalEntityPickerControls,
  ElvixProvider,
  useElvixLegalEntityPickerControls,
} from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, json, type Route } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const validate: Route = [
  "GET",
  (u) => u.includes("/public/api/tax/validate"),
  () =>
    json({
      ok: true,
      result: {
        level: "live",
        name: "GOOGLE IRELAND LIMITED",
        authority: "VIES",
        normalisedId: "IE6388047V",
        address: "3RD FLOOR, GORDON HOUSE\nDUBLIN 4",
      },
    }),
];

let controls: ElvixLegalEntityPickerControls;

function Host({ hosted = true }: { hosted?: boolean }) {
  controls = useElvixLegalEntityPickerControls();
  return (
    <ElvixLegalEntityPicker
      controls={hosted ? controls : undefined}
      card={false}
      types={["company"]}
      onPick={vi.fn()}
    />
  );
}

function mount(hosted?: boolean) {
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <Host hosted={hosted} />
    </ElvixProvider>,
  );
}

async function openAdd() {
  fireEvent.click(await screen.findByText("Add a company"));
  return screen.findByPlaceholderText("DE129273398");
}

describe("the host drives the picker", () => {
  it("draws no Back or Continue of its own, and says what the host's should show", async () => {
    installFakeElvix({ entities: [] }, [validate]);
    mount();
    expect(controls).toMatchObject({ adding: false, step: null });

    const vat = await openAdd();
    expect(screen.queryByText("Back")).toBeNull();
    expect(screen.queryByText("Continue")).toBeNull();
    await waitFor(() => expect(controls).toMatchObject({ adding: true, canContinue: false }));
    expect(controls.step?.id).toBeTruthy();

    fireEvent.change(vat, { target: { value: "IE6388047V" } });
    await waitFor(() => expect(controls.canContinue).toBe(true));
  });

  it("next() is the step's own Continue", async () => {
    installFakeElvix({ entities: [] }, [validate]);
    mount();
    fireEvent.change(await openAdd(), { target: { value: "IE6388047V" } });
    await waitFor(() => expect(controls.canContinue).toBe(true));
    await act(async () => controls.next());
    expect(
      await screen.findByDisplayValue("GOOGLE IRELAND LIMITED", {}, { timeout: 4000 }),
    ).toBeTruthy();
  });

  it("back() steps back while adding, and is false on the list", async () => {
    installFakeElvix({ entities: [] }, [validate]);
    mount();
    await screen.findByText("Add a company");
    expect(controls.back()).toBe(false);

    await openAdd();
    await waitFor(() => expect(controls.adding).toBe(true));
    let handled = false;
    act(() => {
      handled = controls.back();
    });
    expect(handled).toBe(true);
    await waitFor(() => expect(controls.adding).toBe(false));
    expect(await screen.findByText("Add a company")).toBeTruthy();
  });

  it("next() does nothing while the step is incomplete", async () => {
    installFakeElvix({ entities: [] }, [validate]);
    mount();
    await openAdd();
    await waitFor(() => expect(controls.adding).toBe(true));
    act(() => controls.next());
    expect(screen.getByPlaceholderText("DE129273398")).toBeTruthy();
  });
});

describe("without controls", () => {
  it("the picker keeps its own Back and Continue", async () => {
    installFakeElvix({ entities: [] }, [validate]);
    mount(false);
    await openAdd();
    expect(screen.getByText("Back")).toBeTruthy();
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(controls.adding).toBe(false);
  });
});
