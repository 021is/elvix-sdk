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

  // 0.20: <ElvixDeviceApproval>'s code field kept the old outlined `.elvix-input` (a 1px border
  // and a 3px focus ring), found on danceclub.team/device 2026-11-04. No component may use it.
  it("no component uses the outlined .elvix-input class; the device code field is a field", () => {
    const offenders = readdirSync(DIR).filter((f) => /className="elvix-input"/.test(read(f)));
    expect(offenders).toEqual([]);
    expect(read("elvix-device-approval.tsx")).toContain("<ElvixInput");
  });

  it.each(["elvix-input.tsx", "elvix-date-input.tsx"])("%s hard-codes no fill or outline", (f) => {
    const source = read(f);
    expect(source).not.toMatch(/bg-white|#101013|primary-55|box-shadow/);
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
