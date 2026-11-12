/**
 * Every wait in the passkey path is bounded or abortable (0.26, security reviews 4 and 5,
 * 2026-11-12). A `start` or `finish` that never answers, a browser prompt left open, a
 * probe or an extension that ignores its signal: none may hold the page's one passkey
 * request (`passkey-lock.ts`) for good.
 *
 * One path for every browser: a controller aborted by the timer or by the caller's own
 * signal (an autofill offer's), rather than `AbortSignal.timeout` / `AbortSignal.any`,
 * which older Safari lacks; and `orAbort` for an await whose own API takes no signal or
 * might not honour it.
 */

/** A request to elvix (`start`, `finish`): then it ends as the retryable `network` error. */
export const PASSKEY_REQUEST_TIMEOUT_MS = 20_000;
/** The browser's own passkey dialog: long enough for a person with a security key. */
export const PASSKEY_PROMPT_TIMEOUT_MS = 120_000;

/** A signal that aborts after `ms`, or when `own` does. */
export function passkeyRequestSignal(
  own?: AbortSignal | null,
  ms = PASSKEY_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const bounded = new AbortController();
  const end = () => bounded.abort();
  setTimeout(end, ms);
  if (own?.aborted) end();
  else own?.addEventListener("abort", end, { once: true });
  return bounded.signal;
}

/** `promise`, or `aborted` as soon as `signal` aborts, whether or not `promise` listens. */
export function orAbort<T>(promise: Promise<T>, signal: AbortSignal, aborted: T): Promise<T> {
  if (signal.aborted) return Promise.resolve(aborted);
  const ended = new Promise<T>((resolve) => {
    signal.addEventListener("abort", () => resolve(aborted), { once: true });
  });
  return Promise.race([promise, ended]);
}
