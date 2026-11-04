// @vitest-environment jsdom
/**
 * One field look and borderless rows (0.18). Until then `<ElvixInput>` and
 * `<ElvixDateInput>` painted their own white / near-black fill and a 55%
 * brand outline that no host could change, and the legal-entity rows drew a
 * border at rest; DanceClub's design has no outline anywhere it does not set
 * one. Both now take their colours from `.elvix-field` / `.elvix-row`, whose
 * every value is a CSS variable.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ElvixDateInput } from "../src/react/elvix-date-input";
import { ElvixInput } from "../src/react/elvix-input";

afterEach(cleanup);

// A path, not a URL: under jsdom `import.meta.url` is not a file: URL.
const DIR = join(__dirname, "../src/react");
const read = (file: string) => readFileSync(join(DIR, file), "utf8");

describe("the field look", () => {
  it("ElvixInput is an .elvix-field with no colour of its own", () => {
    render(<ElvixInput aria-label="name" />);
    const input = screen.getByLabelText("name");
    expect(input.className).toContain("elvix-field");
    expect(input.getAttribute("style")).toBeNull();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("a wrong value is aria-invalid, which the class outlines", () => {
    render(<ElvixInput aria-label="vat" hasError />);
    expect(screen.getByLabelText("vat").getAttribute("aria-invalid")).toBe("true");
  });

  it("ElvixDateInput shares the look", () => {
    render(<ElvixDateInput aria-label="dob" value="" onChange={() => {}} hasError />);
    const input = screen.getByLabelText("dob");
    expect(input.className).toContain("elvix-field");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it.each(["elvix-input.tsx", "elvix-date-input.tsx"])("%s hard-codes no fill or outline", (f) => {
    const source = read(f);
    expect(source).not.toMatch(/bg-white|#101013|primary-55|box-shadow/);
  });
});

/**
 * The plain `.elvix-input` class (the device code; elvix's own /device page)
 * kept a border at rest and a 3px focus ring after 0.19 tinted every other
 * field, found on danceclub.team/device (0.21). It takes the field look now.
 */
describe("the plain .elvix-input", () => {
  const styles = join(__dirname, "../src/styles");
  const css = (file: string) => readFileSync(join(styles, file), "utf8");
  const rules = (source: string) =>
    [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
      selectors: m[1].split(",").map((s) => s.trim()),
      body: m[2],
    }));

  it("paints nothing of its own in sdk.css, which loads after fields.css", () => {
    const own = rules(css("sdk.css")).filter((r) =>
      r.selectors.some((s) => s.startsWith(".elvix-input")),
    );
    // Property names only: `box-sizing: border-box` is size, not an outline.
    const paints = /(^|[;\s])(border[\w-]*|background[\w-]*|box-shadow|outline[\w-]*|color)\s*:/;
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((r) => paints.test(r.body))).toEqual([]);
  });

  it("is in every field rule", () => {
    const field = rules(css("fields.css")).filter((r) =>
      r.selectors.some((s) => s.startsWith(".elvix-field")),
    );
    const missing = field.filter(
      (r) => !r.selectors.some((s) => s === r.selectors[0].replace(".elvix-field", ".elvix-input")),
    );
    expect(field.length).toBeGreaterThan(0);
    expect(missing.map((r) => r.selectors[0])).toEqual([]);
  });
});

/**
 * No text field outlines, anywhere (0.22). 0.19 tinted `<ElvixInput>` and its
 * siblings, but the sign-in card's own fields, the code boxes, the country
 * search and the address note kept a border and a brand focus ring (seen on
 * danceclub.dev, 2026-11-04). Every text field is `.elvix-field` now; a
 * button keeps its focus ring, which keyboard users need.
 */
describe("every text field", () => {
  const SKIP = /type="(hidden|file|checkbox|radio)"|sr-only/;
  const OUTLINE = /\bborder(-(?!0\b)[\w[\]/.-]+)?\b|focus:ring|\bring-\d/;
  // The look itself, so a border hidden in a constant cannot pass either.
  const FIELD_LOOK = /elvix-field|elvix-input|FIELD_CLASS/;
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

  it.each(files)("%s gives every input and textarea the field look, no outline", (f) => {
    const fields = [...read(f).matchAll(/<(input|textarea)\b[\s\S]*?\/>/g)].map((m) => m[0]);
    const outlined = fields.filter(
      (el) => !SKIP.test(el) && (OUTLINE.test(el) || !FIELD_LOOK.test(el)),
    );
    expect(outlined.map((el) => el.replace(/\s+/g, " ").slice(0, 120))).toEqual([]);
  });
});

describe("rows", () => {
  const files = readdirSync(DIR).filter((f) => /^(legal-entity-|elvix-legal-entit)/.test(f));

  it.each(files)("%s draws no border on a row or a tile", (f) => {
    const offenders = read(f)
      .split("\n")
      .filter((line) => /className=.*\bborder\b(?!-)/.test(line) && !/border-0|divide/.test(line));
    expect(offenders).toEqual([]);
  });
});
