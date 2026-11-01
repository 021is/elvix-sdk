// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ElvixSaveButton } from "../src/react/elvix-save-button";

/**
 * The "Enter" chip on a button is for a keyboard (Edvard, 2026-11-01: "for
 * mobile we don't have enter"). It carries `elvix-kbd-hint`, which hints.css
 * hides on a touch-only device and `--elvix-key-hints` forces either way.
 */
// jsdom's import.meta.url is not a file URL; vitest runs from the repo root.
const css = readFileSync(join(process.cwd(), "src/styles/hints.css"), "utf8");
const sdk = readFileSync(join(process.cwd(), "src/styles/sdk.css"), "utf8");

describe("key hints", () => {
  it("the button's hint is an elvix-kbd-hint, not a fixed inline-flex", () => {
    const { container } = render(
      <ElvixSaveButton state="idle" label="Continue" savedLabel="Continue" hint="Enter" />,
    );
    const kbd = container.querySelector("kbd");
    expect(kbd?.classList.contains("elvix-kbd-hint")).toBe(true);
    expect(kbd?.classList.contains("inline-flex")).toBe(false);
  });

  it("is hidden on touch-only devices unless --elvix-key-hints says otherwise", () => {
    expect(css).toContain("display: var(--elvix-key-hints, inline-flex)");
    const touch = css.slice(css.indexOf("@media (hover: none) and (pointer: coarse)"));
    expect(touch).toContain("display: var(--elvix-key-hints, none)");
    expect(sdk).toContain('@import "./hints.css"');
  });
});
