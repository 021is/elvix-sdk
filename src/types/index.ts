/**
 * Wire-level types shared between the React, server, and MCP layers.
 * Mirrors the elvix.is REST envelopes — bump together with the
 * server when they evolve.
 */

export type ElvixUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
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
