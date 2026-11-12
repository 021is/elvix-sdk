/**
 * An app's type and spacing on elvix's sign-in card (0.26): the contract the Console, the
 * API and the SDK share. Plain data and pure checks, no React, so elvix's server validates a
 * Console value with the same ranges the card clamps to (`@elvix.is/sdk/server`).
 *
 * Every length is whole CSS pixels and every gap is the distance a person sees between two
 * parts of the card. Each default is the card's look before 0.26, so an app that sets nothing
 * looks exactly as it did. No token reaches the legal line's or the "Secured by elvix" chip's
 * size, colour, visibility or font (the app's fonts stop above the legal line: both keep the
 * page's), and the gaps above both have a floor: neither spacing nor a font can hide them.
 */

/** A numeric token's range. `step` rounds before the clamp (weights move by 100). */
type CardStyleRange = { min: number; max: number; default: number; step?: number };

export const CARD_STYLE_RANGES = {
  /** The heading's weight (the title, or the host's `headline`), on every step. */
  headingWeight: { min: 400, max: 800, default: 600, step: 100 },
  /** The logo image's height, and the height a host's `logoNode` is given. */
  logoHeight: { min: 24, max: 64, default: 48 },
  /** The inset left and right of everything in the card: methods, field, button. */
  paddingX: { min: 0, max: 40, default: 28 },
  /** The space above the logo. */
  paddingTop: { min: 0, max: 48, default: 28 },
  /** Between the logo and the title. */
  gapLogoTitle: { min: 0, max: 32, default: 12 },
  /** Between the title and the step under it (the methods, the code boxes). */
  gapTitleMethods: { min: 8, max: 40, default: 24 },
  /** Between two method buttons (Google, GitHub, passkey). */
  gapMethods: { min: 4, max: 16, default: 8 },
  /** From the methods to the "or" line, and from it to the field. */
  gapDivider: { min: 8, max: 32, default: 20 },
  /** Between the field and Continue. */
  gapFieldButton: { min: 8, max: 32, default: 20 },
  /** Between Continue and the host's `belowMethods` line (a tagline). */
  gapButtonSlot: { min: 8, max: 40, default: 20 },
  /** Above the legal line. Never under 12: the line stays apart and in view. */
  gapLegal: { min: 12, max: 40, default: 20 },
  /** Under the legal line, before "Secured by elvix" (24 px on a transparent card, 28 px on
   *  elvix's bordered one, above its footer bar). Never under 12. */
  gapFooter: { min: 12, max: 40, default: 24 },
} as const satisfies Record<string, CardStyleRange>;

/** The bordered card's own default for `gapFooter`: its body's bottom padding before 0.26. */
export const BORDERED_GAP_FOOTER = 28;

export type CardStyleToken = keyof typeof CARD_STYLE_RANGES;

function isCardStyleToken(key: string): key is CardStyleToken {
  return Object.hasOwn(CARD_STYLE_RANGES, key);
}

/** Every numeric token, in the card's order from top to bottom. (The filter narrows the keys'
 *  `string[]` to the token type without a cast; it drops nothing.) */
export const CARD_STYLE_TOKENS: readonly CardStyleToken[] =
  Object.keys(CARD_STYLE_RANGES).filter(isCardStyleToken);

/**
 * An app's type and spacing for the sign-in card. Every key is optional: what is left out
 * keeps the card's default. The same shape is `cardStyle` on `<ElvixProvider>` (every
 * surface), on `<ElvixSignInCard>` / `<ElvixSignInForm>` (that card), and on the app in the
 * Console (`PATCH /api/applications/{id}`). The card prop wins over the provider's, and the
 * provider's over the Console's, key by key. A number out of its range is held at its edge;
 * a value that is not a number, or a font that is not a family, is ignored without a word
 * (its default stays): the sign-in never breaks on a style.
 */
export type ElvixCardStyle = {
  /** The card's text font: a family your page already loads (`"Inter"`,
   *  `"var(--font-inter)"`), for the head, the step and your `belowMethods` line; the legal
   *  line and the chip keep your page's font. Left out, the card takes your page's font. The
   *  SDK never downloads a font. A value is a comma-separated list of bare names, closed
   *  `"…"` / `'…'` strings and `var(--name)`; anything else (a URL, a `;`, a quote left open,
   *  a control character) is ignored, and your page's font stays. In the Console it is one
   *  of `CONSOLE_FONTS`. */
  fontText?: string;
  /** The heading's font (title or `headline`); left out, `fontText`. */
  fontDisplay?: string;
} & { [K in CardStyleToken]?: number };

/** `value` as a token's whole pixels (or weight): rounded to its step, held in its range;
 *  `undefined` when it is not a finite number, so the default applies. */
export function clampCardToken(token: CardStyleToken, value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const range: CardStyleRange = CARD_STYLE_RANGES[token];
  const step = range.step ?? 1;
  const stepped = Math.round(value / step) * step;
  return Math.min(range.max, Math.max(range.min, stepped));
}

/** Whether `value` is in range as given: what the API accepts (it refuses, never clamps). */
export function isCardTokenInRange(token: CardStyleToken, value: unknown): boolean {
  return typeof value === "number" && clampCardToken(token, value) === value;
}

/**
 * The fonts an app can pick in the Console: the ones elvix serves from its own origin on its
 * own pages (the hosted sign-in, the passkey pages), each under a licence that allows it
 * (SIL OFL 1.1, checked in elvix where the files ship). A closed list, never a free name: a
 * symbol font (Wingdings) or a blank one cannot be picked, and a new font is added here and
 * in elvix's files in one release.
 */
export const CONSOLE_FONTS = [
  "Inter",
  "Urbanist",
  "Geist",
  "DM Sans",
  "Manrope",
  "Plus Jakarta Sans",
  "Nunito",
  "Montserrat",
  "Poppins",
  "Lato",
  "Lora",
] as const;
export type ConsoleFont = (typeof CONSOLE_FONTS)[number];

/** Whether `value` is one of `CONSOLE_FONTS`, exactly as written there. */
export function isConsoleFontName(value: unknown): value is ConsoleFont {
  return CONSOLE_FONTS.some((font) => font === value);
}
