// @vitest-environment jsdom
/**
 * #1 (0.13): one Save-row spacing for every SDK editor.
 *
 * On 0.12 `<ElvixIdentityForm>` put Save in a `pt-1` wrapper inside its
 * `space-y-5` form, so the button sat against the pronoun chips, while the
 * other editors each spelled their own `pt-3` row. Every editor now renders
 * `<ElvixSaveRow>`, whose gap is `SAVE_ROW_GAP`, defined once.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixIdentityForm, ElvixProvider } from "../src/react/index";
import { SAVE_ROW_GAP } from "../src/react/elvix-save-button";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

function Provider({ children }: { children: ReactNode }) {
  return (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {children}
    </ElvixProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Save row", () => {
  it("gives the identity form's Save the shared gap", async () => {
    installFakeElvix({ identity: { givenName: "Ada" } });
    render(
      <Provider>
        <ElvixIdentityForm card={false} />
      </Provider>,
    );
    const save = await waitFor(() => screen.getByRole("button", { name: /save/i }));
    const row = save.closest("[data-elvix-save-row]");
    expect(row).not.toBeNull();
    expect(row?.className.split(" ")).toContain(SAVE_ROW_GAP);
  });

  // An editor's action row is the `mt-auto` row pinned to the pane bottom.
  it("is the only place an editor's Save row spacing is written", () => {
    const dir = join(__dirname, "../src/react");
    const actionRow = /mt-auto flex items-center[^"]*\bpt-\d/;
    const local = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && f !== "elvix-save-button.tsx")
      .filter((f) => actionRow.test(readFileSync(join(dir, f), "utf8")));
    expect(local).toEqual([]);
  });
});
