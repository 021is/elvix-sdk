"use client";

/**
 * `<ElvixLifecycleWatcher>` — mount once on any authenticated surface. Polls
 * the verify endpoint every ~7s; the moment elvix reports the session is gone
 * (ban / pause / delete / expiry / sign-out elsewhere) it clears the local
 * token and signs the user out, so a banned user is gone within a few seconds
 * just like elvix's first-party surfaces.
 *
 *   <ElvixLifecycleWatcher baseUrl="https://elvix.is"
 *     onSignedOut={(reason) => router.replace("/signed-out?reason=" + reason)} />
 *
 * Without `onSignedOut` it reloads the page (the host then re-renders its
 * signed-out state). Polls because EventSource can't carry the bearer token.
 */

import { authInit, setElvixToken } from "./session";
import { useEffect } from "react";

export function ElvixLifecycleWatcher({
  baseUrl = "",
  pollMs = 7000,
  onSignedOut,
}: {
  /** elvix origin. Defaults to "" (same-origin). */
  baseUrl?: string;
  /** Poll interval in ms. Default 7000. */
  pollMs?: number;
  /** Called once with the reason when the session ends. Defaults to a reload. */
  onSignedOut?: (reason: string) => void;
}): null {
  useEffect(() => {
    let cancelled = false;
    let fired = false;

    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/v1/session`, { method: "POST", ...authInit() });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (cancelled || fired) return;
        if (!body.ok) {
          fired = true;
          setElvixToken(null);
          const reason = body.error ?? "signed_out";
          if (onSignedOut) onSignedOut(reason);
          else if (typeof window !== "undefined") window.location.reload();
        }
      } catch {
        // network blip — keep the session; retry next tick.
      }
    };

    void poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [baseUrl, pollMs, onSignedOut]);

  return null;
}
