/**
 * An app's type and spacing on elvix's sign-in card (0.26): the contract the Console, the
 * API and the SDK share. Plain data and pure checks, no React, so elvix's server validates a
 * Console value with the same ranges the card clamps to (`@elvix.is/sdk/server`).
 *
 * Every length is whole CSS pixels and every gap is the distance a person sees between two
 * parts of the card. Each default is the card's look before 0.26, so an app that sets nothing
 * looks exactly as it did. No token reaches the legal line's or the "Secured by elvix" chip's
 * size, colour or visibility, and the gaps above both have a floor: spacing cannot hide them.
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

/** Every numeric token, in the card's order from top to bottom. */
export const CARD_STYLE_TOKENS: readonly CardStyleToken[] =
  Object.keys(CARD_STYLE_RANGES).filter(isCardStyleToken);

/**
 * An app's type and spacing for the sign-in card. Every key is optional: what is left out
 * keeps the card's default. The same shape is `cardStyle` on `<ElvixProvider>` (every
 * surface), on `<ElvixSignInCard>` / `<ElvixSignInForm>` (that card), and on the app in the
 * Console (`PATCH /api/applications/{id}`). The card prop wins over the provider's, and the
 * provider's over the Console's, key by key.
 */
export type ElvixCardStyle = {
  /** The card's text font: a family your page already loads (`"Inter"`,
   *  `"var(--font-inter)"`). Left out, the card takes your page's font. The SDK never
   *  downloads a font; a value with a URL, a `;`, a brace or any function but `var()` is
   *  ignored, and your page's font stays. */
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
  return clampCardToken(token, value) === value;
}

/**
 * A font family as the Console stores it: a plain name, letters, digits, spaces and
 * hyphens, starting with a letter, 64 characters at most. No quotes, commas, brackets or
 * URLs can pass, so a Console value is only ever the name of a family, never CSS.
 */
const CONSOLE_FONT_NAME = /^[A-Za-z][A-Za-z0-9 -]{0,63}$/;

export function isConsoleFontName(value: unknown): value is string {
  return typeof value === "string" && CONSOLE_FONT_NAME.test(value) && value.trim() === value;
}
