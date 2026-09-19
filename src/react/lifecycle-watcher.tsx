"use client";

/**
 * `<ElvixLifecycleWatcher>` — mount once on any authenticated surface so a
 * banned / paused / deleted member is shown the front door as it happens,
 * not on whatever 401 they hit next.
 *
 *   <ElvixLifecycleWatcher
 *     onSignedOut={(reason) => router.replace("/signed-out?reason=" + reason)} />
 *
 * Two signals:
 *
 *   1. Membership status, pushed. Over the shared live stream
 *      (`live-stream.ts`), same-origin and cross-origin alike: a status other
 *      than "active" signs the user out at once. Needs the app and user,
 *      which come from `<ElvixProvider>` (or the props).
 *
 *   2. The session itself, checked. A session revoked elsewhere ("sign out
 *      of other devices") is not a membership change, so `/api/v1/session`
 *      is asked every `pollMs` (default 60s) while the tab is visible, and
 *      whenever it becomes visible again. It used to be every 7s, always.
 *
 * Only a session seen alive at least once is ever evicted, so mounting the
 * watcher on a signed-out page cannot reload it in a loop (scar 2026-06-15).
 *
 * Without `onSignedOut` it reloads the page. The stored bearer token is
 * cleared before either happens.
 */

import { useEffect } from "react";
import { useElvixApp, useElvixAppContext, useResolvedBaseUrl } from "./elvix-provider";
import { LIVE_OPEN, subscribeLive } from "./live-stream";
import { send } from "./profile-request";
import { authInit, setElvixToken } from "./session";
import { useStableCallback } from "./use-stable-callback";

/** Membership states the watcher reacts to. "active" = back to normal. */
const StatusValue = {
  ACTIVE: "active",
  PAUSED: "paused",
  BANNED: "banned",
  DELETED: "deleted",
  INACTIVE: "inactive",
} as const;
type StatusValue = (typeof StatusValue)[keyof typeof StatusValue];

/** A `user.lifecycle.changed` / `lifecycle.snapshot` record. */
type LifecycleRecord = { userId: string; status: StatusValue };

const SESSION_CHECK_MS = 60_000;

export type ElvixLifecycleWatcherProps = {
  /** elvix origin. Defaults to the provider's, else "https://elvix.is". */
  baseUrl?: string;
  /** How often the session is re-checked while the tab is visible. Default 60000. */
  pollMs?: number;
  /** The app to watch. Defaults to the provider's (`useElvixApp().applicationId`). */
  applicationId?: string;
  /** The user to watch. Defaults to the signed-in user. */
  userId?: string;
  /** Called once with the reason when the session ends. Defaults to a reload. */
  onSignedOut?: (reason: string) => void;
  /**
   * Cookie to clear when the session ends (banned / paused / deleted / signed
   * out), so a host cookie set in the sign-in `onResult` cannot outlive it.
   */
  cookieName?: string;
};

export function ElvixLifecycleWatcher({
  baseUrl,
  pollMs = SESSION_CHECK_MS,
  applicationId,
  userId,
  onSignedOut,
  cookieName,
}: ElvixLifecycleWatcherProps): null {
  const resolvedBaseUrl = useResolvedBaseUrl(baseUrl);
  const providerApp = useElvixApp()?.applicationId;
  const providerUser = useElvixAppContext()?.user.id;
  const appId = applicationId ?? providerApp;
  const watchedUser = userId ?? providerUser;
  const signedOut = useStableCallback(onSignedOut);
  const hostHandles = Boolean(onSignedOut);

  useEffect(() => {
    let fired = false;
    let alive = false;
    const fire = (reason: string) => {
      if (fired) return;
      fired = true;
      if (cookieName) document.cookie = `${cookieName}=; max-age=0; path=/; samesite=lax`;
      setElvixToken(null);
      if (hostHandles) signedOut(reason);
      else window.location.reload();
    };
    const onRecord = (r: LifecycleRecord) => {
      if (r.userId === watchedUser && r.status !== StatusValue.ACTIVE) fire(r.status);
    };

    const stopLive =
      appId && watchedUser
        ? subscribeLive(
            { baseUrl: resolvedBaseUrl, applicationId: appId, userId: watchedUser },
            (event) => {
              // The stream only opens for a live session.
              if (event.type === LIVE_OPEN) alive = true;
              else if (event.type === "user.lifecycle.changed") {
                onRecord(event.data as LifecycleRecord);
              } else if (event.type === "lifecycle.snapshot") {
                for (const r of event.data as LifecycleRecord[]) onRecord(r);
              }
            },
          )
        : () => {};

    const checkSession = async () => {
      if (fired || document.visibilityState === "hidden") return;
      const init = authInit();
      const res = await send(`${resolvedBaseUrl}/api/v1/session`, {
        method: "POST",
        headers: init.headers,
        credentials: init.credentials,
      });
      // A network blip keeps the session; the next check retries.
      if (!res) return;
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (body.ok) alive = true;
      else if (alive) fire(body.error ?? "signed_out");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    void checkSession();
    const timer = setInterval(checkSession, pollMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      fired = true;
      stopLive();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [resolvedBaseUrl, pollMs, appId, watchedUser, cookieName, hostHandles, signedOut]);

  return null;
}
