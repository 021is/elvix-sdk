"use client";

/**
 * `<ElvixLifecycleWatcher>` — mount once on any authenticated surface so a
 * banned / paused / deleted member is shown the front door within seconds,
 * not on whatever 401 they happen to hit next.
 *
 * Two transports, one component:
 *
 *   1. SSE (preferred). When `applicationId` + `userId` are provided AND
 *      we're same-origin with `baseUrl` (or `baseUrl` is unset), the
 *      watcher subscribes to `${baseUrl}/api/presence/stream` and reacts
 *      to `user.lifecycle.changed` + `lifecycle.snapshot` events live.
 *      Latency: O(network); no polling traffic at rest. This is what
 *      elvix's own /account + /console layouts use.
 *
 *   2. Polling fallback. When SSE isn't viable (cross-origin host with no
 *      same-origin presence stream; or the caller omits the SSE-required
 *      props), the watcher polls `${baseUrl}/api/v1/session` every
 *      `pollMs` (default 7s). `EventSource` can't carry the bearer token
 *      across origins, so polling is the only honest answer there.
 *
 *   <ElvixLifecycleWatcher baseUrl="https://elvix.is"
 *     onSignedOut={(reason) => router.replace("/signed-out?reason=" + reason)} />
 *
 * Without `onSignedOut` it reloads the page (the host then re-renders its
 * signed-out state). The local bearer token is cleared via `setElvixToken(null)`
 * before either callback fires.
 */

import { useEffect } from "react";
import { useResolvedBaseUrl } from "./elvix-provider";
import { authInit, setElvixToken } from "./session";

/** Membership states the watcher reacts to. "active" = back to normal. */
const StatusValue = {
  ACTIVE: "active",
  PAUSED: "paused",
  BANNED: "banned",
  DELETED: "deleted",
  INACTIVE: "inactive",
} as const;
type StatusValue = (typeof StatusValue)[keyof typeof StatusValue];

/** Shape of an SSE `user.lifecycle.changed` / `lifecycle.snapshot` payload. */
type LifecycleRecord = { userId: string; status: StatusValue };

export type ElvixLifecycleWatcherProps = {
  /** elvix origin. Defaults to "https://elvix.is" — the public elvix
   *  identity host. Override only for self-hosted elvix instances or
   *  dev mirrors; production consumers never need to pass this. */
  baseUrl?: string;
  /** Poll interval in ms when SSE isn't available. Default 7000. */
  pollMs?: number;
  /**
   * Application id to subscribe to (SSE mode). When set together with
   * `userId` AND we're same-origin with `baseUrl`, the watcher opens an
   * EventSource on `/api/presence/stream` and skips polling entirely.
   * Omit to force the polling path (the cross-origin SDK case).
   */
  applicationId?: string;
  /** User id to watch — SSE filters by this. Required with `applicationId`. */
  userId?: string;
  /** Called once with the reason when the session ends. Defaults to a reload. */
  onSignedOut?: (reason: string) => void;
};

/**
 * Best-effort same-origin probe: `""` and any string whose origin matches
 * the current `window.location.origin`. SSR-safe (returns false on the
 * server so we never accidentally start an EventSource during render).
 */
function isSameOrigin(baseUrl: string): boolean {
  if (typeof window === "undefined") return false;
  if (!baseUrl) return true;
  try {
    return new URL(baseUrl, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function ElvixLifecycleWatcher({
  baseUrl,
  pollMs = 7000,
  applicationId,
  userId,
  onSignedOut,
}: ElvixLifecycleWatcherProps): null {
  const resolvedBaseUrl = useResolvedBaseUrl(baseUrl);
  useEffect(() => {
    let cancelled = false;
    let fired = false;

    function fire(reason: string) {
      if (cancelled || fired) return;
      fired = true;
      setElvixToken(null);
      if (onSignedOut) onSignedOut(reason);
      else if (typeof window !== "undefined") window.location.reload();
    }

    // ── SSE branch ────────────────────────────────────────────────────────
    // Only viable same-origin (EventSource can't carry the bearer token to
    // a third-party origin). Identifying both `applicationId` + `userId` is
    // required so the stream knows what to scope by.
    const canSse =
      applicationId !== undefined &&
      userId !== undefined &&
      typeof window !== "undefined" &&
      typeof EventSource !== "undefined" &&
      isSameOrigin(resolvedBaseUrl);

    if (canSse) {
      const url = new URL(`${resolvedBaseUrl}/api/presence/stream`, window.location.origin);
      url.searchParams.set("applicationId", applicationId!);
      url.searchParams.set("userId", userId!);
      const ev = new EventSource(url.toString());

      function onRecord(rec: LifecycleRecord) {
        if (rec.userId !== userId) return;
        if (rec.status === StatusValue.ACTIVE) return;
        fire(rec.status);
      }
      function handle(e: MessageEvent) {
        try {
          onRecord(JSON.parse(e.data) as LifecycleRecord);
        } catch {
          // Ignore malformed payloads — the next event re-syncs.
        }
      }
      function handleSnapshot(e: MessageEvent) {
        try {
          for (const r of JSON.parse(e.data) as LifecycleRecord[]) onRecord(r);
        } catch {
          // Same as above.
        }
      }
      ev.addEventListener("user.lifecycle.changed", handle);
      ev.addEventListener("lifecycle.snapshot", handleSnapshot);

      return () => {
        cancelled = true;
        ev.removeEventListener("user.lifecycle.changed", handle);
        ev.removeEventListener("lifecycle.snapshot", handleSnapshot);
        ev.close();
      };
    }

    // ── Polling fallback ──────────────────────────────────────────────────
    // Cross-origin host OR SSE props omitted: poll `/api/v1/session` and
    // react to !ok. authInit() ferries the bearer token for cross-origin.
    const poll = async () => {
      try {
        const init = authInit();
        const res = await fetch(`${resolvedBaseUrl}/api/v1/session`, {
          method: "POST",
          headers: init.headers,
          credentials: init.credentials,
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (cancelled || fired) return;
        if (!body.ok) fire(body.error ?? "signed_out");
      } catch {
        // Network blip — keep the session; retry next tick.
      }
    };

    void poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [resolvedBaseUrl, pollMs, applicationId, userId, onSignedOut]);

  return null;
}
