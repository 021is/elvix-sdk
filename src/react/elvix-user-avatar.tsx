"use client";

import { useElvixApp, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { mediaKey, useLiveMedia } from "./live-media";
import { UserAvatar } from "./user-avatar";
import { useUserMedia } from "./user-media";

const Shape = {
  CIRCLE: "circle",
  SQUARE: "square",
} as const;
type Shape = (typeof Shape)[keyof typeof Shape];

/**
 * `<ElvixUserAvatar>` — read-only display avatar. Two modes, one component:
 *
 * 1. CURRENT user (no `userId`): the signed-in user from `<ElvixProvider>`
 *    context, with their centralized photo read exactly like mode 2. The
 *    host threads nothing.
 *
 *      <ElvixUserAvatar />                 // signed-in user, 40px circle
 *
 * 2. ANY user BY ID (`userId` + `name`): fetches that user's CENTRALIZED
 *    avatar from `/public/api/users/<id>/media-meta` — NO session, NO
 *    membership envelope. This is how you render a THIRD party (a skill
 *    owner, a comment author, a teammate) knowing only their elvix id. The
 *    photo is whatever they set once in their elvix account; it appears
 *    everywhere. `name` drives the initials fallback (the endpoint never
 *    exposes identity text — the host supplies the name it already holds).
 *
 *      <ElvixUserAvatar userId="usr_abc" name="Ada Lovelace" size={32} />
 *
 * Fallback chain (both modes): custom CDN upload → OAuth photo → initials.
 * Sister of `<ElvixAvatar>` (the editor). Default size 40px (nav-chip).
 */
export type ElvixUserAvatarProps = {
  /**
   * Render THIS user by id (any user, not just the signed-in one). Omit to
   * render the current session user from provider context.
   */
  userId?: string;
  /** Display name — drives the initials fallback + `aria-label`. */
  name?: string;
  /** Pixel display size (1× CSS px). srcset handles retina automatically. */
  size?: number;
  className?: string;
  /** Round vs square. Default circle. */
  shape?: Shape;
  /**
   * Override the CDN app slug. Rarely needed — the slug comes from the
   * media-meta response (the bootstrap's `urlSlug` with a host `membership`).
   */
  appSlug?: string;
  /**
   * Pre-resolved membership envelope (avatarSizes / avatarUpdatedAt). When
   * supplied, NO by-id fetch happens — the host already holds the meta.
   */
  membership?: { avatarUpdatedAt: Date | number; avatarSizes: number[] };
  /** Override the user envelope (name / email / avatarUrl). */
  user?: { name?: string | null; email?: string | null; avatarUrl?: string | null };
  /**
   * Host-supplied placeholder IMAGE for the no-photo state, shown instead of
   * the default initials chip. A URL on your own origin or a `data:` URI.
   * Ignored once a custom or OAuth photo resolves.
   */
  fallbackSrc?: string;
};

export function ElvixUserAvatar({
  userId,
  name,
  size = 40,
  className,
  shape = "circle",
  appSlug,
  membership,
  user,
  fallbackSrc,
}: ElvixUserAvatarProps = {}) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  const ctx = useElvixContext();

  // The photo is CENTRALIZED on the elvix account (0.10+), so both the
  // by-id and the signed-in user read it the same way: from media-meta.
  // Only a host-passed `membership` skips the fetch. Before 0.12 the
  // signed-in path read the per-app `membership.avatarSizes`, which has been
  // empty since the photo moved, and painted initials for everyone.
  const targetId = userId ?? appCtx?.user.id ?? null;
  const central = Boolean(targetId) && !membership;
  const media = useUserMedia(central ? targetId : null, ctx.baseUrl, central);

  const resolvedUserId = targetId ?? "preview-user";
  const self = userId ? null : (appCtx?.user ?? null);

  // While media-meta loads, sizes are empty so we paint initials (no
  // broken-image flash), then swap in the photo when it resolves.
  const resolvedAppSlug = membership
    ? (appSlug ?? app?.urlSlug ?? "preview")
    : (appSlug ?? media.data?.slug ?? "elvix-account");
  const resolvedMembership = membership ?? {
    avatarUpdatedAt: media.data?.avatar.updatedAt ?? 0,
    avatarSizes: media.data?.avatar.sizes ?? [],
  };
  const fallbackUrl = media.data?.avatar.googleUrl ?? (self ? self.avatarUrl : null);
  let resolvedUser = user ?? {
    name: self ? self.name : (name ?? null),
    email: self ? self.email : null,
    avatarUrl: fallbackUrl,
  };

  // A `name` prop always wins for initials/aria, in either mode.
  if (name) resolvedUser = { ...resolvedUser, name };

  // Live updates for the host-passed `membership` path, which has no cache
  // entry to receive them: an <ElvixAvatar mode="edit"> change this session
  // (same tab or another tab on this origin) shows immediately. The
  // centralized path gets the same change through the `useUserMedia` cache.
  const live = useLiveMedia(membership ? mediaKey("avatar", resolvedUserId) : null);
  const finalMembership = live
    ? { avatarUpdatedAt: live.updatedAt, avatarSizes: live.sizes }
    : resolvedMembership;
  const finalUser = live ? { ...resolvedUser, avatarUrl: live.fallbackUrl } : resolvedUser;

  return (
    <UserAvatar
      appSlug={resolvedAppSlug}
      userId={resolvedUserId}
      membership={finalMembership}
      user={finalUser}
      size={size}
      className={className ?? ""}
      shape={shape}
      fallbackSrc={fallbackSrc}
    />
  );
}
