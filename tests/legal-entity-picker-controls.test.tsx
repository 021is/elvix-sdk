// @vitest-environment jsdom
/**
 * `useElvixLegalEntityPickerControls()` (0.23): the host's bar drives the
 * picker's add flow, so the screen shows one Back and one Continue, both the
 * host's (DanceClub's Bookings ask, 2026-11-02: inside "Add a company",
 * elvix's own Back and Continue showed beside DanceClub's, two of each).
 *
 * The host's button here is named "Host: …", so any button named plainly
 * "Continue" or "Back" would be the picker's own.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixLegalEntityPicker,
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

function Host({ onLeave }: { onLeave: () => void }) {
  const controls = useElvixLegalEntityPickerControls();
  return (
    <>
      <ElvixLegalEntityPicker types={["company"]} controls={controls} onPick={() => {}} />
      <output data-testid="state">
        {JSON.stringify({
          adding: controls.adding,
          step: controls.step?.id ?? null,
          title: controls.step?.title ?? null,
          canContinue: controls.canContinue,
          label: controls.label,
        })}
      </output>
      <button type="button" onClick={() => controls.back() || onLeave()}>
        Host: Back
      </button>
      <button type="button" disabled={!controls.canContinue} onClick={controls.next}>
        Host: {controls.label ?? "Continue"}
      </button>
    </>
  );
}

function mount() {
  const onLeave = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <Host onLeave={onLeave} />
    </ElvixProvider>,
  );
  const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}");
  return { onLeave, state };
}

const ownButton = (name: string) => screen.queryByRole("button", { name });

describe("the picker driven by the host's controls", () => {
  it("on the list it is not adding, and Back leaves the host's pane", async () => {
    installFakeElvix({ entities: [] });
    const { onLeave, state } = mount();
    await screen.findByText("Add a company");
    expect(state()).toMatchObject({ adding: false, step: null, canContinue: false, label: null });
    fireEvent.click(screen.getByText("Host: Back"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("adding draws no Back or Continue of its own; the host's bar carries the step", async () => {
    installFakeElvix({ entities: [] }, [validate]);
    const { state } = mount();
    fireEvent.click(await screen.findByText("Add a company"));
    await screen.findByPlaceholderText("DE129273398");

    expect(ownButton("Continue")).toBeNull();
    expect(ownButton("Back")).toBeNull();
    await waitFor(() =>
      expect(state()).toMatchObject({ adding: true, step: "vat-id", label: "Continue" }),
    );
    expect(state().canContinue).toBe(false);
    // The step's question stays in the pane and reaches the host's bar too.
    expect(state().title).toBeTruthy();
    expect(screen.getByRole("heading", { name: state().title })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("DE129273398"), {
      target: { value: "IE6388047V" },
    });
    await waitFor(() => expect(state().canContinue).toBe(true));
    await act(async () => fireEvent.click(screen.getByText("Host: Continue")));

    // The register's check passes on its own; the name step comes prefilled.
    expect(
      await screen.findByDisplayValue("GOOGLE IRELAND LIMITED", {}, { timeout: 4000 }),
    ).toBeTruthy();
    expect(ownButton("Continue")).toBeNull();
    expect(state().adding).toBe(true);
  });

  it("the host's Back steps back inside the add flow, then back to the list", async () => {
    installFakeElvix({ entities: [] });
    const { onLeave, state } = mount();
    fireEvent.click(await screen.findByText("Add a company"));
    await screen.findByPlaceholderText("DE129273398");

    fireEvent.click(screen.getByText("Host: Back"));
    await screen.findByText("Add a company");
    await waitFor(() => expect(state()).toMatchObject({ adding: false, label: null }));
    expect(onLeave).not.toHaveBeenCalled();
  });

  // 0.23 review: two pickers on one controls object overwrote each other's
  // handlers; and the controls kept `adding` after their picker was gone.
  it("one controls object drives one picker, and forgets it when it unmounts", async () => {
    installFakeElvix({ entities: [] });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    function Two({ show }: { show: boolean }) {
      const controls = useElvixLegalEntityPickerControls();
      return (
        <>
          {show && (
            <ElvixLegalEntityPicker types={["company"]} controls={controls} onPick={() => {}} />
          )}
          <ElvixLegalEntityPicker types={["company"]} controls={controls} onPick={() => {}} />
          <output data-testid="adding">{String(controls.adding)}</output>
        </>
      );
    }
    const tree = (show: boolean) => (
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <Two show={show} />
      </ElvixProvider>
    );
    const view = render(tree(true));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/^elvix_picker_controls_shared/)),
    );
    fireEvent.click((await screen.findAllByText("Add a company"))[0]);
    await waitFor(() => expect(screen.getByTestId("adding").textContent).toBe("true"));
    view.rerender(tree(false));
    await waitFor(() => expect(screen.getByTestId("adding").textContent).toBe("false"));
    error.mockRestore();
  });

  it("the host's Continue does nothing while the step cannot continue", async () => {
    installFakeElvix({ entities: [] });
    const { state } = mount();
    fireEvent.click(await screen.findByText("Add a company"));
    await screen.findByPlaceholderText("DE129273398");
    await waitFor(() => expect(state().step).toBe("vat-id"));
    act(() => screen.getByText("Host: Continue").click());
    expect(state().step).toBe("vat-id");
  });
});
