/**
 * The focus look of every bordered text control: the app's primary colour
 * (`--elvix-primary`, from the Console brand) on the border and a soft ring.
 * A hard-coded purple here ignored the colour the customer chose, so a brand
 * that was not purple got a purple outline on the OTP boxes and the sign-in
 * inputs. `tests/brand-colors.test.ts` fails on a literal colour in a focus
 * class.
 */
export const BRAND_FOCUS =
  "focus:outline-none focus:border-[var(--elvix-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--elvix-primary)_25%,transparent)]";

/**
 * The resting look of a field (0.17): `--elvix-field` is its fill and
 * `--elvix-field-border` its outline, set by the host on any ancestor. Unset,
 * each look keeps its own default: OUTLINED the surface and its border (the
 * sign-in card), TINTED a tint and no outline (`<ElvixEmailCodeSignIn>`,
 * which sits inside the host's own card). The fallbacks sit at the use site,
 * so a palette pinned on an ancestor (light / dark) still reaches them.
 */
export const FIELD_OUTLINED =
  "bg-[var(--elvix-field,var(--elvix-surface))] border border-[color:var(--elvix-field-border,var(--elvix-border))]";
export const FIELD_TINTED =
  "bg-[var(--elvix-field,var(--elvix-surface-active))] border border-[color:var(--elvix-field-border,transparent)]";
