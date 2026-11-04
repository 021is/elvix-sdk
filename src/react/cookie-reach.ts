/**
 * Can elvix's session cookie reach a request from this page to `baseUrl`?
 *
 * elvix's session cookies are `SameSite=Lax` and host-only (elvix
 * `lib/auth.ts`), and a browser never sends a Lax cookie on a cross-site
 * `fetch`. So on a host like danceclub.dev with no bearer token, asking
 * `sdk-context` can only ever answer 401, one red line in every signed-out
 * visitor's console (0.21). The cookie can arrive only from the same origin
 * (`baseUrl=""`, elvix's own pages) or from the same site, siblings included
 * (a.example.com to auth.example.com). Without a public-suffix list that is
 * read as: the last two labels of the hosts match, which errs toward asking
 * (foo.co.uk and bar.co.uk ask, at the cost of one request). Anything
 * unparsable answers `true`, so a doubt costs one request, never a missed
 * session.
 */
export function cookieCanReach(baseUrl: string, pageHost: string): boolean {
  if (baseUrl === "") return true;
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return true;
  }
  if (!host || !pageHost) return true;
  return lastTwoLabels(host) === lastTwoLabels(pageHost);
}

function lastTwoLabels(host: string): string {
  return host.toLowerCase().split(".").slice(-2).join(".");
}
