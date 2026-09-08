/**
 * Wire-level types shared between the React, server, and MCP layers.
 * Mirrors the elvix.is REST envelopes — bump together with the
 * server when they evolve.
 */

/**
 * The signed-in user as `POST /api/v1/session` returns them.
 *
 * ⚠ Every field below `avatarUrl` is **additive** and therefore optional: a
 * host pinned to an older elvix gets `undefined`, never a type error. The four
 * original fields stay required so existing code keeps compiling unchanged.
 *
 * The route returned all of this for a long time and the type described four
 * fields of it, so hosts either re-declared the envelope themselves or silently
 * lost data they had already paid a round trip for.
 */
export type ElvixUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;

  /**
   * Per-application handle, the one hosts build profile URLs from (`/@alice`).
   * Added to the route in the same change as this field — an older elvix omits
   * it, which is why it is optional rather than `string | null`.
   */
  username?: string | null;
  /** Same string as `name`; both are returned, pick one and stay with it. */
  fullName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  /** BCP-47, from the user's profile, falling back to their region. */
  locale?: string | null;
  /** IANA zone, from the user's profile, falling back to their region. */
  timezone?: string | null;
};

/**
 * The user's region, `null` when they have not set one.
 *
 * ⚠ Only `country` and `measurementSystem` are guaranteed. The other three are
 * nullable in elvix's `UserRegion` and always have been — the docs presented
 * them as plain strings, so a consumer would have coded against a value that
 * can be absent. Found 2026-09-07 by typing the route against its own schema.
 */
export type ElvixRegion = {
  country: string;
  uiLocale: string | null;
  timeZone: string | null;
  currency: string | null;
  measurementSystem: string;
};

export type ElvixVerifyOk = {
  ok: true;
  user: ElvixUser;
  roles: string[];
  scopes: string[];
  /** Membership slugs (back-compat). */
  memberships: string[];
  /**
   * Full membership brand (slug + name + logo) so consumer apps render partner
   * branding from the session instead of hardcoding it per slug. Parallel to
   * `memberships` (which stays slug-only). Empty when the server predates the
   * field (pre-0.7.20 elvix) or the user has no memberships.
   */
  membershipBrands: { slug: string; name: string; logoUrl: string | null }[];

  /** The application this session belongs to. */
  applicationId?: string;
  /** Membership status — `active` here by construction; the route 403s otherwise. */
  status?: string;
  region?: ElvixRegion | null;
  /**
   * CDN variant inventory. Build a URL directly rather than making another
   * call: `https://cdn.021.is/elvix/<app>/users/<id>/avatar-<size>.webp?v=<updatedAt>`.
   * The `updatedAt` epoch is the cache-buster.
   */
  avatarSizes?: number[];
  avatarUpdatedAt?: string | null;
  bannerSizes?: number[];
  bannerUpdatedAt?: string | null;
  /** Session expiry, ISO-8601. */
  expiresAt?: string;
};

export type ElvixVerifyErr = {
  ok: false;
  error: "invalid_token" | "expired" | "revoked" | "membership_blocked" | "rate_limited";
  message?: string;
};

export type ElvixVerifyResult = ElvixVerifyOk | ElvixVerifyErr;

/**
 * Discriminated union returned to host apps by every `<Elvix*>`
 * mutation component's `onResult` callback. Always carries "safe to
 * give back" data — no PII beyond what the customer already sees.
 */
export type ElvixActionResult<T = unknown> =
  | { ok: true; data?: T; redirect?: string }
  | { ok: false; error: string; message?: string };
