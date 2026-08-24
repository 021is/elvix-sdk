"use client";

/**
 * `useUserMedia` — fetch a user's CENTRALIZED avatar + banner meta by id
 * alone, no session and no host-threaded envelope. This is what powers
 * `<ElvixUserAvatar userId>` / `<ElvixUserBanner userId>` rendering a
 * THIRD-party user (a skill owner, a comment author, a teammate) that the
 * host knows only by elvix user id.
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
 * Cache: a module-level map keyed by `baseUrl|userId`, plus in-flight
 * dedup so a grid of 50 avatars for the same user fires ONE request. No
 * TTL invalidation — a session-length cache is right for avatars (the
 * `?v=<updatedAt>` on the image URL busts the picture itself when it
 * changes, and live edits ride the `live-media` channel).
 */

import { useEffect, useState } from "react";
import { subscribeMediaStream } from "./media-stream";

export type UserMedia = {
  /** CDN slug the account photos live under, or null if none resolved. */
  slug: string | null;
  avatar: { sizes: number[]; updatedAt: number | null; googleUrl: string | null };
  banner: { sizes: number[]; updatedAt: number | null };
};

const cache = new Map<string, UserMedia>();
const inflight = new Map<string, Promise<UserMedia | null>>();

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
  const key = enabled && userId ? `${baseUrl}|${userId}` : null;
  const [data, setData] = useState<UserMedia | null>(() => (key ? (cache.get(key) ?? null) : null));
  const [loading, setLoading] = useState<boolean>(() => !!key && !cache.has(key));

  useEffect(() => {
    if (!key || !userId) {
      setData(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    let p = inflight.get(key);
    if (!p) {
      p = fetchMedia(baseUrl, userId);
      inflight.set(key, p);
    }
    p.then((m) => {
      inflight.delete(key);
      if (m) cache.set(key, m);
      if (alive) {
        setData(m);
        setLoading(false);
      }
    }).catch(() => {
      inflight.delete(key);
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [key, userId, baseUrl]);

  // Live push: subscribe to the shared media stream so a centralized photo
  // change (from any app, any device) updates this render within ~3s — no
  // reload, no cache wait. The event carries the fresh avatar/banner meta; we
  // merge it over the cached entry (preserving the CDN slug from the initial
  // fetch) and re-render.
  useEffect(() => {
    if (!key || !userId) return;
    return subscribeMediaStream(userId, baseUrl, (change) => {
      const existing = cache.get(key);
      const next: UserMedia = {
        slug: existing?.slug ?? null,
        avatar: change.avatar,
        banner: change.banner,
      };
      cache.set(key, next);
      setData(next);
    });
  }, [key, userId, baseUrl]);

  return { data, loading };
}

/** Test/util: drop the cache (used by live-edit paths that need a refetch). */
export function _clearUserMediaCache(): void {
  cache.clear();
  inflight.clear();
}
