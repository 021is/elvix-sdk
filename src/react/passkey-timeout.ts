/**
 * Every passkey request to elvix is bounded (0.26, security review 4, 2026-11-12): a
 * `start` or `finish` that never answers would hold the page's one passkey request
 * (`passkey-lock.ts`) for good. After `PASSKEY_REQUEST_TIMEOUT_MS` it is aborted and ends as
 * the retryable `network` error.
 *
 * One path for every browser: a controller aborted by the timer or by the caller's own
 * signal (an autofill offer's), rather than `AbortSignal.timeout` / `AbortSignal.any`,
 * which older Safari lacks.
 */

export const PASSKEY_REQUEST_TIMEOUT_MS = 20_000;

/** A signal that aborts after the timeout, or when `own` does. */
export function passkeyRequestSignal(own?: AbortSignal | null): AbortSignal {
  const bounded = new AbortController();
  const end = () => bounded.abort();
  setTimeout(end, PASSKEY_REQUEST_TIMEOUT_MS);
  if (own?.aborted) end();
  else own?.addEventListener("abort", end, { once: true });
  return bounded.signal;
}
