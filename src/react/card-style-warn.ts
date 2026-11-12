/**
 * A host's `cardStyle` value that `card-look.ts` refuses or clamps, said to the developer
 * (0.26, the tower's call, 2026-11-12): in development only, once per token, naming the
 * token, the value and what is allowed. Never a word in production, and never a broken
 * sign-in: the layer under it (or the default) stays either way.
 *
 * Development is `process.env.NODE_ENV !== "production"` where the host's bundler defines
 * it (Next, Vite, webpack do); a page with no `process` at all is treated as production.
 */

import { CARD_STYLE_RANGES, type CardStyleToken } from "../types/card-style";

const said = new Set<string>();

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
}

const shown = (value: unknown) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

/** What a numeric token accepts, as a person reads it: `12–48 px`, `400–800 in steps of 100`. */
export function allowedRange(token: CardStyleToken): string {
  const range: { min: number; max: number; step?: number } = CARD_STYLE_RANGES[token];
  const { min, max, step } = range;
  const unit = token === "headingWeight" ? "" : " px";
  return `${min}–${max}${unit}${step && step !== 1 ? ` in steps of ${step}` : ""}`;
}

export const HOST_FONT_RULE = "a list of font names, closed quotes or var(--name)";

/** Says once, in development, that `cardStyle[key]` = `value` was not taken as given. */
function warnCardStyle(key: string, value: unknown, allowed: string, outcome: string) {
  if (!isDevelopment() || said.has(key)) return;
  said.add(key);
  console.warn(
    `[elvix] cardStyle.${key}: ${shown(value)} is not allowed (allowed: ${allowed}); ${outcome}.`,
  );
}

/** A host font `font()` refused (`raw` given, no family came of it). */
export function warnRefusedFont(key: "fontText" | "fontDisplay", raw: unknown) {
  if (raw !== undefined) warnCardStyle(key, raw, HOST_FONT_RULE, "the page's font stays");
}

/** A host number the card did not take as given: refused (`value` undefined) or clamped. */
export function warnChangedToken(token: CardStyleToken, raw: unknown, value: number | undefined) {
  if (raw === undefined || value === raw) return;
  const outcome = value === undefined ? "the card ignores it" : `the card uses ${value}`;
  warnCardStyle(token, raw, allowedRange(token), outcome);
}
