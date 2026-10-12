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
