/**
 * Session token store for cross-origin SDK use.
 *
 * When the SDK runs on a customer app's own origin it can't use elvix's
 * session cookie (third-party cookies are blocked), so sign-in returns a
 * token that every subsequent call carries as `Authorization: Bearer`.
 * `<ElvixSignIn>` stores it here; `appPost/appPatch/appDelete` and the live
 * hooks attach it. Same-origin hosts never store a token, so these are no-ops
 * and the cookie path is used unchanged.
 */

const STORAGE_KEY = "elvix.session.token";

let memToken: string | null = null;

/** Current session token (memory first, then localStorage), or null. */
export function getElvixToken(): string | null {
  if (memToken) return memToken;
  if (typeof window !== "undefined") {
    try {
      memToken = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // private-mode / sandboxed frame — memory-only fallback
    }
  }
  return memToken;
}

/** Store (or clear with null) the session token. Persists to localStorage. */
export function setElvixToken(token: string | null): void {
  memToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // memory-only fallback
  }
}

/**
 * Auth/credentials additions for a cross-origin-aware request. When a token
 * exists (cross-origin), returns a bearer header and `credentials: "omit"`
 * (never send cross-site cookies). With no token (same-origin), returns
 * `credentials: "include"` so the elvix cookie rides along as before.
 */
export function authInit(): { headers: Record<string, string>; credentials: RequestCredentials } {
  const token = getElvixToken();
  return token
    ? { headers: { authorization: `Bearer ${token}` }, credentials: "omit" }
    : { headers: {}, credentials: "include" };
}

/**
 * Fragment key the elvix Google redirect-callback appends the session token
 * under (`<returnUrl>#elvix_token=<token>`). The token rides the URL fragment,
 * which browsers never send to the server, so it's only ever read here on the
 * host page after the cross-origin Google round-trip returns.
 */
const RETURN_TOKEN_KEY = "elvix_token";

/**
 * On the host page, pick up a session token handed back by elvix's Google
 * redirect-callback in the URL fragment, store it, and strip it from the URL
 * so a refresh/back-nav doesn't replay it (and it never leaks into history,
 * referrers, or analytics). Returns the token it consumed, or null.
 *
 * Idempotent and SSR-safe: a no-op (returns null) when there's no `window` or
 * no `#elvix_token=` present. `<ElvixProvider>` calls this automatically on
 * mount; hosts that don't mount the provider at the redirect target can call
 * it directly (it's exported from `@elvix.is/sdk/react`).
 */
export function consumeElvixReturnToken(): string | null {
  if (typeof window === "undefined") return null;
  const { hash } = window.location;
  if (!hash || hash.length < 2) return null;
  // Fragment may be `#elvix_token=...` or `#a=1&elvix_token=...`.
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get(RETURN_TOKEN_KEY);
  if (!token) return null;

  setElvixToken(token);

  // Strip only our key; preserve any other fragment params the host uses.
  params.delete(RETURN_TOKEN_KEY);
  const rest = params.toString();
  try {
    const url = new URL(window.location.href);
    url.hash = rest ? `#${rest}` : "";
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // History API unavailable (sandboxed frame) — token is already stored,
    // which is what matters; the stale fragment is cosmetic.
  }
  return token;
}

/**
 * True when `baseUrl` is empty or resolves to the current page's origin.
 *
 * The sign-in fetches can't use `authInit()` (no token exists yet), so they
 * pick credentials from this directly: same-origin keeps `credentials:
 * "include"` so the Set-Cookie lands; cross-origin uses `"omit"`, because
 * elvix answers cross-origin with a wildcard `Access-Control-Allow-Origin: *`
 * and the browser blocks any credentialed request against a wildcard. The
 * session token comes back in the response body cross-origin anyway.
 */
export function isSameOrigin(baseUrl: string): boolean {
  if (!baseUrl) return true;
  if (typeof window === "undefined") return true;
  try {
    return new URL(baseUrl, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}
