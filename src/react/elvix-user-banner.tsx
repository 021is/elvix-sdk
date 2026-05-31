"use client";

import { useElvixApp, useElvixAppContext } from "./elvix-provider";
import { UserBanner } from "./user-banner";

/**
 * `<ElvixUserBanner>` — read-only display banner for the signed-in
 * user. 3:1 aspect, srcset-driven for responsive selection, with a
 * gradient empty-state when no banner has been uploaded.
 *
 *   <ElvixUserBanner />                  // hero-shaped, fills the parent width
 *   <ElvixUserBanner containerPx={800} /> // smaller layout
 *
 * Hydrates from `<ElvixProvider>` context: `appSlug` from the bootstrap
 * envelope and `userId` + `membership` from the per-app sdk-context
 * fetch. The host doesn't thread any props — the provider already
 * knows everything. Override `appSlug` / `userId` / `membership` only
 * when displaying a non-current user.
 *
 * Sister of `<ElvixBanner>` (the editor wizard). Use this for header
 * chrome on profile pages, hover cards, anywhere you want to show
 * the user's banner without offering edit affordance.
 */
export type ElvixUserBannerProps = {
  /** Override the app slug. Falls back to the provider's bootstrap. */
  appSlug?: string;
  /** Override the user id. Falls back to the provider's sdk-context. */
  userId?: string;
  /** Override the membership envelope (bannerSizes / bannerUpdatedAt). */
  membership?: { bannerUpdatedAt: Date | number; bannerSizes: number[] };
  /** Container max-width in CSS px. Drives `sizes` for srcset. */
  containerPx?: number;
  className?: string;
  /** Class for the empty placeholder background (gradient by default). */
  emptyClassName?: string;
};

export function ElvixUserBanner({
  appSlug,
  userId,
  membership,
  containerPx,
  className,
  emptyClassName,
}: ElvixUserBannerProps = {}) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();

  const resolvedAppSlug = appSlug ?? app?.urlSlug ?? "preview";
  const resolvedUserId = userId ?? appCtx?.user.id ?? "preview-user";
  const resolvedMembership: { bannerUpdatedAt: Date | number; bannerSizes: number[] } =
    membership ??
    (appCtx?.membership
      ? {
          bannerUpdatedAt: new Date(appCtx.membership.bannerUpdatedAt),
          bannerSizes: appCtx.membership.bannerSizes,
        }
      : { bannerUpdatedAt: 0, bannerSizes: [] });

  return (
    <UserBanner
      appSlug={resolvedAppSlug}
      userId={resolvedUserId}
      membership={resolvedMembership}
      containerPx={containerPx}
      className={className}
      emptyClassName={emptyClassName}
    />
  );
}
