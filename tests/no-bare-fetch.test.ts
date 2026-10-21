// @vitest-environment node
/**
 * Every SDK request to elvix goes through `elvixFetch` (0.15): a bare `fetch`
 * sends no DPoP proof and breaks the day an app turns DPoP on. This fails on
 * any `fetch(` call in `src/react` outside `elvix-fetch.ts` itself.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "src", "react");
const BARE_FETCH = /(?<![\w.])fetch\(/;

function codeLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .map((line) => line.replace(/"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""'));
}

describe("SDK requests", () => {
  it("never call fetch directly", () => {
    const offenders = readdirSync(DIR)
      .filter((f) => /\.tsx?$/.test(f) && f !== "elvix-fetch.ts")
      .flatMap((f) =>
        codeLines(readFileSync(join(DIR, f), "utf8"))
          .filter((line) => BARE_FETCH.test(line))
          .map((line) => `${f}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("would catch one (the check itself works)", () => {
    expect(codeLines("const r = await fetch(url);").some((l) => BARE_FETCH.test(l))).toBe(true);
    expect(codeLines("const r = await elvixFetch(url);").some((l) => BARE_FETCH.test(l))).toBe(
      false,
    );
    expect(codeLines(' * same-origin `fetch("/api")`').some((l) => BARE_FETCH.test(l))).toBe(false);
  });
});
