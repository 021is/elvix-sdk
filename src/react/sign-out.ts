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

import { setElvixToken } from "./session";

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
  const { redirectAfterSignOut, cookieName = "elvix_token" } = options;
  try {
    // The SDK's cross-origin interceptor rewrites `/api/...` calls
    // to the elvix origin and attaches the Bearer token when running
    // on a customer origin. Same-origin sends the cookie automatically.
    // One relative fetch covers both modes.
    const res = await fetch("/api/auth/sign-out?surface=app", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok && res.status !== 204) {
      return {
        ok: false,
        error: `http_${res.status}`,
        message: `sign-out failed (HTTP ${res.status})`,
      };
    }

    // Always clear local state regardless of whether the server had
    // a row to invalidate — the caller's intent is to be signed out.
    setElvixToken(null);
    if (cookieName && typeof document !== "undefined") {
      const secure =
        typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax${secure}`;
    }

    const target = redirectAfterSignOut === null ? undefined : (redirectAfterSignOut ?? "/");
    if (target && typeof window !== "undefined") {
      // Use `location.replace` so the signed-in page does not stay in
      // history (back button would otherwise land the user on a stale
      // authenticated screen). Resolve relative targets against the
      // host's own origin so a customer that passes "/" never bounces
      // through elvix.is by accident. Navigate synchronously — the
      // microtask wrap was buying nothing and was occasionally letting
      // a parallel host re-render swallow the navigation (the "have to
      // click twice" report).
      const abs = new URL(target, window.location.origin).toString();
      window.location.replace(abs);
    }
    return { ok: true, redirect: target };
  } catch (e) {
    return {
      ok: false,
      error: "network_error",
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
