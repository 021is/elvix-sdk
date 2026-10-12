import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyElvixWebhook } from "../src/server/webhook";

/**
 * `verifyElvixWebhook` is the one place a customer backend decides whether a
 * POST really came from elvix. Pinned here: the signature is checked in
 * constant time over the exact timestamp and body, a timestamp outside the
 * window is refused in BOTH directions (a replay, and a forged future date),
 * and a bad header never throws.
 */
const SECRET = "whsec_test";
const NOW = 1_800_000_000;
const BODY = JSON.stringify({ id: "evt_1", type: "user.signed_in", data: {} });

const sign = (body: string, ts: string | number, secret = SECRET) =>
  createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

const verify = (over: Partial<Parameters<typeof verifyElvixWebhook>[0]> = {}) =>
  verifyElvixWebhook({
    rawBody: BODY,
    signature: `t=${NOW},v1=${sign(BODY, NOW)}`,
    secret: SECRET,
    nowSec: NOW,
    ...over,
  });

describe("verifyElvixWebhook", () => {
  it("accepts a correctly signed, fresh event and returns it", () => {
    const r = verify();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event).toMatchObject({ id: "evt_1", type: "user.signed_in" });
  });

  it("rejects a tampered body", () => {
    expect(verify({ rawBody: `${BODY} ` })).toMatchObject({
      ok: false,
      error: "signature_mismatch",
    });
  });

  it("rejects the wrong secret", () => {
    expect(verify({ secret: "whsec_other" })).toMatchObject({
      ok: false,
      error: "signature_mismatch",
    });
  });

  it("rejects a signature computed over a different timestamp", () => {
    expect(verify({ signature: `t=${NOW + 1},v1=${sign(BODY, NOW)}` })).toMatchObject({
      ok: false,
      error: "signature_mismatch",
    });
  });

  describe("timestamp tolerance", () => {
    it("refuses a replay older than the window", () => {
      const old = NOW - 301;
      expect(verify({ signature: `t=${old},v1=${sign(BODY, old)}` })).toMatchObject({
        ok: false,
        error: "stale_timestamp",
      });
    });

    it("refuses a timestamp from the future by the same margin", () => {
      const future = NOW + 301;
      expect(verify({ signature: `t=${future},v1=${sign(BODY, future)}` })).toMatchObject({
        ok: false,
        error: "stale_timestamp",
      });
    });

    it("accepts the edge of the window", () => {
      const edge = NOW - 300;
      expect(verify({ signature: `t=${edge},v1=${sign(BODY, edge)}` }).ok).toBe(true);
    });

    it("honours a custom tolerance", () => {
      const old = NOW - 20;
      const signature = `t=${old},v1=${sign(BODY, old)}`;
      expect(verify({ signature, toleranceSec: 10 })).toMatchObject({ error: "stale_timestamp" });
      expect(verify({ signature, toleranceSec: 30 }).ok).toBe(true);
    });

    it("checks the signature over the timestamp exactly as sent (leading zeros)", () => {
      const ts = `0${NOW}`;
      expect(verify({ signature: `t=${ts},v1=${sign(BODY, ts)}` }).ok).toBe(true);
    });
  });

  describe("malformed headers never throw", () => {
    it.each([
      ["", "missing_signature"],
      ["garbage", "invalid_signature_format"],
      [`t=${NOW}`, "invalid_signature_format"],
      [`v1=${"a".repeat(64)}`, "invalid_signature_format"],
      [`t=abc,v1=${"a".repeat(64)}`, "invalid_signature_format"],
      [`t=${NOW},v1=nothex`, "invalid_signature_format"],
    ])("%j -> %s", (signature, error) => {
      expect(verify({ signature })).toMatchObject({ ok: false, error });
    });

    it("a truncated or over-long signature is a mismatch, not a crash", () => {
      const good = sign(BODY, NOW);
      expect(verify({ signature: `t=${NOW},v1=${good.slice(0, 10)}` })).toMatchObject({
        error: "signature_mismatch",
      });
      expect(verify({ signature: `t=${NOW},v1=${good}00` })).toMatchObject({
        error: "signature_mismatch",
      });
    });
  });

  it("accepts any matching version line (rotation), tolerating whitespace and case", () => {
    const signature = `t=${NOW}, v2=${"b".repeat(64)}, v1=${sign(BODY, NOW).toUpperCase()}`;
    expect(verify({ signature }).ok).toBe(true);
  });

  it("a validly signed but unparseable payload is invalid_payload, not a throw", () => {
    const body = "{not json";
    expect(verify({ rawBody: body, signature: `t=${NOW},v1=${sign(body, NOW)}` })).toMatchObject({
      ok: false,
      error: "invalid_payload",
    });
  });
});
