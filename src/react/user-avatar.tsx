"use client";

/**
 * Public-shaped avatar component. Renders the correct CDN URL with
 * full `srcset` for responsive selection, falls back through:
 *
 *   custom (CDN variants) → Google picture → initials with bg
 *
 * Designed to be the canonical reference for the future `@elvix/react`
 * package. Stays serializable across server/client — no internal state,
 * pure rendering from props.
 */

import { type AvatarResolverInput, pickAvatarSize, resolveAvatar } from "./avatar";
import { useMemo } from "react";

const Shape = {
  CIRCLE: "circle",
  SQUARE: "square",
} as const;
type Shape = (typeof Shape)[keyof typeof Shape];


export type UserAvatarProps = {
  /** App slug — Application.urlSlug. */
  appSlug: string;
  userId: string;
  membership: { avatarUpdatedAt: Date | number; avatarSizes: number[] };
  user: { name?: string | null; email?: string | null; avatarUrl?: string | null };
  /** Pixel display size (1× CSS px). srcset handles retina automatically. */
  size?: number;
  className?: string;
  /** Round vs square. Default rounded-full. */
  shape?: Shape;
};

export function UserAvatar({
  appSlug,
  userId,
  membership,
  user,
  size = 40,
  className = "",
  shape = "circle",
}: UserAvatarProps) {
  const resolved = useMemo(
    () => resolveAvatar({ appSlug, userId, membership, user } satisfies AvatarResolverInput),
    [appSlug, userId, membership, user],
  );

  const shapeCls = shape === "circle" ? "rounded-full" : "rounded-[12%]";
  const base = `inline-flex items-center justify-center overflow-hidden bg-surface-hover border border-border-base shrink-0 ${shapeCls} ${className}`;
  const style = { width: size, height: size } as const;

  if (resolved.kind === "custom") {
    return (
      <img
        src={resolved.src}
        srcSet={resolved.srcSet}
        sizes={`${size}px`}
        width={size}
        height={size}
        alt=""
        className={base}
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (resolved.kind === "google") {
    // Blob / data URLs come from in-memory paths (docs preview, file
    // crop before upload). Pass them through unchanged — appending
    // `=s<n>-c` would break them. Real Google avatar URLs get the
    // size suffix re-written.
    const isInMemory =
      resolved.src.startsWith("blob:") || resolved.src.startsWith("data:");
    const cleanedSrc = isInMemory
      ? resolved.src
      : resolved.src.replace(/=s\d+(-c)?$/, "");
    const target = pickAvatarSize(size);
    const finalSrc = isInMemory ? cleanedSrc : `${cleanedSrc}=s${target}-c`;
    return (
      <img
        src={finalSrc}
        width={size}
        height={size}
        alt=""
        className={base}
        style={style}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  // Initials fallback. Picks a stable bg tint from the userId so two
  // users with the same initials still get distinct chips.
  const bg = pickInitialsBg(userId);
  return (
    <span
      className={base + " text-fg-1 font-semibold"}
      style={{ ...style, background: bg, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      aria-label={user.name ?? user.email ?? "user"}
    >
      {resolved.initials}
    </span>
  );
}

function pickInitialsBg(seed: string): string {
  // Deterministic hue per userId — generates a soft pastel that reads
  // on both light and dark canvas (saturation 60%, lightness 70%).
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const h = Math.abs(hash) % 360;
  return `hsl(${h} 60% 70% / 0.35)`;
}
