/**
 * Avatar URL resolver. Picks the right source for a user's avatar
 * based on the fallback chain:
 *
 *   1. Custom upload   → cdn.021.is/elvix/{slug}/users/{uid}/avatar-N.webp
 *   2. Google picture  → captured at sign-in, stored on User.avatarUrl
 *   3. Initials        → component renders from first letters of name/email
 *
 * Returns a `<UserAvatar>`-ready descriptor: source plus the full
 * `srcset` (custom only — Google's URL is a single asset).
 *
 * Pure data helper. No DB access — caller passes the persisted bits
 * from ApplicationUser + User. Keep it server-renderable + cheap.
 */

import { AVATAR_SIZES, type AvatarSize, isAvatarSize, variantUrl } from "./user-images-types";

export type AvatarSource =
  | { kind: "custom"; src: string; srcSet: string; sizes: AvatarSize[] }
  | { kind: "google"; src: string }
  | { kind: "initials"; initials: string };

export type AvatarResolverInput = {
  appSlug: string;
  userId: string;
  /**
   * `avatarUpdatedAt` is the last-modified timestamp used as the
   * cache-buster. Accept either a Date or epoch ms so server callers
   * (Prisma DateTime) and client callers (serialized number) both fit.
   */
  membership: { avatarUpdatedAt: Date | number; avatarSizes: number[] };
  user: { name?: string | null; email?: string | null; avatarUrl?: string | null };
};

export function resolveAvatar(input: AvatarResolverInput): AvatarSource {
  const { appSlug, userId, membership, user } = input;

  // 1. Custom uploads
  const present = membership.avatarSizes.filter(isAvatarSize).sort((a, b) => a - b);
  const largest = present.at(-1);
  if (largest !== undefined) {
    const srcSet = present
      .map((s) => {
        const url = variantUrl({
          appSlug,
          userId,
          type: "avatar",
          size: s,
          updatedAt: membership.avatarUpdatedAt,
        });
        return `${url} ${s}w`;
      })
      .join(", ");
    const src = variantUrl({
      appSlug,
      userId,
      type: "avatar",
      size: largest,
      updatedAt: membership.avatarUpdatedAt,
    });
    return { kind: "custom", src, srcSet, sizes: present };
  }

  // 2. Google picture URL (captured at sign-in)
  if (user.avatarUrl) {
    return { kind: "google", src: user.avatarUrl };
  }

  // 3. Initials
  return { kind: "initials", initials: initialsOf(user.name, user.email) };
}

export function initialsOf(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const [first, last] = [parts[0], parts.at(-1)];
  if (parts.length >= 2 && first && last) {
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Pick the smallest variant that meets a display-pixel requirement
 * for `<img src>` consumers that can't use srcset. Doubles the value
 * for retina handling.
 */
export function pickAvatarSize(displayPx: number): AvatarSize {
  const target = displayPx * 2;
  // Ascending: the first size big enough, else the largest there is.
  let pick: AvatarSize = AVATAR_SIZES[0];
  for (const s of AVATAR_SIZES) {
    pick = s;
    if (s >= target) break;
  }
  return pick;
}
