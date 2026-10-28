/**
 * The focus look of every bordered text control: the app's primary colour
 * (`--elvix-primary`, from the Console brand) on the border and a soft ring.
 * A hard-coded purple here ignored the colour the customer chose, so a brand
 * that was not purple got a purple outline on the OTP boxes and the sign-in
 * inputs. `tests/brand-colors.test.ts` fails on a literal colour in a focus
 * class.
 *
 * Both colours carry Tailwind's `color:` type hint. Without it a bare `var()`
 * is ambiguous (a colour or a width), and the focused field drew the text
 * colour instead of the brand: a near-black border and ring (seen 2026-10-28).
 */
export const BRAND_FOCUS =
  "focus:outline-none focus:border-[color:var(--elvix-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--elvix-primary)_25%,transparent)]";

/** The bordered box of the sign-in card's code step. */
export const FIELD_OUTLINED = "bg-surface border border-border-base";

/**
 * The compact field of `<ElvixEmailCodeSignIn>` (0.17): plain CSS in
 * `styles/fields.css`, restyled only through its `--elvix-field*` variables,
 * so no host stylesheet or load order can change it.
 */
export const FIELD_COMPACT = "elvix-field";
