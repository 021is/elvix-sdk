/**
 * Banner URL resolver. Same shape as `lib/avatar.ts` but for the 3:1
 * banner asset. There's no provider fallback (Google doesn't return a
 * cover image) — either the user has one, or the component renders an
 * empty placeholder.
 */

import { BANNER_SIZES, type BannerSize, variantUrl } from "./user-images-types";

export type BannerSource =
  | { kind: "custom"; src: string; srcSet: string; sizes: BannerSize[] }
  | { kind: "empty" };

export type BannerResolverInput = {
  appSlug: string;
  userId: string;
  membership: { bannerUpdatedAt: Date | number; bannerSizes: number[] };
};

export function resolveBanner(input: BannerResolverInput): BannerSource {
  const { appSlug, userId, membership } = input;

  const present = membership.bannerSizes.filter((s) =>
    (BANNER_SIZES as readonly number[]).includes(s),
  ) as BannerSize[];
  if (present.length === 0) return { kind: "empty" };

  present.sort((a, b) => a - b);
  const srcSet = present
    .map((s) => `${variantUrl(appSlug, userId, "banner", s, membership.bannerUpdatedAt)} ${s}w`)
    .join(", ");
  const src = variantUrl(
    appSlug,
    userId,
    "banner",
    present[present.length - 1]!,
    membership.bannerUpdatedAt,
  );
  return { kind: "custom", src, srcSet, sizes: present };
}

export function pickBannerSize(displayPx: number): BannerSize {
  const target = displayPx * 2;
  for (const s of BANNER_SIZES) if (s >= target) return s;
  return BANNER_SIZES[BANNER_SIZES.length - 1]!;
}
