import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The code pane shipped with NO gap between the OTP boxes and the Verify
 * button: `space-y-3` is a margin on the children, and the OTP fieldset's own
 * `m-0` cancelled it. Panes stack with `gap` (`pane-layout.ts`), which lives
 * on the container and cannot be removed by a child. jsdom cannot measure
 * Tailwind, so this pins the source rule; the geometry itself was measured in
 * Chromium (12px between the boxes and the button, every presentation).
 */
const PANES = ["sign-in-steps.tsx", "elvix-recover-gate.tsx", "elvix-sign-in-form.tsx"];

describe("sign-in panes", () => {
  it.each(PANES)("%s stacks with gap, not space-y", (file) => {
    const source = readFileSync(new URL(`../src/react/${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/space-[xy]-/);
  });
});
