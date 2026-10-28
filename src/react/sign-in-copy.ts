/**
 * `<ElvixSignInForm>` wording and URLs: server error codes to user copy,
 * the OAuth start links, and where a finished sign-in lands by default.
 */

import { currentDpopThumbprint } from "./dpop";
import { isSameOrigin, signInState } from "./session";

/** RFC 9449 §10: a redirect start names the browser key, so the session binds at mint. */
const DPOP_JKT_PARAM = "dpop_jkt";

function withDpopJkt(params: URLSearchParams): void {
  const jkt = currentDpopThumbprint();
  if (jkt) params.set(DPOP_JKT_PARAM, jkt);
}

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
  // The code legs' own refusals (0.17): each says what to do, never "Something went wrong".
  too_many_attempts: "signin.errorTooManyAttempts",
  already_used: "signin.errorCodeUsed",
  not_found: "signin.errorCodeGone",
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
  // A passkey made for another app, or on the elvix account: refused for this one.
  credential_not_for_app: "signin.errorPasskeyWrongApp",
  credential_not_for_surface: "signin.errorPasskeyWrongApp",
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
 * first-party and need none, and neither does elvix's own hosted page: on
 * elvix's origin the callback completes with the cookie session, and a
 * `returnUrl` there is refused (elvix is in no app's `allowedOrigins`), which
 * broke Google and GitHub on `/sign-in/<clientId>`.
 */
export function oauthStartHref(
  provider: OAuthProvider,
  baseUrl: string,
  intent?: string,
  clientId?: string,
): string {
  const params = new URLSearchParams({ intent: intent ?? "app" });
  if (clientId) params.set("clientId", clientId);
  if (intent === "app" && typeof window !== "undefined" && !isSameOrigin(baseUrl)) {
    params.set("returnUrl", window.location.href);
    const state = signInState();
    if (state) params.set("state", state);
    withDpopJkt(params);
  }
  return `${baseUrl}/api/auth/${provider}/start?${params.toString()}`;
}

/**
 * A hosted passkey page on elvix.is (`passkey` sign-in, `passkey-register`
 * enrollment) that returns to THIS page with `#elvix_token`. Carries the same
 * one-time `state` as the OAuth starts, so the return validates.
 */
export function hostedCeremonyUrl(
  baseUrl: string,
  page: "passkey" | "passkey-register",
  clientId: string,
): string {
  const params = new URLSearchParams({ returnUrl: window.location.href });
  const state = signInState();
  if (state) params.set("state", state);
  if (page === "passkey") withDpopJkt(params);
  return `${baseUrl}/auth/${page}/${encodeURIComponent(clientId)}?${params.toString()}`;
}

export function defaultRedirect(intent?: string): string {
  if (intent === "console") return "/console";
  if (intent === "account") return "/account";
  return "/";
}
