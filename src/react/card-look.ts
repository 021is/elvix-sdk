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

type LookValues = {
  fontText?: string;
  fontDisplay?: string;
} & { [K in CardStyleToken]?: number };

type Layers = { card?: ElvixCardStyle; provider?: ElvixCardStyle; console?: unknown };

/**
 * A card style whose every value is safe to write into a CSS variable as it is: numbers in
 * range, fonts as finished `font-family` values; keys left out take the default. Only
 * `CardLook.merge` makes one (the constructor is private, the `#values` field makes the
 * type nominal), so tsc refuses an object nobody checked where `cardLookVars` takes one.
 */
export class CardLook {
  readonly #values: Readonly<LookValues>;

  private constructor(values: LookValues) {
    this.#values = values;
  }

  /** The card's own prop over the provider's over the Console's, per key, each checked. The
   *  Console's value is untrusted wire data (fonts must be one of `CONSOLE_FONTS`); the
   *  props come from the host's code (fonts may be a family list or a `var()`). */
  static merge(layers: Layers): CardLook {
    return new CardLook({
      ...checkLayer(layers.console, consoleFontFamily),
      ...checkLayer(layers.provider, hostFontFamily),
      ...checkLayer(layers.card, hostFontFamily),
    });
  }

  get values(): Readonly<LookValues> {
    return this.#values;
  }
}

/** Appended to every family, so a family the page has not loaded falls back to a sans-serif,
 *  never to the browser's default serif. */
const GENERIC = "sans-serif";

/** Inside a quoted name: anything but its own quote, a control character, or what is CSS
 *  beyond a name (a declaration end, a block, an escape, an at-rule, a comment, markup,
 *  `!important`). */
const IN_QUOTES = String.raw`[^"'\\;{}<>@!/\p{Cc}]`;
/** One family: a bare name (words of letters, digits, `_` and `-`), a closed `"…"` or
 *  `'…'` string, or `var(--name)`, the one function allowed (`var(--font-inter)` from
 *  next/font). A quote may hold the other kind: `"a'b"` is closed. */
const FAMILY_ITEM = [
  String.raw`[\p{L}\p{N}_-]+(?: +[\p{L}\p{N}_-]+)*`,
  `"(?:${IN_QUOTES}|')*"`,
  `'(?:${IN_QUOTES}|")*'`,
  String.raw`var\(--[A-Za-z0-9_-]+\)`,
].join("|");
/** The whole value: families and commas, nothing else, so no string is ever left open to
 *  swallow what follows it in a server-written `style` attribute (the brand colours). */
const FAMILY_LIST = new RegExp(`^(?:${FAMILY_ITEM})(?: *, *(?:${FAMILY_ITEM}))*$`, "u");

/**
 * A host's font family, from its own code (`cardStyle.fontText` on a prop): a list of
 * `FAMILY_ITEM`s. Anything else, a URL, an open or stray quote or a control character
 * included, is refused (`undefined`, the page's font stays).
 */
export function hostFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const family = value.trim();
  if (family.length > 200 || !FAMILY_LIST.test(family)) return undefined;
  return `${family}, ${GENERIC}`;
}

/** A Console font name as a `font-family` value, quoted; `undefined` when it is not one. */
export function consoleFontFamily(value: unknown): string | undefined {
  return isConsoleFontName(value) ? `"${value}", ${GENERIC}` : undefined;
}

/** One layer's values, checked: numbers clamped, fonts through `font`. A value refused here
 *  is dropped without a word, on purpose: the layer under it (or the default) stays, and a
 *  style must never break or block a sign-in. The rules are in `ElvixCardStyle`'s docs. */
function checkLayer(layer: unknown, font: (value: unknown) => string | undefined): LookValues {
  const look: LookValues = {};
  if (typeof layer !== "object" || layer === null) return look;
  const field = (key: string): unknown =>
    Object.hasOwn(layer, key) ? Reflect.get(layer, key) : undefined;
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

/** The defaults of elvix's bordered card: 28 px under the legal line, above its footer bar,
 *  where a transparent card had 24 (before 0.26). */
export const BORDERED_DEFAULTS = CardLook.merge({ card: { gapFooter: BORDERED_GAP_FOOTER } });

/** Every card variable for `look`, each missing one from `defaults`, else the token's own.
 *  Both come from `CardLook.merge`: nothing else makes one. */
export function cardLookVars(look: CardLook, defaults?: CardLook): Record<string, string> {
  const own = look.values;
  const vars: Record<string, string> = {};
  for (const token of CARD_STYLE_TOKENS) {
    const value = own[token] ?? defaults?.values[token] ?? CARD_STYLE_RANGES[token].default;
    vars[TOKEN_VARS[token]] = token === "headingWeight" ? String(value) : `${value}px`;
  }
  vars["--elvix-font-text"] = own.fontText ?? INHERIT;
  vars["--elvix-font-display"] = own.fontDisplay ?? own.fontText ?? INHERIT;
  return vars;
}
