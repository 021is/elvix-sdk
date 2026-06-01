/**
 * `verifyElvixWebhook` — the server-side companion of `verifyElvixToken`.
 *
 * Customer backend receives a webhook from elvix:
 *
 *   POST /api/webhooks/elvix
 *   Elvix-Signature: t=1717000000,v1=<hex>
 *   Elvix-Event-Id:  evt_...
 *   Content-Type:    application/json
 *   <JSON body — an ElvixWebhookEvent>
 *
 * Hand the rawBody string + the `Elvix-Signature` header + the shared
 * secret to `verifyElvixWebhook`. The result is a discriminated union;
 * narrow on `result.ok` then read `result.event.type` to pick the
 * matching payload shape.
 *
 * Signature scheme (Stripe-style):
 *   - Header value: `t=<unix_ts_seconds>,v1=<hex>`
 *   - Hex = HMAC-SHA256(`${t}.${rawBody}`, secret).hex()
 *   - Replay window: default 5 minutes (override via toleranceSec)
 *   - Constant-time comparison so the function is timing-safe.
 *
 * Throws ONLY on infra failure (a malformed `rawBody` JSON after the
 * signature passes — meaning elvix sent something genuinely broken).
 * Auth failures land on `{ ok: false, error }` so the caller can
 * choose to log + 200 (silent drop) or 400 (loud reject).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ElvixWebhookEvent, ElvixWebhookVerifyResult } from "../types/webhook";

export type VerifyWebhookArgs = {
  /** The raw POST body string. Read BEFORE JSON-parsing — order matters
   *  because HMAC is over the byte stream. In Next.js: `await req.text()`. */
  rawBody: string;
  /** The full `Elvix-Signature` header value, e.g. `t=1717000000,v1=abc...`. */
  signature: string;
  /** The webhook's shared secret, revealed once at creation in the Console. */
  secret: string;
  /** Replay window in seconds. Default 300 (5 minutes). */
  toleranceSec?: number;
  /** Override the clock for testing. Seconds since the epoch. */
  nowSec?: number;
};

const DEFAULT_TOLERANCE_SEC = 300;

export function verifyElvixWebhook(args: VerifyWebhookArgs): ElvixWebhookVerifyResult {
  const { rawBody, signature, secret } = args;
  const toleranceSec = args.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);

  if (!signature) return { ok: false, error: "missing_signature" };

  // Header: t=<int>,v1=<hex>  (additional vN=... pairs allowed for
  // forward compat; any matching version is accepted).
  const parts = signature.split(",").map((s) => s.trim()).filter(Boolean);
  const ts = parts
    .map((p) => /^t=(\d+)$/.exec(p))
    .find((m) => m !== null)?.[1];
  const versions = parts
    .map((p) => /^v(\d+)=([a-f0-9]+)$/i.exec(p))
    .filter((m): m is RegExpExecArray => m !== null);
  if (!ts || versions.length === 0) {
    return {
      ok: false,
      error: "invalid_signature_format",
      message: "Header must be of the form 't=<unix>,v1=<hex>'",
    };
  }

  const tNum = Number(ts);
  if (!Number.isFinite(tNum) || Math.abs(nowSec - tNum) > toleranceSec) {
    return {
      ok: false,
      error: "stale_timestamp",
      message: `Timestamp drift exceeds ${toleranceSec}s tolerance.`,
    };
  }

  const expected = createHmac("sha256", secret).update(`${tNum}.${rawBody}`).digest("hex");
  // Constant-time compare against every supported version line — only
  // v1 today, but the loop is forward-compatible.
  const expectedBuf = Buffer.from(expected, "hex");
  const matched = versions.some((m) => {
    const candidate = m[2] ?? "";
    if (candidate.length !== expected.length) return false;
    const candidateBuf = Buffer.from(candidate, "hex");
    if (candidateBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(candidateBuf, expectedBuf);
  });
  if (!matched) return { ok: false, error: "signature_mismatch" };

  let event: ElvixWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ElvixWebhookEvent;
  } catch (err) {
    return {
      ok: false,
      error: "invalid_payload",
      message: err instanceof Error ? err.message : "JSON parse failed",
    };
  }

  return { ok: true, event };
}
