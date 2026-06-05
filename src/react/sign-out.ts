/**
 * `signOut()` — the one-line sign-out primitive every elvix
 * integration uses. Mirrors the `<ElvixSignOutButton>` flow without
 * the UI, so hosts that already have a "Sign out" button in their
 * design system can drop the elvix call in `onClick` and get the
 * same behaviour: invalidates the session server-side, emits
 * `user.signed_out` for the webhook receiver, clears the SDK's
 * in-memory + localStorage token, drops the `elvix_token` cookie,
 * then navigates.
 *
 * Three callers, one shared implementation:
 *   - `<ElvixSignOutButton>` (this module + the button)
 *   - `useSignOut()` React hook (this module + busy state)
 *   - Vanilla `signOut(...)` for non-React contexts or server-action
 *     wrappers.
 */

import { authInit, markSignedOut, setElvixToken } from "./session";

export type SignOutResult =
  | { ok: true; redirect?: string }
  | { ok: false; error: string; message?: string };

export type SignOutOptions = {
  /**
   * Where to navigate after a successful sign-out. Defaults to the
   * current origin's root. Pass `null` to disable navigation; the
   * caller owns the next step (use the resolved result).
   */
  redirectAfterSignOut?: string | null;
  /**
   * Cookie name to clear client-side after sign-out. Defaults to
   * `elvix_token` (the SDK's canonical name). Pass `null` to skip
   * the cookie clear (your server tears down its own httpOnly cookie).
   */
  cookieName?: string | null;
  /**
   * elvix origin to call. REQUIRED for cross-origin hosts — the sign-out
   * request must reach elvix.is, not the customer's own origin. `useSignOut`
   * / `<ElvixSignOutButton>` inject it from `<ElvixProvider baseUrl>`
   * automatically; only set it when calling `signOut()` standalone. Empty
   * string (or omitted) means same-origin (elvix's own surfaces).
   */
  baseUrl?: string;
};

/**
 * Run the elvix sign-out flow. Resolves once the elvix backend has
 * invalidated the session AND the SDK has cleared its local token
 * (+ optionally the cookie). When `redirectAfterSignOut` is set
 * (the default), the function ALSO navigates the browser; you can
 * still observe the terminal state through the returned promise.
 *
 * Safe to call from any context (button onClick, menu-item onSelect,
 * keyboard shortcut, a server-action wrapper). Idempotent: calling
 * twice in quick succession is harmless (the second call hits an
 * already-ended session, gets a 204, still clears local state).
 */
export async function signOut(options: SignOutOptions = {}): Promise<SignOutResult> {
  const { redirectAfterSignOut, cookieName = "elvix_token", baseUrl } = options;
  // Reach elvix.is cross-origin with the bearer attached, exactly like every
  // other SDK call (presence, hooks). The old relative `/api/...` fetch + a
  // mythical "interceptor" hit the CUSTOMER origin (404) on cross-origin hosts,
  // so the session was never invalidated. `authInit()` sends the bearer
  // cross-origin and the cookie same-origin. `base` "" == same-origin.
  const base = typeof baseUrl === "string" ? baseUrl : "";
  let result: SignOutResult;
  try {
    const res = await fetch(`${base}/api/auth/sign-out?surface=app`, {
      method: "POST",
      ...authInit(),
    });
    result =
      !res.ok && res.status !== 204
        ? { ok: false, error: `http_${res.status}`, message: `sign-out failed (HTTP ${res.status})` }
        : { ok: true, redirect: undefined };
  } catch (e) {
    result = { ok: false, error: "network_error", message: e instanceof Error ? e.message : "network error" };
  }

  // ALWAYS clear local state — the user's intent is to be signed out even if
  // the server call failed (offline, transient 5xx). Leaving a live token
  // behind is what let `redirectIfAuthenticated` resume a "signed-out" user.
  setElvixToken(null);
  // One-shot flag the sign-in surface checks: suppress `redirectIfAuthenticated`
  // for the immediate post-sign-out load so the resume can never fight a logout,
  // even if a session somehow lingers.
  markSignedOut();
  if (cookieName && typeof document !== "undefined") {
    const secure =
      typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax${secure}`;
  }

  const target = redirectAfterSignOut === null ? undefined : (redirectAfterSignOut ?? "/");
  if (result.ok) result = { ok: true, redirect: target };
  if (target && typeof window !== "undefined") {
    // `location.replace` (hard nav) so the signed-in page leaves history and
    // the whole tree tears down — a soft SPA nav left stale SDK state mounted
    // and produced the "have to click twice" report.
    const abs = new URL(target, window.location.origin).toString();
    window.location.replace(abs);
  }
  return result;
}
