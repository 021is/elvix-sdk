/**
 * A browser without color-mix() never paints a tint in its full colour
 * (0.23.1, scripts/styles-fallback.mjs).
 *
 * Tailwind's fallback for a color-mix() of a CSS variable is the bare
 * colour, so such a browser (Safari before 16.2, Chrome before 111) filled
 * every field, row, hover and picked tint at 100%: near-black fields, and
 * full-brand fills under dark text (seen in danceclub.team's served CSS,
 * 2026-11-05). Reads the built dist/styles.css (CI builds first).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FILL_PROPS, transparentFallbacks } from "../scripts/styles-fallback.mjs";

const BUILT = join(__dirname, "../dist/styles.css");
const PAIR =
  /([^{}]+)\{([^{}]*)\}@supports \(color:color-mix\(in lab, ?red, ?red\)\)\{([^{}]+)\{([^{}]*)\}\}/g;

/** A value that ends in a CSS variable, not in `transparent`. */
const paintsBareColour = (value: string) =>
  /var\(--[\w-]+\)\)*$/.test(value) && !value.includes("transparent");

/** Every fallback declaration that paints a bare colour where its twin mixes. */
function bareFallbacks(css: string): string[] {
  const bare: string[] = [];
  for (const [, sel, body, , twin] of css.matchAll(PAIR)) {
    const mixed = new Set(
      (twin ?? "")
        .split(";")
        .filter((d) => d.includes("color-mix("))
        .map((d) => d.split(":")[0] ?? "")
        .filter((prop) => FILL_PROPS.test(prop)),
    );
    for (const d of (body ?? "").split(";")) {
      const [prop = "", value = ""] = d.split(/:(.*)/);
      if (mixed.has(prop) && paintsBareColour(value)) bare.push(`${sel?.trim()} { ${d} }`);
    }
  }
  return bare;
}

describe("the tints without color-mix()", () => {
  it("in the built stylesheet, no fallback paints a bare colour", () => {
    if (!existsSync(BUILT))
      throw new Error("dist/styles.css is missing: run `bun run build` first");
    const css = readFileSync(BUILT, "utf8");
    expect(bareFallbacks(css)).toEqual([]);
    // The tints are still there for every browser that has color-mix().
    expect(css.match(/color-mix\(/g)?.length ?? 0).toBeGreaterThan(80);
  });

  it("keeps a host's own variable in front, and clears only the mixed properties", () => {
    const css =
      ".f{background-color:var(--elvix-field,var(--elvix-fg-1));color:var(--elvix-fg-1)}" +
      "@supports (color:color-mix(in lab, red, red)){.f{background-color:var(--elvix-field,color-mix(in srgb, var(--elvix-fg-1) 6%, transparent))}}" +
      ".b{border-color:var(--elvix-fg-3)}" +
      "@supports (color:color-mix(in lab, red, red)){.b{border-color:color-mix(in oklab, var(--elvix-fg-3) 15%, transparent)}}" +
      ".h{background-color:#f99c0014}" +
      "@supports (color:color-mix(in lab, red, red)){.h{background-color:color-mix(in oklab, var(--color-amber-500) 8%, transparent)}}" +
      ".r{--tw-ring-color:var(--elvix-primary)}" +
      "@supports (color:color-mix(in lab, red, red)){.r{--tw-ring-color:color-mix(in srgb, var(--elvix-primary) 40%, transparent)}}";
    const { css: out, changed } = transparentFallbacks(css);
    expect(out).toContain(
      ".f{background-color:var(--elvix-field,transparent);color:var(--elvix-fg-1)}",
    );
    expect(out).toContain(".b{border-color:transparent}");
    expect(out).toContain(".h{background-color:#f99c0014}");
    // A focus ring keeps its full colour: a keyboard user still sees it.
    expect(out).toContain(".r{--tw-ring-color:var(--elvix-primary)}");
    expect(changed).toBe(2);
    expect(bareFallbacks(out)).toEqual([]);
  });
});
