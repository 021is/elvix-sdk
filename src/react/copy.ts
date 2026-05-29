/**
 * Editable sign-in copy.
 *
 * Every user-facing string in the sign-in surface is overridable. Precedence,
 * lowest to highest:
 *
 *   built-in English defaults  <  Console-configured (bootstrap `strings`)  <  `copy` prop
 *
 * So an integrating developer edits copy in the elvix Console (no redeploy) and
 * can still override per-embed in code. `title` and `submitButton` are left out
 * of the defaults because their built-in value depends on the Application's
 * sign-in verb ("Sign in" vs "Log in"); the component fills them from the verb
 * when neither Console nor prop sets them.
 *
 * Strings may contain `{app}` / `{email}` tokens; `fillCopy` interpolates them.
 */

export type ElvixCopy = {
  /** Heading. Token: {app}. Built-in: "Sign in to {app}" / "Log in to {app}". */
  title?: string;
  /** Subtitle under the heading. */
  subtitle?: string;
  /** Google factor button. */
  googleButton?: string;
  /** Passkey factor button. */
  passkeyButton?: string;
  /** Email field placeholder. */
  emailPlaceholder?: string;
  /** Email submit button (identify step). */
  sendCodeButton?: string;
  /** Email submit button while the request is in flight. */
  sendingLabel?: string;
  /** Code step subtitle. Token: {email}. */
  codeSentSubtitle?: string;
  /** OTP field placeholder. */
  codePlaceholder?: string;
  /** OTP submit button. Built-in: the sign-in verb. */
  submitButton?: string;
  /** OTP submit button while verifying. */
  verifyingLabel?: string;
  /** Terminal "done" pane text. */
  signedInText?: string;
  /** Validation: empty email. */
  errorEnterEmail?: string;
  /** Validation: code not 6 digits. */
  errorEnterCode?: string;
};

/** Built-in English defaults for the verb-independent strings. */
export const DEFAULT_COPY: ElvixCopy = {
  subtitle: "Pick how you want to continue.",
  googleButton: "Continue with Google",
  passkeyButton: "Continue with passkey",
  emailPlaceholder: "you@example.com",
  sendCodeButton: "Send code",
  sendingLabel: "Sending…",
  codeSentSubtitle: "We sent a 6-digit code to {email}.",
  codePlaceholder: "123456",
  verifyingLabel: "Verifying…",
  signedInText: "Signed in.",
  errorEnterEmail: "Enter an email.",
  errorEnterCode: "Enter the 6-digit code.",
};

/**
 * Merge the three copy layers. Later sources win; `undefined` fields don't
 * clobber earlier ones, so an override only needs the keys it changes.
 */
export function resolveCopy(
  bootstrap?: Partial<ElvixCopy> | null,
  prop?: Partial<ElvixCopy> | null,
): ElvixCopy {
  return {
    ...DEFAULT_COPY,
    ...stripUndefined(bootstrap),
    ...stripUndefined(prop),
  };
}

/** Replace `{token}` placeholders. Unknown tokens are left untouched. */
export function fillCopy(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in tokens ? tokens[key]! : whole,
  );
}

function stripUndefined(o?: Partial<ElvixCopy> | null): Partial<ElvixCopy> {
  if (!o) return {};
  const out: Partial<ElvixCopy> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
