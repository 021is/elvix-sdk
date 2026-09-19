// @vitest-environment jsdom
/** `<ElvixDeactivate>` and `<ElvixLeave>`: the emailed-code flow and the undo. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixDeactivate, ElvixLeave, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, VALID_CODE } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(node: ReactNode) {
  const fake = installFakeElvix();
  const view = render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {node}
    </ElvixProvider>,
  );
  return { fake, view };
}

// Panes swap with an exit animation first (AnimatePresence mode="wait").
const PANE = { timeout: 3000 };

async function click(text: string | RegExp) {
  // Find outside act(): inside it, the DOM does not update while polling.
  const el = await screen.findByText(text, {}, PANE);
  await act(async () => fireEvent.click(el.closest("button") ?? el));
}

async function enterCode(container: HTMLElement, code: string) {
  await screen.findByText(/a\*\*\*@example\.test/, {}, PANE);
  const first = container.querySelector("input") as HTMLInputElement;
  fireEvent.change(first, { target: { value: code } });
}

describe("ElvixDeactivate", () => {
  // The failure result used to carry the error from BEFORE this attempt
  // (state read in the same handler that set it), so a host logging
  // `message` saw "Couldn't save" for a wrong code.
  it("reports the wrong-code message it shows, then deactivates", async () => {
    const onResult = vi.fn();
    const { view } = mount(<ElvixDeactivate appId="app_1" onResult={onResult} />);
    await click("I understand");
    await click("I understand. Email me a code");

    await enterCode(view.container, "000000");
    await click("Deactivate");
    const shown = await screen.findByText(/Wrong code\. 2 tries left\./);
    expect(onResult).toHaveBeenLastCalledWith({
      ok: false,
      error: "wrong_code",
      message: shown.textContent,
    });

    await enterCode(view.container, VALID_CODE);
    await click("Deactivate");
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith({ ok: true, state: "inactive" }));
  });
});

describe("ElvixLeave", () => {
  it("restores a membership the user left", async () => {
    const onResult = vi.fn();
    mount(
      <ElvixLeave
        appId="app_1"
        deletedAt={new Date().toISOString()}
        deletedBy="user"
        onResult={onResult}
      />,
    );
    await click("Restore membership");

    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: true, state: "restored" }));
  });
});
