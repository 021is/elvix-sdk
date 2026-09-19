/**
 * `<ElvixSignInForm>` wording and URLs: server error codes to user copy,
 * the OAuth start links, and where a finished sign-in lands by default.
 */

export type Translator = (key: string, params?: Record<string, string | number>) => string;

/**
 * Translate-or-fallback wrapper. `useT()` returns the key itself when
 * the catalog is missing the translation, so we trap that case and
 * paint the bundled English string instead of leaking the raw key to
 * a customer. This lets the SDK ship new error codes ahead of the i18n
 * catalogs without surfacing `signin.errorGatePrivateBeta` to users.
 */
export function tOrFallback(t: Translator, key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}

export function formatRetry(t: Translator, seconds: number): string {
  if (seconds < 60) return t("common.durationSeconds", { seconds });
  const m = Math.ceil(seconds / 60);
  return m === 1 ? t("common.durationOneMinute") : t("common.durationMinutes", { minutes: m });
}

/** Codes whose copy is a plain catalog key. */
const PLAIN_ERRORS: Record<string, string> = {
  invalid_code: "signin.errorInvalidCode",
  expired: "signin.errorExpired",
  send_failed: "signin.errorSendFailed",
  user_paused: "signin.errorUserPaused",
  user_banned: "signin.errorUserBanned",
  username_not_found: "signin.errorUsernameNotFound",
  method_disabled: "signin.errorMethodDisabled",
};

/**
 * Codes the catalogs may not carry yet, with their bundled English:
 * the signinGate refusals, the account-state guards
 * (lib/signin-account-state.ts), and the passkey outcomes. Without these
 * every host saw "Something went wrong" instead of the real reason.
 * `unknown_credential` is a passkey the keychain still offers but elvix has
 * no record of (a stale credential), so the copy gives the way out.
 */
const FALLBACK_ERRORS: Record<string, [key: string, english: string]> = {
  gate_private_beta: [
    "signin.errorGatePrivateBeta",
    "This app is in private beta. Ask the owner for an invite.",
  ],
  gate_closed: [
    "signin.errorGateClosed",
    "Sign-ups are closed. Only existing members can sign in.",
  ],
  gate_blocked: ["signin.errorGateBlocked", "Your account isn't approved for this app yet."],
  user_deleted: [
    "signin.errorUserDeleted",
    "This account was deleted. Contact support if you need it back.",
  ],
  email_archived: [
    "signin.errorEmailArchived",
    "This email was retired from sign-in. Use your current address.",
  ],
  unknown_credential: [
    "signin.errorPasskeyUnknown",
    "This passkey isn't registered with elvix. Sign in another way, then remove it and add a new one in Security settings.",
  ],
  verify_failed: [
    "signin.errorPasskeyVerifyFailed",
    "That passkey couldn't be verified. Sign in another way, then re-add it in Security settings.",
  ],
  not_verified: [
    "signin.errorPasskeyVerifyFailed",
    "That passkey couldn't be verified. Sign in another way, then re-add it in Security settings.",
  ],
  challenge_invalid: [
    "signin.errorPasskeyExpired",
    "This passkey sign-in expired. Please try again.",
  ],
};

export function humanError(t: Translator, code?: string, retryAfterSeconds?: number): string {
  if (code === "too_recent") {
    return retryAfterSeconds
      ? t("signin.errorTooRecentWithSeconds", { seconds: retryAfterSeconds })
      : t("signin.errorTooRecent");
  }
  if (code === "too_many") {
    return retryAfterSeconds
      ? t("signin.errorTooManyWithRetry", { retry: formatRetry(t, retryAfterSeconds) })
      : t("signin.errorTooMany");
  }
  const plain = code ? PLAIN_ERRORS[code] : undefined;
  if (plain) return t(plain);
  const fallback = code ? FALLBACK_ERRORS[code] : undefined;
  if (fallback) return tOrFallback(t, fallback[0], fallback[1]);
  return t("signin.errorGeneric");
}

// Reason codes mirror /api/onboarding/username/check.
const USERNAME_REASONS: Record<string, string> = {
  blank: "username.reasonBlank",
  too_short: "username.reasonTooShort",
  too_long: "username.reasonTooLong",
  only_numbers: "username.reasonOnlyNumbers",
  bad_start: "username.reasonBadStart",
  bad_chars: "username.reasonBadChars",
  consecutive_special: "username.reasonConsecutiveSpecial",
  trailing_special: "username.reasonTrailingSpecial",
  taken: "username.reasonTaken",
};

export function usernameReasonLabel(t: Translator, reason: string): string {
  return t(USERNAME_REASONS[reason] ?? "username.reasonInvalid");
}

export const OAuthProvider = {
  GOOGLE: "google",
  GITHUB: "github",
} as const;
export type OAuthProvider = (typeof OAuthProvider)[keyof typeof OAuthProvider];

/**
 * The `/api/auth/<provider>/start` link for a redirect-OAuth button. For
 * `intent="app"` the cross-origin flow needs a `returnUrl` so elvix's callback
 * can bounce the user back to THIS page with the session token in the
 * fragment; elvix checks that origin against the app's `allowedOrigins`, so
 * deriving it from the live location is safe. Account and console intents are
 * first-party and need none.
 */
export function oauthStartHref(
  provider: OAuthProvider,
  baseUrl: string,
  intent?: string,
  clientId?: string,
): string {
  const params = new URLSearchParams({ intent: intent ?? "app" });
  if (clientId) params.set("clientId", clientId);
  if (intent === "app" && typeof window !== "undefined") {
    params.set("returnUrl", window.location.href);
  }
  return `${baseUrl}/api/auth/${provider}/start?${params.toString()}`;
}

export function defaultRedirect(intent?: string): string {
  if (intent === "console") return "/console";
  if (intent === "account") return "/account";
  return "/";
}
