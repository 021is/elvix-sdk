/**
 * Debt only goes down (CODING-RULES.md § Debt). Functions are held to 80
 * lines and a cognitive complexity of 15; the files that broke either when
 * the limits tightened (2026-10-28) are listed in `biome.json` `overrides` and
 * keep the old limits (150 and 25), so they cannot get worse either. The
 * lists may only shrink: a file whose debt is paid leaves its list and the
 * number below is lowered in the same change. Never raise one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PINNED = { complexity: 19, functionLength: 23 };

type Override = {
  includes: string[];
  linter: { rules: { complexity: Record<string, unknown> } };
};
const biome = JSON.parse(readFileSync(join(__dirname, "../biome.json"), "utf8")) as {
  overrides: Override[];
};
const listFor = (rule: string) =>
  biome.overrides.find((o) => rule in o.linter.rules.complexity)?.includes ?? [];

describe("debt ratchet", () => {
  it("lists no more complexity debt than recorded", () => {
    expect(listFor("noExcessiveCognitiveComplexity")).toHaveLength(PINNED.complexity);
  });

  it("lists no more function-length debt than recorded", () => {
    expect(listFor("noExcessiveLinesPerFunction")).toHaveLength(PINNED.functionLength);
  });
});
