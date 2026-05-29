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
