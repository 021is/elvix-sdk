/**
 * The card style's classes are in the stylesheet a host imports (0.26). Tailwind emits only
 * the utilities it finds in the source, so a class the card names but the sheet lacks would
 * leave that gap at zero, silently. Pinned against the built `dist/styles.css` (CI builds
 * before it tests; run `bun run build` first locally).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const SHEET = join(resolve(__dirname, ".."), "dist/styles.css");

/** Each variable the card sets, and the declaration that reads it. */
const DECLARATIONS = [
  "font-weight:var(--elvix-heading-weight)",
  "font-family:var(--elvix-font-display)",
  "font-family:var(--elvix-font-text)",
  "height:var(--elvix-logo-h)",
  "min-height:var(--elvix-logo-h)",
  "padding-inline:var(--elvix-card-px)",
  "padding-top:var(--elvix-card-pt)",
  "padding-bottom:var(--elvix-gap-footer)",
  "margin-inline:calc(var(--elvix-card-px) * -1)",
  "margin-top:calc(var(--elvix-card-pt) * -1)",
  "gap:var(--elvix-gap-logo-title)",
  "margin-bottom:var(--elvix-gap-title-methods)",
  "gap:var(--elvix-gap-methods)",
  "margin-block:var(--elvix-gap-divider)",
  "margin-top:var(--elvix-gap-field-button)",
  "margin-top:var(--elvix-gap-button-slot)",
  "margin-top:var(--elvix-gap-legal)",
];

describe("the card style in the built stylesheet", () => {
  let css = "";
  beforeAll(() => {
    if (!existsSync(SHEET))
      throw new Error("dist/styles.css is missing: run `bun run build` first");
    css = readFileSync(SHEET, "utf8");
  });

  it.each(DECLARATIONS)("has %s", (declaration) => {
    expect(css).toContain(declaration);
  });

  it("hides the Google prompt's empty slot", () => {
    expect(css).toMatch(/\.empty\\:hidden:empty\{display:none\}/);
  });
});
