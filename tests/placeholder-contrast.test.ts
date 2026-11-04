/**
 * A field's placeholder reads at 7:1 on the field, in light and dark (0.22).
 *
 * The sign-in card's field has no visible label, so its placeholder is the
 * only text saying what goes in it. It was #a1a1aa on the field's tint, about
 * 2.3:1 (measured on danceclub.dev, 2026-11-04); WCAG 1.4.3 asks 4.5:1 and
 * Edvard's rule for public text is 7:1. Checked at rest, on hover and on
 * focus (the field's tints, styles/fields.css), for both copies of the
 * palette: sdk.css and the sign-in card's own. Focus tints with the APP's
 * brand, so it is checked with the worst one: black in light, white in dark.
 * The first version used elvix's default brand and passed, while
 * DanceClub's near-black brand gave 6.73:1 (danceclub.dev, same day).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Theme, themeVars } from "../src/react/sign-in-theme";

const CSS = readFileSync(join(__dirname, "../src/styles/sdk.css"), "utf8");
/** The brand that makes the focus tint closest to the placeholder: any app's worst case. */
const BRAND = { light: "#000000", dark: "#ffffff" };
/** The field's tints: fg at rest and on hover, the brand on focus. */
const TINT = { rest: 0.06, hover: 0.09, focus: 0.12 };

type Rgb = [number, number, number];
const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
const rgb = (hex: string): Rgb => [channel(hex, 1), channel(hex, 3), channel(hex, 5)];
const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const blend = (top: number, alpha: number, base: number) => top * alpha + base * (1 - alpha);
const over = (top: Rgb, alpha: number, base: Rgb): Rgb => [
  blend(top[0], alpha, base[0]),
  blend(top[1], alpha, base[1]),
  blend(top[2], alpha, base[2]),
];
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** One token from the `:root` (light) or `.dark` block of sdk.css. */
function cssToken(theme: "light" | "dark", name: string): string {
  const block = theme === "light" ? /:root\s*\{([^}]*)\}/ : /\.dark\s*\{([^}]*)\}/;
  const body = block.exec(CSS)?.[1] ?? "";
  return new RegExp(`--elvix-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(body)?.[1] ?? "";
}

describe.each(["light", "dark"] as const)("the %s placeholder", (theme) => {
  const placeholder = cssToken(theme, "placeholder");
  const surface = rgb(cssToken(theme, "surface"));
  const fg = rgb(cssToken(theme, "fg-1"));

  it("is the same in the sign-in card's own palette", () => {
    const card = Object.entries(themeVars(theme === "light" ? Theme.LIGHT : Theme.DARK) ?? {});
    expect(card.find(([name]) => name === "--elvix-placeholder")?.[1]).toBe(placeholder);
  });

  it.each(Object.entries(TINT))("reads at 7:1 on the field (%s)", (state, alpha) => {
    const tint = state === "focus" ? rgb(BRAND[theme]) : fg;
    expect(contrast(rgb(placeholder), over(tint, alpha, surface))).toBeGreaterThanOrEqual(7);
  });

  it("stays apart from typed text", () => {
    expect(contrast(rgb(placeholder), fg)).toBeGreaterThan(1.8);
  });
});
