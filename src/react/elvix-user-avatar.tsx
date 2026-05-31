"use client";

import { useElvixApp, useElvixAppContext } from "./elvix-provider";
import { UserAvatar } from "./user-avatar";

const Shape = {
  CIRCLE: "circle",
  SQUARE: "square",
} as const;
type Shape = (typeof Shape)[keyof typeof Shape];

/**
 * `<ElvixUserAvatar>` — read-only display avatar for the signed-in
 * user. Renders the same custom → Google → initials fallback chain
 * as `<ElvixAvatar>` but without any edit affordance. Use this in
 * navbars, account menus, comment lists — anywhere you just want to
 * show who the user is.
 *
 *   <ElvixUserAvatar />                      // default 40px circle
 *   <ElvixUserAvatar size={32} />            // smaller chip
 *   <ElvixUserAvatar size={56} shape="square" />
 *
 * Hydrates from `<ElvixProvider>` context: `appSlug` from the
 * bootstrap envelope and `user` + `membership` from the per-app
 * `sdk-context` fetch. The host doesn't thread any props — the
 * provider already knows everything needed. Override `appSlug` /
 * `userId` / `membership` / `user` only when displaying a non-current
 * user (rare; usually a separate API surface).
 *
 * Sister of `<ElvixAvatar>` (the editor). Default size is the
 * navigation-chip size (40px) — `<ElvixAvatar>` defaults to 128px
 * because it's a wizard surface. Pass `size` to either to override.
 */
export type ElvixUserAvatarProps = {
  /** Override the app slug. Falls back to the provider's bootstrap. */
  appSlug?: string;
  /** Override the user id. Falls back to the provider's sdk-context. */
  userId?: string;
  /** Pixel display size (1× CSS px). srcset handles retina automatically. */
  size?: number;
  className?: string;
  /** Round vs square. Default circle. */
  shape?: Shape;
  /** Override the membership envelope (avatarSizes / avatarUpdatedAt). */
  membership?: { avatarUpdatedAt: Date | number; avatarSizes: number[] };
  /** Override the user envelope (name / email / avatarUrl). */
  user?: { name?: string | null; email?: string | null; avatarUrl?: string | null };
};

export function ElvixUserAvatar({
  appSlug,
  userId,
  size = 40,
  className,
  shape = "circle",
  membership,
  user,
}: ElvixUserAvatarProps = {}) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();

  const resolvedAppSlug = appSlug ?? app?.urlSlug ?? "preview";
  const resolvedUserId = userId ?? appCtx?.user.id ?? "preview-user";
  // appCtx.membership.avatarUpdatedAt is an ISO string off the wire;
  // UserAvatar wants Date | number. Parse here so the rest of the
  // pipeline stays cache-bust-friendly.
  const resolvedMembership: { avatarUpdatedAt: Date | number; avatarSizes: number[] } =
    membership ??
    (appCtx?.membership
      ? {
          avatarUpdatedAt: new Date(appCtx.membership.avatarUpdatedAt),
          avatarSizes: appCtx.membership.avatarSizes,
        }
      : { avatarUpdatedAt: 0, avatarSizes: [] });
  const resolvedUser = user ??
    (appCtx?.user
      ? {
          name: appCtx.user.name,
          email: appCtx.user.email,
          avatarUrl: appCtx.user.avatarUrl,
        }
      : { name: null, email: null, avatarUrl: null });

  return (
    <UserAvatar
      appSlug={resolvedAppSlug}
      userId={resolvedUserId}
      membership={resolvedMembership}
      user={resolvedUser}
      size={size}
      className={className ?? ""}
      shape={shape}
    />
  );
}
