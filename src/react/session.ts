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

const sessionListeners = new Set<() => void>();

/**
 * "The session changed": this tab ended it (`endLocalSession`) or another tab
 * stored or cleared the token (the `storage` event). `<ElvixProvider>`
 * listens and re-reads the envelope, so `useElvixSession()` follows without
 * a refocus. A sign-in does not announce here: the form refreshes the
 * provider itself once the whole flow, onboarding included, is complete, so
 * a half-finished sign-in never reads as signed in to the host.
 */
export function announceSessionChange(): void {
  for (const listener of sessionListeners) listener();
}

/** Subscribe to {@link announceSessionChange}; returns the unsubscribe. */
export function onElvixSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);
  if (typeof window === "undefined") return () => sessionListeners.delete(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    memToken = e.newValue;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    sessionListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
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
/** Echo of the `state` the redirect started with; see {@link signInState}. */
const RETURN_STATE_KEY = "elvix_state";
const STATE_STORAGE_KEY = "elvix.signin.state";
const STATE_BYTES = 16;

/**
 * The one-time `state` that binds a redirect sign-in to the browser tab that
 * started it. Every redirect start (Google, GitHub, the hosted passkey pages)
 * sends it through elvix, which echoes it back in the return fragment;
 * {@link consumeElvixReturnToken} accepts a returned token only when it
 * matches. Without it, anyone could send a victim
 * `https://host/#elvix_token=<attacker's session>` and sign them in as the
 * attacker (login CSRF). Kept in sessionStorage: it survives the round-trip
 * in this tab and is invisible to every other. Returns null when storage is
 * blocked, in which case no redirect return can validate and sign-in fails
 * closed rather than open.
 */
export function signInState(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(STATE_STORAGE_KEY);
    if (existing) return existing;
    const bytes = window.crypto.getRandomValues(new Uint8Array(STATE_BYTES));
    const fresh = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    window.sessionStorage.setItem(STATE_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/**
 * True, and the nonce discarded, when `returned` is this tab's pending
 * `state`: good for one return. A mismatch leaves it alone, so a forged link
 * cannot cancel the sign-in the user actually started.
 */
function spendSignInState(returned: string): boolean {
  try {
    if (window.sessionStorage.getItem(STATE_STORAGE_KEY) !== returned) return false;
    window.sessionStorage.removeItem(STATE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Sticky (page-load-scoped, NOT one-shot) flag: did `consumeElvixReturnToken`
 * pick a token out of the URL fragment on this load? `redirectIfAuthenticated`
 * reads it to YIELD — when a fresh cross-origin sign-in just returned, the
 * form's own return handler owns the completion (including onboarding panes
 * like passkey enrollment), so the SSO resume must not race ahead and skip it.
 * Distinct from the one-shot `_justReturnedToken`, which the form drains before
 * the async session probe resolves.
 */
let _returnTokenConsumed = false;
export function wasReturnTokenConsumed(): boolean {
  return _returnTokenConsumed;
}

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

const isString = (v: unknown): v is string => typeof v === "string";
const optionalString = (v: unknown) => v === undefined || isString(v);
const MAX_SUGGESTIONS = 10;

/**
 * Narrow untrusted JSON to a landing step, or null. The fragment is decoded
 * from a URL, so nothing in it is trusted: an unknown step, a wrong field
 * type or a missing recover detail yields null (the sign-in then completes
 * as a plain one), never a half-typed object the form would render.
 */
export function parseLandingPayload(raw: unknown): ElvixLandingPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  switch (p.next_step) {
    case "done":
      return optionalString(p.redirect) ? (p as ElvixLandingPayload) : null;
    case "username": {
      const s = p.suggestions;
      const suggestionsOk =
        s === undefined || (Array.isArray(s) && s.length <= MAX_SUGGESTIONS && s.every(isString));
      return suggestionsOk && optionalString(p.final) ? (p as ElvixLandingPayload) : null;
    }
    case "passkey":
      return optionalString(p.final) ? (p as ElvixLandingPayload) : null;
    case "recover": {
      const r = p.recover as Record<string, unknown> | undefined;
      const recoverOk =
        r === undefined ||
        (typeof r === "object" &&
          r !== null &&
          [r.appId, r.appName, r.state, r.sinceAt].every(isString));
      return recoverOk && optionalString(p.final) ? (p as ElvixLandingPayload) : null;
    }
    default:
      return null;
  }
}

function decodeLandingPayload(b64url: string): ElvixLandingPayload | null {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    return parseLandingPayload(JSON.parse(atob(b64 + pad)));
  } catch {
    return null;
  }
}

/**
 * Remove our keys from the URL fragment, keeping any other fragment params
 * the host uses. `replaceState(null, …)`, not the current `history.state`: a
 * router (Next's App Router) keeps its own tree in that state and patches
 * `replaceState` to learn the new URL when it gets none. Passing its private
 * state back made it keep `#elvix_token` in its canonical URL and write it
 * back on the next navigation.
 */
function stripReturnParams(params: URLSearchParams): void {
  params.delete(RETURN_TOKEN_KEY);
  params.delete(RETURN_LANDING_KEY);
  params.delete(RETURN_STATE_KEY);
  const rest = params.toString();
  try {
    const url = new URL(window.location.href);
    url.hash = rest ? `#${rest}` : "";
    window.history.replaceState(null, "", url.toString());
  } catch {
    // History API unavailable (sandboxed frame): the fragment stays, but a
    // token that fails the state check is never stored, so it does no harm.
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
  const landingRaw = params.get(RETURN_LANDING_KEY);
  const returnedState = params.get(RETURN_STATE_KEY);
  if (!token && !landingRaw && !returnedState) return null;

  // Strip first, whatever happens next: the token must never linger in the
  // address bar (copied, shared, sent in a referrer), accepted or not.
  stripReturnParams(params);

  // Accept only the return of a sign-in THIS tab started (login CSRF guard).
  if (!token || !returnedState || !spendSignInState(returnedState)) return null;

  setElvixToken(token);
  _justReturnedToken = token;
  // Sticky for the whole page load so `redirectIfAuthenticated` yields to the
  // form's return handler (which runs the onboarding panes). The one-shot
  // `_justReturnedToken` above is drained too early to gate the async resume.
  _returnTokenConsumed = true;
  // Landing step descriptor (optional) — only present when the elvix
  // backend determined the user has remaining onboarding gates after
  // the Google round-trip. Decode + queue for the form to drain.
  if (landingRaw) _justReturnedLanding = decodeLandingPayload(landingRaw);
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
    // Unparseable: not provably same-origin, so never credentialed.
    return false;
  }
}
