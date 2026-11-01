// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ElvixSaveButton } from "../src/react/elvix-save-button";

/**
 * The "Enter" chip on a button is off by default everywhere (Edvard,
 * 2026-11-01): it carries `elvix-kbd-hint`, which hints.css hides, and a host
 * turns it on with `--elvix-key-hints: inline-flex`.
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

  it("is hidden on every device unless --elvix-key-hints turns it on", () => {
    expect(css).toContain("display: var(--elvix-key-hints, none)");
    expect(css).not.toContain("var(--elvix-key-hints, inline-flex)");
    expect(css).not.toContain("@media");
    expect(sdk).toContain('@import "./hints.css"');
  });
});
