/**
 * Webhook event taxonomy + payload types.
 *
 * Discriminated by `type`. Use `verifyElvixWebhook` (from
 * `@elvix.is/sdk/server`) to verify the HMAC signature and get a
 * fully typed `ElvixWebhookEvent` back — narrow on `event.type` to
 * pick the matching `data` shape.
 *
 * New event types are added additively. Consumers MUST ignore
 * unknown `type` values and not throw — the `UnknownEvent` branch
 * is included so the union stays exhaustive against future server
 * additions.
 */

export const ElvixWebhookEventType = {
  // ── Session ───────────────────────────────────────────────────
  USER_SIGNED_IN: "user.signed_in",
  USER_SIGNED_OUT: "user.signed_out",
  USER_SESSION_REVOKED: "user.session_revoked",
  USER_SESSION_EXPIRED: "user.session_expired",

  // ── Admin lifecycle ───────────────────────────────────────────
  USER_BANNED: "user.banned",
  USER_UNBANNED: "user.unbanned",
  USER_PAUSED: "user.paused",
  USER_RESUMED: "user.resumed",
  USER_DELETED: "user.deleted",
  USER_RESTORED: "user.restored",

  // ── Self lifecycle ────────────────────────────────────────────
  USER_INACTIVATED: "user.inactivated",
  USER_REACTIVATED: "user.reactivated",
  USER_LEFT: "user.left",

  // ── Role / scope / membership ────────────────────────────────
  USER_ROLE_ADDED: "user.role_added",
  USER_ROLE_REMOVED: "user.role_removed",
  USER_SCOPE_ADDED: "user.scope_added",
  USER_SCOPE_REMOVED: "user.scope_removed",
  USER_MEMBERSHIP_CHANGED: "user.membership_changed",

  // ── Profile ───────────────────────────────────────────────────
  USER_PROFILE_UPDATED: "user.profile_updated",
  USER_USERNAME_CHANGED: "user.username_changed",
  USER_AVATAR_CHANGED: "user.avatar_changed",
  USER_BANNER_CHANGED: "user.banner_changed",
  USER_IDENTITY_CHANGED: "user.identity_changed",
} as const;
export type ElvixWebhookEventType =
  (typeof ElvixWebhookEventType)[keyof typeof ElvixWebhookEventType];

/** Common envelope fields shared by every event. */
type Base<T extends string, D> = {
  /** Stable unique id for this delivery. Use as the dedup key on the
   *  receiver: the dispatcher may retry the same eventId on failure. */
  id: string;
  type: T;
  /** ISO-8601 UTC timestamp when the event was recorded. */
  createdAt: string;
  /** Application that owns the event (your `clientId`'s applicationId). */
  applicationId: string;
  /** Who initiated the change: end-user id for self-actions, console
   *  owner id for admin-initiated, null for system jobs. */
  actorUserId: string | null;
  /** Type-specific payload. */
  data: D;
};

// ── Payload shapes ──────────────────────────────────────────────

export type UserRef = {
  userId: string;
  email: string | null;
  name: string | null;
};

export type UserSignedInData = UserRef & {
  /** Sign-in factor that succeeded. */
  method: "passkey" | "otp" | "google" | "username";
  sessionId: string;
  ipCountry: string | null;
};

export type UserSignedOutData = UserRef & {
  sessionId: string;
  /** `user` = explicit sign-out; `admin` = console-revoked;
   *  `system` = expiry / lifecycle-watcher. */
  initiator: "user" | "admin" | "system";
};

export type UserLifecycleData = UserRef & {
  /** New status after the change. */
  status: "active" | "banned" | "paused" | "deleted" | "inactive";
  /** Free-text reason captured at the action time (console field). */
  reason: string | null;
};

export type UserRoleData = UserRef & {
  /** Role key (matches ApplicationRole.key). */
  role: string;
  /** Roles the user holds after the change. */
  roles: string[];
};

export type UserScopeData = UserRef & {
  scope: string;
  scopes: string[];
};

export type UserMembershipData = UserRef & {
  status: "active" | "banned" | "paused" | "deleted" | "inactive";
  roles: string[];
  scopes: string[];
};

export type UserProfileData = UserRef & {
  /** Fields that changed on this event. */
  changed: Array<"name" | "email" | "username" | "avatar" | "banner" | "identity">;
};

// ── Discriminated union ─────────────────────────────────────────

export type ElvixWebhookEvent =
  // Session
  | Base<"user.signed_in", UserSignedInData>
  | Base<"user.signed_out", UserSignedOutData>
  | Base<"user.session_revoked", UserSignedOutData>
  | Base<"user.session_expired", UserSignedOutData>
  // Admin lifecycle
  | Base<"user.banned", UserLifecycleData>
  | Base<"user.unbanned", UserLifecycleData>
  | Base<"user.paused", UserLifecycleData>
  | Base<"user.resumed", UserLifecycleData>
  | Base<"user.deleted", UserLifecycleData>
  | Base<"user.restored", UserLifecycleData>
  // Self lifecycle
  | Base<"user.inactivated", UserLifecycleData>
  | Base<"user.reactivated", UserLifecycleData>
  | Base<"user.left", UserLifecycleData>
  // Role / scope / membership
  | Base<"user.role_added", UserRoleData>
  | Base<"user.role_removed", UserRoleData>
  | Base<"user.scope_added", UserScopeData>
  | Base<"user.scope_removed", UserScopeData>
  | Base<"user.membership_changed", UserMembershipData>
  // Profile
  | Base<"user.profile_updated", UserProfileData>
  | Base<"user.username_changed", UserProfileData>
  | Base<"user.avatar_changed", UserProfileData>
  | Base<"user.banner_changed", UserProfileData>
  | Base<"user.identity_changed", UserProfileData>;

/** Outcome of `verifyElvixWebhook`. Discriminated on `ok`. */
export type ElvixWebhookVerifyResult =
  | { ok: true; event: ElvixWebhookEvent }
  | {
      ok: false;
      error:
        | "missing_signature"
        | "invalid_signature_format"
        | "stale_timestamp"
        | "signature_mismatch"
        | "invalid_payload";
      message?: string;
    };
