/**
 * The sign-in card's type and spacing, resolved (0.26): the host's `cardStyle` prop, the
 * provider's, then the Console's, key by key, each value checked where it enters, and turned
 * into the CSS variables `AuthCard` sets on itself. Pure: no React, no DOM.
 *
 * The variables are set on the card's own root, every one of them every time, so nothing a
 * page sets on an ancestor reaches the card: the typed `cardStyle` is the only way in, and
 * every value through it has been clamped or refused here.
 */

import {
  BORDERED_GAP_FOOTER,
  CARD_STYLE_RANGES,
  CARD_STYLE_TOKENS,
  type CardStyleToken,
  clampCardToken,
  type ElvixCardStyle,
  isConsoleFontName,
} from "../types/card-style";

export { CARD_STYLE_RANGES, type ElvixCardStyle } from "../types/card-style";

/** A card style whose every value is safe to write into a CSS variable as it is: numbers in
 *  range, fonts as finished `font-family` values. Keys left out take the default. */
export type CardLook = {
  fontText?: string;
  fontDisplay?: string;
} & { [K in CardStyleToken]?: number };

/** Appended to every family, so a family the page has not loaded falls back to a sans-serif,
 *  never to the browser's default serif. */
const GENERIC = "sans-serif";

/** Anything that is CSS beyond a list of family names: a declaration end, a block, an
 *  escape, an at-rule, a comment, markup, `!important`. */
const NOT_A_FAMILY = /[;{}\\@<>!]|\/\*/;
/** `var(--name)`, the one function a family may name (`var(--font-inter)` from next/font). */
const VAR_REF = /var\(--[A-Za-z0-9_-]+\)/g;

/**
 * A host's font family, from its own code (`cardStyle.fontText` on a prop): family names,
 * quoted or not, commas between them, and `var(--name)` references. Anything else, a URL
 * included, is refused (`undefined`, the page's font stays).
 */
export function hostFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const family = value.trim();
  if (!family || family.length > 200 || NOT_A_FAMILY.test(family)) return undefined;
  // After the var() references, no bracket may remain: `url(`, `image(`, `attr(` are out.
  if (/[()]/.test(family.replace(VAR_REF, ""))) return undefined;
  return `${family}, ${GENERIC}`;
}

/** A Console font name as a `font-family` value, quoted; `undefined` when it is not one. */
export function consoleFontFamily(value: unknown): string | undefined {
  return isConsoleFontName(value) ? `"${value}", ${GENERIC}` : undefined;
}

/** One layer's values, checked: numbers clamped, fonts through `font`. */
function checkLayer(layer: unknown, font: (value: unknown) => string | undefined): CardLook {
  if (typeof layer !== "object" || layer === null) return {};
  const field = (key: string): unknown =>
    Object.hasOwn(layer, key) ? Reflect.get(layer, key) : undefined;
  const look: CardLook = {};
  const fontText = font(field("fontText"));
  const fontDisplay = font(field("fontDisplay"));
  if (fontText) look.fontText = fontText;
  if (fontDisplay) look.fontDisplay = fontDisplay;
  for (const token of CARD_STYLE_TOKENS) {
    const value = clampCardToken(token, field(token));
    if (value !== undefined) look[token] = value;
  }
  return look;
}

/**
 * The card's look: the card's own prop over the provider's over the Console's, per key. The
 * Console's value is untrusted wire data (fonts must be a plain name); the props come from
 * the host's code (fonts may be a family list or a `var()`).
 */
export function mergeCardStyle(layers: {
  card?: ElvixCardStyle;
  provider?: ElvixCardStyle;
  console?: unknown;
}): CardLook {
  return {
    ...checkLayer(layers.console, consoleFontFamily),
    ...checkLayer(layers.provider, hostFontFamily),
    ...checkLayer(layers.card, hostFontFamily),
  };
}

/** The CSS variable each numeric token sets. */
const TOKEN_VARS: Record<CardStyleToken, string> = {
  headingWeight: "--elvix-heading-weight",
  logoHeight: "--elvix-logo-h",
  paddingX: "--elvix-card-px",
  paddingTop: "--elvix-card-pt",
  gapLogoTitle: "--elvix-gap-logo-title",
  gapTitleMethods: "--elvix-gap-title-methods",
  gapMethods: "--elvix-gap-methods",
  gapDivider: "--elvix-gap-divider",
  gapFieldButton: "--elvix-gap-field-button",
  gapButtonSlot: "--elvix-gap-button-slot",
  gapLegal: "--elvix-gap-legal",
  gapFooter: "--elvix-gap-footer",
};

/** `initial` makes a custom property empty: `var()` of it is invalid, so the font is
 *  inherited from the card's parent, and no ancestor's own value leaks in. */
const INHERIT = "initial";

/**
 * Every card variable for `look`, defaults filled in. `bordered`: elvix's own card with its
 * footer bar, whose space under the legal line was 28 px before 0.26 (24 on a transparent one).
 */
export function cardLookVars(look: CardLook, bordered: boolean): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const token of CARD_STYLE_TOKENS) {
    const fallback =
      token === "gapFooter" && bordered ? BORDERED_GAP_FOOTER : CARD_STYLE_RANGES[token].default;
    const value = look[token] ?? fallback;
    vars[TOKEN_VARS[token]] = token === "headingWeight" ? String(value) : `${value}px`;
  }
  vars["--elvix-font-text"] = look.fontText ?? INHERIT;
  vars["--elvix-font-display"] = look.fontDisplay ?? look.fontText ?? INHERIT;
  return vars;
}
