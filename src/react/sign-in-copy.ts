/**
 * `<ElvixSignInForm>` wording and URLs: server error codes to user copy,
 * the OAuth start links, and where a finished sign-in lands by default.
 */

export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function formatRetry(t: Translator, seconds: number): string {
  if (seconds < 60) return t("common.durationSeconds", { seconds });
  const m = Math.ceil(seconds / 60);
  return m === 1 ? t("common.durationOneMinute") : t("common.durationMinutes", { minutes: m });
}

/**
 * Server error codes to catalog keys. Beyond the factor errors: the
 * signinGate refusals, the account-state guards
 * (lib/signin-account-state.ts) and the passkey outcomes, which otherwise
 * all read "Something went wrong". `unknown_credential` is a passkey the
 * keychain still offers but elvix has no record of (a stale credential), so
 * its copy gives the way out.
 */
const ERROR_KEYS: Record<string, string> = {
  invalid_code: "signin.errorInvalidCode",
  expired: "signin.errorExpired",
  send_failed: "signin.errorSendFailed",
  user_paused: "signin.errorUserPaused",
  user_banned: "signin.errorUserBanned",
  username_not_found: "signin.errorUsernameNotFound",
  method_disabled: "signin.errorMethodDisabled",
  gate_private_beta: "signin.errorGatePrivateBeta",
  gate_closed: "signin.errorGateClosed",
  gate_blocked: "signin.errorGateBlocked",
  user_deleted: "signin.errorUserDeleted",
  email_archived: "signin.errorEmailArchived",
  unknown_credential: "signin.errorPasskeyUnknown",
  verify_failed: "signin.errorPasskeyVerifyFailed",
  not_verified: "signin.errorPasskeyVerifyFailed",
  challenge_invalid: "signin.errorPasskeyExpired",
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
  return t((code && ERROR_KEYS[code]) || "signin.errorGeneric");
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
