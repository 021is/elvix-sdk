/**
 * The one guard every SDK navigation to a server- or prop-supplied URL passes
 * through. `window.location.href = x` runs `javascript:` URLs and follows any
 * origin, so a poisoned `redirectAfterSignIn`, onboarding `final` or `redirect`
 * would be script execution or an open redirect.
 */

const FALLBACK = "/";
const WEB_PROTOCOLS = new Set(["http:", "https:"]);

function originOf(entry: string): string | null {
  try {
    return new URL(entry).origin;
  } catch {
    return null;
  }
}

/**
 * `target` when it is an http(s) URL on this page's origin or on one of
 * `allowedOrigins` (the app's registered origins), else "/". Relative paths
 * pass; protocol-relative (`//evil`), `javascript:` and `data:` do not.
 * Parsing does the work, so `/\evil.com` and similar tricks resolve to the
 * origin the browser would really use and are judged by it.
 */
export function safeRedirect(
  target: string | null | undefined,
  allowedOrigins: readonly string[] = [],
): string {
  if (!target || typeof window === "undefined") return FALLBACK;
  let url: URL;
  try {
    url = new URL(target, window.location.href);
  } catch {
    return FALLBACK;
  }
  if (!WEB_PROTOCOLS.has(url.protocol)) return FALLBACK;
  if (url.origin === window.location.origin) return target;
  const allowed = allowedOrigins.some((entry) => originOf(entry) === url.origin);
  return allowed ? target : FALLBACK;
}
