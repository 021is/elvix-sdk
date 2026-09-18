"use client";

import { useElvixApp, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { mediaKey, useLiveMedia } from "./live-media";
import { UserBanner } from "./user-banner";
import { useUserMedia } from "./user-media";

/**
 * `<ElvixUserBanner>` — read-only display banner. Two modes, one component:
 *
 * 1. CURRENT user (no `userId`): the signed-in user from `<ElvixProvider>`
 *    context, with their centralized banner read exactly like mode 2. The
 *    host threads nothing.
 *
 *      <ElvixUserBanner />                  // signed-in user, hero width
 *
 * 2. ANY user BY ID (`userId`): fetches that user's CENTRALIZED banner from
 *    `/public/api/users/<id>/media-meta` — NO session, NO membership
 *    envelope. Render a third party's banner knowing only their elvix id;
 *    the banner is whatever they set once in their elvix account.
 *
 *      <ElvixUserBanner userId="usr_abc" containerPx={800} />
 *
 * 3:1 aspect, srcset-driven, with a gradient empty-state when no banner is set.
 * Sister of `<ElvixBanner>` (the editor wizard).
 */
export type ElvixUserBannerProps = {
  /**
   * Render THIS user by id (any user, not just the signed-in one). Omit to
   * render the current session user from provider context.
   */
  userId?: string;
  /**
   * Override the CDN app slug. Rarely needed — the slug comes from the
   * media-meta response (the bootstrap's `urlSlug` with a host `membership`).
   */
  appSlug?: string;
  /**
   * Pre-resolved membership envelope (bannerSizes / bannerUpdatedAt). When
   * supplied, NO by-id fetch happens — the host already holds the meta.
   */
  membership?: { bannerUpdatedAt: Date | number; bannerSizes: number[] };
  /** Container max-width in CSS px. Drives `sizes` for srcset. */
  containerPx?: number;
  /** Corner radius in px. Defaults to 14 to match `<ElvixBanner>`. */
  cornerRadius?: number;
  className?: string;
  /** Class for the empty placeholder background (gradient by default). */
  emptyClassName?: string;
  /**
   * Host-supplied placeholder IMAGE for the no-banner state, shown instead of
   * the default gradient. A URL on your own origin or a `data:` URI. Ignored
   * once the user sets a real banner.
   */
  fallbackSrc?: string;
};

export function ElvixUserBanner({
  userId,
  appSlug,
  membership,
  containerPx,
  cornerRadius,
  className,
  emptyClassName,
  fallbackSrc,
}: ElvixUserBannerProps = {}) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  const ctx = useElvixContext();

  // Centralized for the signed-in user and by-id alike (see ElvixUserAvatar);
  // only a host-passed `membership` skips the fetch.
  const targetId = userId ?? appCtx?.user.id ?? null;
  const central = Boolean(targetId) && !membership;
  const media = useUserMedia(central ? targetId : null, ctx.baseUrl, central);

  const resolvedUserId = targetId ?? "preview-user";
  const resolvedAppSlug = membership
    ? (appSlug ?? app?.urlSlug ?? "preview")
    : (appSlug ?? media.data?.slug ?? "elvix-account");
  const resolvedMembership = membership ?? {
    bannerUpdatedAt: media.data?.banner.updatedAt ?? 0,
    bannerSizes: media.data?.banner.sizes ?? [],
  };

  // Live updates for the host-passed `membership` path; the centralized path
  // receives <ElvixBanner> changes through the `useUserMedia` cache.
  const live = useLiveMedia(membership ? mediaKey("banner", resolvedUserId) : null);
  const finalMembership = live
    ? { bannerUpdatedAt: live.updatedAt, bannerSizes: live.sizes }
    : resolvedMembership;

  return (
    <UserBanner
      appSlug={resolvedAppSlug}
      userId={resolvedUserId}
      membership={finalMembership}
      containerPx={containerPx}
      cornerRadius={cornerRadius}
      className={className}
      emptyClassName={emptyClassName}
      fallbackSrc={fallbackSrc}
    />
  );
}
