"use client";

/**
 * Media live-push manager — the cross-app / cross-device half of "change
 * anywhere → appears everywhere". One shared `EventSource` to
 * `/api/media/stream` carries `media.changed` events for every user id the
 * SDK is currently rendering; when a user updates their centralized photo,
 * every consumer showing that id re-renders within the stream's poll window
 * (~3s) — no reload, no cache wait.
 *
 * Complements `live-media.ts` (same-origin, same-browser, instant via
 * `BroadcastChannel`). This one crosses origins + devices via the server.
 *
 * Refcounted: many `<ElvixUserAvatar userId>` for the same id share one
 * subscription; the EventSource reopens (debounced) with the union of watched
 * ids as components mount/unmount. Origin-gated + auth-free on the server
 * (public photo timestamps only), so no bearer token is needed — which is
 * why a plain cross-origin `EventSource` works.
 */

export type MediaChange = {
  avatar: { sizes: number[]; updatedAt: number | null; googleUrl: string | null };
  banner: { sizes: number[]; updatedAt: number | null };
};

type Listener = (change: MediaChange) => void;

const MAX_IDS = 100;
const refcounts = new Map<string, number>();
const listeners = new Map<string, Set<Listener>>();

let es: EventSource | null = null;
let openKey = ""; // sorted id list the current EventSource is opened with
let baseUrlUsed = "";
let reopenTimer: ReturnType<typeof setTimeout> | null = null;

function watchedIds(): string[] {
  return [...refcounts.keys()].slice(0, MAX_IDS);
}

function scheduleReopen(baseUrl: string): void {
  baseUrlUsed = baseUrl;
  if (reopenTimer) clearTimeout(reopenTimer);
  reopenTimer = setTimeout(reopen, 250);
}

function reopen(): void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  const ids = watchedIds();
  const key = [...ids].sort().join(",");
  if (key === openKey && es) return;
  es?.close();
  es = null;
  openKey = key;
  if (ids.length === 0) return;

  const url = `${baseUrlUsed}/api/media/stream?ids=${encodeURIComponent(ids.join(","))}`;
  const src = new EventSource(url);
  src.addEventListener("media.changed", (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data) as { userId: string } & MediaChange;
      const set = listeners.get(data.userId);
      if (set) for (const cb of set) cb({ avatar: data.avatar, banner: data.banner });
    } catch {
      /* ignore malformed frame */
    }
  });
  es = src;
}

/**
 * Watch `userId` for centralized media changes. Returns an unsubscribe fn.
 * The EventSource is shared across all watched ids and reopens as the set
 * changes.
 */
export function subscribeMediaStream(
  userId: string,
  baseUrl: string,
  onChange: Listener,
): () => void {
  refcounts.set(userId, (refcounts.get(userId) ?? 0) + 1);
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(onChange);
  scheduleReopen(baseUrl);

  return () => {
    const cur = listeners.get(userId);
    cur?.delete(onChange);
    const n = (refcounts.get(userId) ?? 1) - 1;
    if (n <= 0) {
      refcounts.delete(userId);
      listeners.delete(userId);
    } else {
      refcounts.set(userId, n);
    }
    scheduleReopen(baseUrl);
  };
}
