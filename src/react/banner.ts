/**
 * Banner URL resolver. Same shape as `lib/avatar.ts` but for the 3:1
 * banner asset. There's no provider fallback (Google doesn't return a
 * cover image) — either the user has one, or the component renders an
 * empty placeholder.
 */

import { BANNER_SIZES, type BannerSize, isBannerSize, variantUrl } from "./user-images-types";

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

  const present = membership.bannerSizes.filter(isBannerSize).sort((a, b) => a - b);
  const largest = present.at(-1);
  if (largest === undefined) return { kind: "empty" };

  const srcSet = present
    .map((s) => {
      const url = variantUrl({
        appSlug,
        userId,
        type: "banner",
        size: s,
        updatedAt: membership.bannerUpdatedAt,
      });
      return `${url} ${s}w`;
    })
    .join(", ");
  const src = variantUrl({
    appSlug,
    userId,
    type: "banner",
    size: largest,
    updatedAt: membership.bannerUpdatedAt,
  });
  return { kind: "custom", src, srcSet, sizes: present };
}

export function pickBannerSize(displayPx: number): BannerSize {
  const target = displayPx * 2;
  // Ascending: the first size big enough, else the largest there is.
  let pick: BannerSize = BANNER_SIZES[0];
  for (const s of BANNER_SIZES) {
    pick = s;
    if (s >= target) break;
  }
  return pick;
}
