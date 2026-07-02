"use client";

/**
 * Live media store — the "no websocket" real-time path for avatars AND banners.
 *
 * When an EDITOR (`<ElvixAvatar mode="edit">` / `<ElvixBanner>`) uploads or
 * removes an image it PUBLISHES the new state here; the read-only siblings
 * (`<ElvixUserAvatar>` / `<ElvixAvatar mode="view">` / `<ElvixUserBanner>`)
 * SUBSCRIBE and re-render immediately — same tab via this module store, other
 * tabs on the same origin via `BroadcastChannel`. No server round-trip, no
 * socket. (Cross-device sync can ride the existing presence SSE later.)
 *
 * Key convention: `"<kind>:<userId>"` via `mediaKey()`, e.g. `"avatar:usr_123"`.
 */

import { useSyncExternalStore } from "react";

export type LiveMedia = {
  /** Rendered CDN variant sizes; empty = no CDN upload. */
  sizes: number[];
  /** Cache-buster (ms epoch). Downstream srcset keys off this. */
  updatedAt: number;
  /** Avatar-only OAuth fallback URL, or null. Banners pass null. */
  fallbackUrl: string | null;
};

export const mediaKey = (kind: "avatar" | "banner", userId: string): string =>
  `${kind}:${userId}`;

const snapshots = new Map<string, LiveMedia>();
const listeners = new Map<string, Set<() => void>>();

let channel: BroadcastChannel | null = null;
let channelTried = false;
function getChannel(): BroadcastChannel | null {
  if (channelTried) return channel;
  channelTried = true;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel("elvix-media");
  channel.onmessage = (e: MessageEvent) => {
    const data = e.data as { key?: string; state?: LiveMedia } | null;
    if (data && typeof data.key === "string" && data.state) {
      snapshots.set(data.key, data.state);
      notify(data.key);
    }
  };
  return channel;
}

function notify(key: string): void {
  const set = listeners.get(key);
  if (set) for (const cb of set) cb();
}

/** Publish new media state for `key` (e.g. `mediaKey("avatar", userId)`):
 *  updates same-tab subscribers and broadcasts to other tabs on this origin. */
export function publishMedia(key: string, state: LiveMedia): void {
  snapshots.set(key, state);
  notify(key);
  getChannel()?.postMessage({ key, state });
}

function subscribe(key: string, cb: () => void): () => void {
  getChannel(); // ensure the cross-tab listener is live
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/**
 * Subscribe to the live media for `key`. Returns the latest published state,
 * or `null` if nothing has been published this session (component then falls
 * back to its server-provided props).
 */
export function useLiveMedia(key: string | null | undefined): LiveMedia | null {
  return useSyncExternalStore(
    (cb) => (key ? subscribe(key, cb) : () => {}),
    () => (key ? (snapshots.get(key) ?? null) : null),
    () => null,
  );
}
