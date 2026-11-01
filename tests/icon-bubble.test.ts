import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The round tint behind a type or brand icon is a host's to colour (Edvard,
 * 2026-11-01): `--elvix-icon` and `--elvix-icon-bg`, through one class in
 * rows.css. The legal-entity and picker panes used to paint each bubble with
 * a literal brand mix, so a host could not change them.
 */
const css = readFileSync(new URL("../src/styles/rows.css", import.meta.url), "utf8");
const DIR = new URL("../src/react/", import.meta.url);
const panes = readdirSync(DIR).filter((f) =>
  /^(legal-entity-.*|elvix-legal-entit.*)\.tsx$/.test(f),
);

describe("icon bubbles", () => {
  it("are one class, coloured by --elvix-icon and --elvix-icon-bg", () => {
    const rule = css.slice(css.indexOf(".elvix-icon-bubble"));
    expect(rule).toContain("var(\n    --elvix-icon-bg");
    expect(rule).toContain("var(--elvix-icon,");
  });

  it.each(panes)("%s draws no bubble with a literal brand mix", (file) => {
    const source = readFileSync(new URL(file, DIR), "utf8");
    const literal =
      /rounded-full bg-\[color-mix\(in_srgb,var\(--elvix-primary\)[^\]]*\] text-\[var\(--elvix-primary\)\]/;
    expect(source).not.toMatch(literal);
  });
});
