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

import { useCallback, useSyncExternalStore } from "react";

export type LiveMedia = {
  /** Rendered CDN variant sizes; empty = no CDN upload. */
  sizes: number[];
  /** Cache-buster (ms epoch). Downstream srcset keys off this. */
  updatedAt: number;
  /** Avatar-only OAuth fallback URL, or null. Banners pass null. */
  fallbackUrl: string | null;
};

export type MediaKind = "avatar" | "banner";
type Published = { kind: MediaKind; userId: string; state: LiveMedia };

export const mediaKey = (kind: MediaKind, userId: string): string => `${kind}:${userId}`;

const snapshots = new Map<string, LiveMedia>();
const listeners = new Map<string, Set<() => void>>();
/** Stores that mirror every publish — the `useUserMedia` cache registers here,
 *  so a component mounted AFTER a change reads it too. */
const sinks = new Set<(p: Published) => void>();
const noop = () => {};

let channel: BroadcastChannel | null = null;
let channelTried = false;

/** Open the cross-tab channel (idempotent; a no-op on the server). Every
 *  reader calls it, so another tab's publish reaches this one instantly. */
export function ensureLiveChannel(): void {
  if (channelTried) return;
  channelTried = true;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("elvix-media");
  channel.onmessage = (e: MessageEvent<Published | null>) => {
    if (e.data?.kind && e.data.userId && e.data.state) apply(e.data);
  };
}

/** Mirror every publish (this tab's and other tabs') into another store. */
export function onMediaPublished(sink: (p: Published) => void): void {
  sinks.add(sink);
}

function apply(p: Published): void {
  const key = mediaKey(p.kind, p.userId);
  snapshots.set(key, p.state);
  for (const sink of sinks) sink(p);
  const set = listeners.get(key);
  if (set) for (const cb of set) cb();
}

/** Publish a user's new avatar/banner state: updates this tab's readers,
 *  mounted now or later, and broadcasts to other tabs on this origin. */
export function publishMedia(kind: MediaKind, userId: string, state: LiveMedia): void {
  const p = { kind, userId, state };
  apply(p);
  ensureLiveChannel();
  channel?.postMessage(p);
}

function subscribe(key: string, cb: () => void): () => void {
  ensureLiveChannel();
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * Subscribe to the live media for `key`. Returns the latest published state,
 * or `null` if nothing has been published this session (component then falls
 * back to its server-provided props).
 */
export function useLiveMedia(key: string | null | undefined): LiveMedia | null {
  const sub = useCallback((cb: () => void) => (key ? subscribe(key, cb) : noop), [key]);
  return useSyncExternalStore(
    sub,
    () => (key ? (snapshots.get(key) ?? null) : null),
    () => null,
  );
}
