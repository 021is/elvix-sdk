"use client";

/**
 * Public-shaped banner component (3:1 aspect). Same resolver pattern
 * as <UserAvatar>: srcset-driven for responsive selection, with a
 * sensible empty-state when no variants exist.
 */

import { resolveBanner } from "./banner";
import { useMemo } from "react";

export type UserBannerProps = {
  appSlug: string;
  userId: string;
  membership: { bannerUpdatedAt: Date | number; bannerSizes: number[] };
  /** Container max-width in CSS px. Drives `sizes` for srcset. */
  containerPx?: number;
  /** Corner radius in px. Defaults to 14 — matches `<ElvixBanner>`'s editor
   *  frame so the read-only banner looks identical to the editable one. */
  cornerRadius?: number;
  className?: string;
  /** Class for the empty placeholder background (gradient by default). */
  emptyClassName?: string;
};

export function UserBanner({
  appSlug,
  userId,
  membership,
  containerPx = 1200,
  cornerRadius = 14,
  className = "",
  emptyClassName = "bg-gradient-to-br from-[#8e7dff]/10 via-surface-hover to-[#6c5ce7]/10",
}: UserBannerProps) {
  const resolved = useMemo(
    () => resolveBanner({ appSlug, userId, membership }),
    [appSlug, userId, membership],
  );

  const base = `block w-full aspect-[3/1] overflow-hidden ${className}`;
  const style = { borderRadius: cornerRadius };

  if (resolved.kind === "empty") {
    return <div className={`${base} ${emptyClassName}`} style={style} aria-hidden />;
  }

  return (
    <img
      src={resolved.src}
      srcSet={resolved.srcSet}
      sizes={`${containerPx}px`}
      alt=""
      className={`${base} object-cover`}
      style={style}
      loading="lazy"
      decoding="async"
    />
  );
}
