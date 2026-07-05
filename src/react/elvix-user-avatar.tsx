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
 * 1. CURRENT user (no `userId`): hydrates from `<ElvixProvider>` context —
 *    `appSlug` from the bootstrap envelope, `user` + `membership` from the
 *    per-app `sdk-context` fetch. The host threads nothing.
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
   * Override the CDN app slug. Rarely needed — by-id mode reads the slug
   * from the media-meta response; current-user mode from the bootstrap.
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

  // By-id (third-party) mode: an explicit userId the host does NOT already
  // hold meta for. Fetch the centralized avatar standalone.
  const byId = Boolean(userId) && !membership;
  const media = useUserMedia(byId ? userId : null, ctx.baseUrl, byId);

  const resolvedUserId = userId ?? appCtx?.user.id ?? "preview-user";

  let resolvedAppSlug: string;
  let resolvedMembership: { avatarUpdatedAt: Date | number; avatarSizes: number[] };
  let resolvedUser: { name?: string | null; email?: string | null; avatarUrl?: string | null };

  if (byId) {
    // Centralized read: slug + sizes + updatedAt + OAuth fallback all come
    // from the media-meta response. While it loads, sizes are empty so we
    // paint initials from `name` (no broken-image flash), then swap in the
    // photo when the fetch resolves.
    resolvedAppSlug = appSlug ?? media.data?.slug ?? "elvix-account";
    resolvedMembership = {
      avatarUpdatedAt: media.data?.avatar.updatedAt ?? 0,
      avatarSizes: media.data?.avatar.sizes ?? [],
    };
    resolvedUser = user ?? {
      name: name ?? null,
      email: null,
      avatarUrl: media.data?.avatar.googleUrl ?? null,
    };
  } else {
    resolvedAppSlug = appSlug ?? app?.urlSlug ?? "preview";
    // appCtx.membership.avatarUpdatedAt is an ISO string off the wire;
    // UserAvatar wants Date | number. Parse here so the pipeline stays
    // cache-bust-friendly.
    resolvedMembership =
      membership ??
      (appCtx?.membership
        ? {
            avatarUpdatedAt: new Date(appCtx.membership.avatarUpdatedAt),
            avatarSizes: appCtx.membership.avatarSizes,
          }
        : { avatarUpdatedAt: 0, avatarSizes: [] });
    resolvedUser = user ??
      (appCtx?.user
        ? { name: appCtx.user.name, email: appCtx.user.email, avatarUrl: appCtx.user.avatarUrl }
        : { name: null, email: null, avatarUrl: null });
  }

  // A `name` prop always wins for initials/aria, in either mode.
  if (name) resolvedUser = { ...resolvedUser, name };

  // Live updates: if <ElvixAvatar mode="edit"> changed this user's photo this
  // session (same tab or another tab on this origin), reflect it immediately
  // without a refetch — overrides the server/fetch-provided membership.
  const live = useLiveMedia(resolvedUserId ? mediaKey("avatar", resolvedUserId) : null);
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
