"use client";

/**
 * `useUserMedia` — fetch a user's CENTRALIZED avatar + banner meta by id
 * alone, no session and no host-threaded envelope. This is what powers
 * `<ElvixUserAvatar>` / `<ElvixUserBanner>` and the editors, for the signed-in
 * user and for any THIRD party (a skill owner, a comment author, a teammate)
 * the host knows only by elvix user id. Hosts read it through
 * `useElvixUserMedia`.
 *
 * Reads `GET {baseUrl}/public/api/users/<userId>/media-meta` — origin-gated
 * (the caller's app must be a registered elvix Application, or elvix itself)
 * and rate-limited. Response shape:
 *
 *   { ok, slug, avatar: { sizes, updatedAt, googleUrl }, banner: { sizes, updatedAt } }
 *
 * `slug` is the CDN path segment the account blobs live under (currently
 * `elvix-account`); the render components rebuild the variant URL from it.
 *
 * Cache: a module-level store keyed by `baseUrl|userId`, read through
 * `useSyncExternalStore`, with in-flight dedup so a grid of 50 avatars for the
 * same user fires ONE request. Three things write it: the fetch, the server
 * media stream (another app or device changed the photo), and `publishMedia`
 * (an editor in this browser just uploaded). The last one is
 * why a remount after an upload shows the NEW photo: before 0.12 the editor
 * only told the live store, so this cache kept serving the old meta to every
 * component mounted afterwards.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ElvixSessionStatus, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { ensureLiveChannel, onMediaPublished } from "./live-media";
import { subscribeMediaStream } from "./media-stream";

export type UserMedia = {
  /** CDN slug the account photos live under, or null if none resolved. */
  slug: string | null;
  avatar: { sizes: number[]; updatedAt: number | null; googleUrl: string | null };
  banner: { sizes: number[]; updatedAt: number | null };
};

const cache = new Map<string, UserMedia>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

const cacheKey = (baseUrl: string, userId: string) => `${baseUrl}|${userId}`;
const noop = () => {};

function write(key: string, media: UserMedia): void {
  cache.set(key, media);
  const set = listeners.get(key);
  if (set) for (const cb of set) cb();
}

function listen(key: string, cb: () => void): () => void {
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

// A change this browser made (an upload or removal in an editor, this tab or
// another) patches every cached entry for that user, under any `baseUrl`, and
// wakes their readers. Entries not cached yet are left alone: their first
// fetch returns the new state from the server anyway.
onMediaPublished(({ kind, userId, state }) => {
  const next =
    kind === "avatar"
      ? { avatar: { sizes: state.sizes, updatedAt: state.updatedAt, googleUrl: state.fallbackUrl } }
      : { banner: { sizes: state.sizes, updatedAt: state.updatedAt } };
  const suffix = `|${userId}`;
  for (const [key, media] of cache) {
    if (key.endsWith(suffix)) write(key, { ...media, ...next });
  }
});

async function fetchMedia(baseUrl: string, userId: string): Promise<UserMedia | null> {
  try {
    const res = await fetch(
      `${baseUrl}/public/api/users/${encodeURIComponent(userId)}/media-meta`,
      // Public read: no cookies needed, and omitting them keeps the request
      // "simple" cross-origin (no credentialed-CORS echo requirement).
      { credentials: "omit" },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      ok?: boolean;
      slug?: string | null;
      avatar?: UserMedia["avatar"];
      banner?: UserMedia["banner"];
    } | null;
    if (!j?.ok || !j.avatar || !j.banner) return null;
    return { slug: j.slug ?? null, avatar: j.avatar, banner: j.banner };
  } catch {
    return null;
  }
}

/** One request per key at a time; the result lands in the store. A miss is
 *  not cached, so the next mount retries. Never rejects. */
function load(key: string, baseUrl: string, userId: string): Promise<unknown> {
  let p = inflight.get(key);
  if (!p) {
    p = fetchMedia(baseUrl, userId).then((m) => {
      inflight.delete(key);
      // A patch that landed while this was in flight is newer than it.
      if (m && !cache.has(key)) write(key, m);
    });
    inflight.set(key, p);
  }
  return p;
}

/**
 * Fetch (and cache) a user's centralized media meta.
 *
 * @param userId  the elvix user id, or null/undefined to disable the fetch
 * @param baseUrl elvix API origin (from `useElvixContext().baseUrl`)
 * @param enabled gate the fetch off entirely (e.g. host already passed meta)
 */
export function useUserMedia(
  userId: string | null | undefined,
  baseUrl: string,
  enabled = true,
): { data: UserMedia | null; loading: boolean } {
  const key = enabled && userId ? cacheKey(baseUrl, userId) : null;
  const subscribe = useCallback((cb: () => void) => (key ? listen(key, cb) : noop), [key]);
  const data = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) ?? null) : null),
    () => null,
  );
  // The key whose lookup has finished, so a miss reads as "no photo", not
  // "still loading".
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !userId || cache.has(key)) return;
    let alive = true;
    void load(key, baseUrl, userId).then(() => {
      if (alive) setSettled(key);
    });
    return () => {
      alive = false;
    };
  }, [key, userId, baseUrl]);

  // Live push: the shared media stream carries a centralized photo change
  // from any app or device within ~3s. Merge it over the cached entry
  // (keeping the CDN slug from the fetch); every reader of the key re-renders.
  useEffect(() => {
    if (!key || !userId) return;
    return subscribeMediaStream(userId, baseUrl, (change) => {
      write(key, { slug: cache.get(key)?.slug ?? null, ...change });
    });
  }, [key, userId, baseUrl]);

  return { data, loading: key !== null && data === null && settled !== key };
}

/** What `useElvixUserMedia` returns. */
export type ElvixUserMedia = {
  /** True until the lookup has settled — until then `hasPhoto` is `false`. */
  loading: boolean;
  /** An uploaded photo OR an OAuth (Google) photo exists. */
  hasPhoto: boolean;
  avatar: {
    /** Rendered CDN variant widths; empty when nothing was uploaded. */
    sizes: number[];
    /** Cache-buster (ms epoch), or null before any upload. */
    updatedAt: number | null;
    /** The OAuth photo URL the avatar falls back to, or null. */
    fallbackUrl: string | null;
  };
  banner: { sizes: number[]; updatedAt: number | null };
  /** CDN slug the images live under, or null while unknown. */
  slug: string | null;
};

/**
 * `useElvixUserMedia(userId?)` — a user's centralized photo and banner meta.
 *
 * Omit `userId` for the signed-in user. The same cached lookup the avatar
 * components use, so asking costs nothing extra, and it updates the moment an
 * editor anywhere in the page uploads or removes a photo. Use it to decide UI
 * around a photo (enlargeable or not, "add a photo" prompts) instead of
 * fetching `/public/api/users/<id>/media-meta` yourself.
 *
 *   const { hasPhoto, loading } = useElvixUserMedia();
 */
export function useElvixUserMedia(userId?: string): ElvixUserMedia {
  const ctx = useElvixContext();
  const appCtx = useElvixAppContext();
  const target = userId ?? appCtx?.user.id ?? null;
  const { data, loading } = useUserMedia(target, ctx.baseUrl);
  // No target yet means the session is still resolving: still loading.
  const pending = target === null ? ctx.sessionStatus === ElvixSessionStatus.LOADING : loading;
  return useMemo(() => {
    const fallbackUrl = data?.avatar.googleUrl ?? null;
    const sizes = data?.avatar.sizes ?? [];
    return {
      loading: pending,
      hasPhoto: sizes.length > 0 || fallbackUrl !== null,
      avatar: { sizes, updatedAt: data?.avatar.updatedAt ?? null, fallbackUrl },
      banner: { sizes: data?.banner.sizes ?? [], updatedAt: data?.banner.updatedAt ?? null },
      slug: data?.slug ?? null,
    };
  }, [data, pending]);
}

/** Test/util: drop the cache (used by live-edit paths that need a refetch). */
export function _clearUserMediaCache(): void {
  cache.clear();
  inflight.clear();
}
