/**
 * Static R2 base + prefix constants, safe to import from client code.
 * Moved VERBATIM from the elvix monorepo (`lib/r2-config.ts`) so the
 * ported `<UserAvatar>` / `<UserBanner>` build the same public CDN URLs
 * the elvix.is surface does. Real R2 client (with credentials) stays
 * server-only and is never shipped in the SDK.
 *
 * Defaults to elvix's public CDN; a host on its own infra can override
 * via the same `NEXT_PUBLIC_R2_*` env the monorepo reads.
 */

export const R2_PUBLIC_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.R2_PUBLIC_BASE_URL) ||
  "https://cdn.021.is";

export const R2_PRODUCT_PREFIX =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_R2_PRODUCT_PREFIX) ||
  (typeof process !== "undefined" && process.env?.R2_PRODUCT_PREFIX) ||
  "elvix";
