"use client";

/**
 * `<ElvixPresence>` — drops a periodic heartbeat to elvix while mounted, so the
 * user shows as **online** on the app's users list in the elvix Console.
 *
 * Unlike elvix's first-party presence ticker (same-origin, cookie auth), this
 * is the CROSS-ORIGIN-capable version: it beats `${baseUrl}/api/presence/
 * heartbeat` with the bearer token (via `authInit`) and the `applicationId`
 * from the bootstrap envelope, so it works from any customer origin.
 *
 * MOUNT IN A LAYOUT, NOT A LEAF PAGE. The heartbeat lives in a `useEffect`
 * interval; mounting it in a layout (which survives child-route navigation)
 * keeps the beat alive as the user moves around. In a leaf page it would
 * unmount on every navigation and the row would flap to offline.
 *
 *   // app/(authed)/layout.tsx
 *   <ElvixProvider clientId={CLIENT_ID}>
 *     <ElvixPresence />
 *     {children}
 *   </ElvixProvider>
 *
 * Renders nothing. Pauses while the tab is hidden, and reports "idle" after
 * 60s without input so the Console can distinguish active from idle.
 */

import { useEffect } from "react";
import { useElvixApp, useElvixContext } from "./elvix-provider";
import { authInit } from "./session";

const PresenceStatus = {
  ONLINE: "online",
  IDLE: "idle",
} as const;
type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

// Mirrors elvix's server constants: TTL is 60s, so beat at half that to stay
// comfortably inside the online window even if one beat is dropped.
const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_AFTER_MS = 60_000;

/**
 * @param applicationId Optional override. Defaults to the `applicationId` on
 *   the bootstrap envelope resolved by `<ElvixProvider clientId>`. When neither
 *   is available (no clientId, or envelope not yet loaded) the component is
 *   inert — it never beats with a missing id.
 */
export function ElvixPresence({ applicationId }: { applicationId?: string } = {}) {
  const { baseUrl } = useElvixContext();
  const app = useElvixApp();
  const appId = applicationId ?? app?.applicationId ?? null;

  useEffect(() => {
    if (!appId) return;
    if (typeof window === "undefined") return;

    let lastInputAt = Date.now();
    let cancelled = false;

    const onAnyInput = () => {
      lastInputAt = Date.now();
    };
    window.addEventListener("mousemove", onAnyInput, { passive: true });
    window.addEventListener("keydown", onAnyInput, { passive: true });
    window.addEventListener("focus", onAnyInput);

    const beat = async () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      const status: PresenceStatus =
        Date.now() - lastInputAt > IDLE_AFTER_MS ? PresenceStatus.IDLE : PresenceStatus.ONLINE;
      const init = authInit();
      try {
        await fetch(`${baseUrl}/api/presence/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...init.headers },
          credentials: init.credentials,
          body: JSON.stringify({ applicationId: appId, status }),
        });
      } catch {
        // Network blips don't matter — the next tick catches up.
      }
    };

    // Beat immediately so the dot lights up without waiting a full cycle.
    void beat();
    const id = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("mousemove", onAnyInput);
      window.removeEventListener("keydown", onAnyInput);
      window.removeEventListener("focus", onAnyInput);
    };
  }, [appId, baseUrl]);

  return null;
}
