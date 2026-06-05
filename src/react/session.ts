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
 * One-shot "the user just signed out" marker, stored in sessionStorage so it
 * survives the hard navigation to the sign-in page but not a new tab/session.
 * `signOut()` sets it; `redirectIfAuthenticated` reads + clears it to skip a
 * single auto-resume — so the SSO resume can never sign a user straight back
 * in on the post-logout landing, even if a session somehow lingers server-side.
 */
const SIGNED_OUT_KEY = "elvix_signed_out";

export function markSignedOut(): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    // sessionStorage can throw (privacy mode, disabled storage). The fixed
    // sign-out clearing is the load-bearing path; this flag is belt-and-braces.
  }
}

/** Read AND clear the just-signed-out marker. Returns true once after a sign-out. */
export function consumeSignedOutFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const v = window.sessionStorage.getItem(SIGNED_OUT_KEY);
    if (v) window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    return Boolean(v);
  } catch {
    return false;
  }
}

/**
 * Fragment key the elvix Google redirect-callback appends the session token
 * under (`<returnUrl>#elvix_token=<token>`). The token rides the URL fragment,
 * which browsers never send to the server, so it's only ever read here on the
 * host page after the cross-origin Google round-trip returns.
 */
const RETURN_TOKEN_KEY = "elvix_token";
const RETURN_LANDING_KEY = "elvix_landing";

/**
 * One-shot queue for the token that `consumeElvixReturnToken` just
 * stripped from the URL fragment. `<ElvixSignIn>` / `<ElvixSignInForm>`
 * drain it on mount and fire `onResult` so the host's existing redirect
 * handler runs (router.push, cookie write, etc.) — the same code path
 * an in-frame OTP / passkey sign-in already takes.
 *
 * Without this queue the redirect-OAuth flow stored the token silently
 * and the host page sat at /sign-in forever instead of advancing to
 * /app or wherever `redirectAfterSignIn` pointed.
 */
let _justReturnedToken: string | null = null;
export function takeJustReturnedToken(): string | null {
  const t = _justReturnedToken;
  _justReturnedToken = null;
  return t;
}

/**
 * Shape of the landing step descriptor the elvix backend encodes in
 * `#elvix_landing=<base64url-json>` alongside the token. Mirrors
 * `LandingStep` from elvix's `lib/onboarding.ts` (`done | username |
 * passkey | recover`). `<ElvixSignInForm>` feeds it into
 * `applyLanding()` so the post-Google-return host renders the remaining
 * onboarding gate inline instead of bouncing through elvix.is.
 */
export type ElvixLandingPayload =
  | { next_step: "done"; redirect?: string }
  | { next_step: "username"; suggestions?: string[]; final?: string }
  | { next_step: "passkey"; final?: string }
  | {
      next_step: "recover";
      final?: string;
      recover?: {
        appId: string;
        appName: string;
        state: string;
        sinceAt: string;
      };
    };

/**
 * One-shot queue for the landing step descriptor that
 * `consumeElvixReturnToken` just stripped from the fragment. Drained on
 * mount by `<ElvixSignInForm>` so a Google-redirect return can resume
 * the username / passkey / recover gate inline. Polished
 * `<ElvixSignIn>` drains it too and forwards to `onResult` so the host
 * can route on the descriptor if it cares.
 */
let _justReturnedLanding: ElvixLandingPayload | null = null;
export function takeJustReturnedLanding(): ElvixLandingPayload | null {
  const l = _justReturnedLanding;
  _justReturnedLanding = null;
  return l;
}

function decodeLandingPayload(b64url: string): ElvixLandingPayload | null {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    return JSON.parse(json) as ElvixLandingPayload;
  } catch {
    return null;
  }
}

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
  _justReturnedToken = token;
  // Landing step descriptor (optional) — only present when the elvix
  // backend determined the user has remaining onboarding gates after
  // the Google round-trip. Decode + queue for the form to drain.
  const landingRaw = params.get(RETURN_LANDING_KEY);
  if (landingRaw) {
    const decoded = decodeLandingPayload(landingRaw);
    if (decoded) {
      _justReturnedLanding = decoded;
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent("elvix:return-token", {
        detail: { token, landing: _justReturnedLanding },
      }),
    );
  } catch {
    // CustomEvent may be unavailable in very old browsers — the queue
    // above is the load-bearing path; the event is a nice-to-have.
  }

  // Strip our keys; preserve any other fragment params the host uses.
  params.delete(RETURN_TOKEN_KEY);
  params.delete(RETURN_LANDING_KEY);
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
