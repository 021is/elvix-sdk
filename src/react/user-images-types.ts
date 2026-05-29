/**
 * Client-safe constants + URL helpers for the per-user image pipeline.
 * NO sharp, NO fs, NO R2 client — anything pulled here must work in
 * the browser bundle. The sharp-heavy server work lives in
 * `lib/user-images.ts` (server-only).
 */

import { R2_PRODUCT_PREFIX, R2_PUBLIC_BASE } from "./r2-config";

const Type = {
  AVATAR: "avatar",
  BANNER: "banner",
} as const;
type Type = (typeof Type)[keyof typeof Type];


export const AVATAR_SIZES = [128, 256, 1200] as const;
export const BANNER_SIZES = [768, 1500, 2400] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];
export type BannerSize = (typeof BANNER_SIZES)[number];

export function isAvatarSize(n: number): n is AvatarSize {
  return (AVATAR_SIZES as readonly number[]).includes(n);
}
export function isBannerSize(n: number): n is BannerSize {
  return (BANNER_SIZES as readonly number[]).includes(n);
}

/**
 * Build the public URL for a single variant. The `?v=` cache-buster is
 * the asset's last-modified timestamp (epoch ms) — semantic, free
 * (Prisma writes it on every mutation), and bumps coherently across
 * srcset entries when the asset changes.
 *
 * Accepts a Date OR a number to keep server callers ergonomic — when
 * reading a Prisma row you pass the DateTime directly; clients
 * receiving serialized JSON pass the already-coerced epoch ms.
 */
export function variantUrl(
  appSlug: string,
  userId: string,
  type: Type,
  size: number,
  updatedAt: Date | number,
): string {
  const v = typeof updatedAt === "number" ? updatedAt : updatedAt.getTime();
  return `${R2_PUBLIC_BASE}/${R2_PRODUCT_PREFIX}/${appSlug}/users/${userId}/${type}-${size}.webp?v=${v}`;
}
