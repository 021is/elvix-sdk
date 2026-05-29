/**
 * Spine ResponseDto envelope unwrapper — moved VERBATIM from the elvix
 * monorepo (`lib/spine-fetch.ts`, the `unwrapEnvelope` half) so the
 * ported `<ElvixSignInForm>` can read API responses with the exact same
 * `{ ok, ...payload }` flat shape it uses inside elvix. Pure, no host deps.
 *
 * Server-side routes return a ResponseDto<T> envelope:
 *   { success, data, code, errorKey, errorMessage, timestamp, requestId }
 *
 * The form's fetch consumers read the legacy flat shape:
 *   { ok, ...payload, error? }
 *
 * `unwrapEnvelope` bridges the two: it flattens `envelope.data` into the
 * top-level object and re-exposes `envelope.success` as `ok` and
 * `envelope.errorKey` as `error`. Legacy responses (no `success` field)
 * pass through unchanged so the helper is safe to apply blindly.
 */

interface MaybeEnvelope {
  success?: unknown;
  data?: unknown;
  errorKey?: unknown;
  errorMessage?: unknown;
  code?: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: shim return type intentionally permissive — callers cast to their own DTO
export function unwrapEnvelope<T = any>(input: unknown): T {
  if (!input || typeof input !== "object") return input as T;
  const e = input as MaybeEnvelope;
  if (!("success" in e)) return input as T;
  const dataObject =
    e.data && typeof e.data === "object" && !Array.isArray(e.data)
      ? (e.data as Record<string, unknown>)
      : {};
  const arrayData = Array.isArray(e.data) ? { data: e.data } : {};
  return {
    ok: Boolean(e.success),
    error: e.errorKey ?? e.errorMessage ?? undefined,
    ...dataObject,
    ...arrayData,
  } as T;
}
