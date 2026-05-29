/**
 * Canonical username rules — moved VERBATIM from the elvix monorepo
 * (`lib/sdk/username-rules.ts`) so the SDK's onboarding username step
 * validates identically to elvix.is. Pure logic, no host dependencies.
 *
 * Rules:
 *   - 4–30 characters total
 *   - lowercase letters, digits, dot, underscore
 *   - must start with a letter
 *   - must end with a letter or digit
 *   - no two specials in a row (no "..", "__", "._", "_.")
 *   - not in the reserved list (system routes + brand protection)
 */

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Allowed: a–z, 0–9, dot, underscore. Anchored. No two specials in
 * a row. Starts with a letter, ends alphanumeric. 4–30 chars (the
 * {2,28} body plus the leading + trailing class).
 */
export const USERNAME_RE = /^(?!.*[._]{2})[a-z][a-z0-9._]{2,28}[a-z0-9]$/;

/**
 * Words we never let an end-user claim. Keep tight — every entry
 * here is a username someone might genuinely want.
 *
 * Lowercased + trimmed before comparison so `Admin`, `ADMIN`, `admin`
 * all match the canonical reserved entry.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // system + routing
  "admin",
  "administrator",
  "root",
  "system",
  "sys",
  "api",
  "auth",
  "oauth",
  "app",
  "apps",
  "account",
  "accounts",
  "billing",
  "checkout",
  "pay",
  "payment",
  "payments",
  "brand",
  "console",
  "dashboard",
  "dev",
  "developer",
  "developers",
  "docs",
  "documentation",
  "explore",
  "help",
  "home",
  "index",
  "legal",
  "privacy",
  "terms",
  "tos",
  "cookies",
  "cookie",
  "imprint",
  "login",
  "signin",
  "logout",
  "signout",
  "signup",
  "register",
  "me",
  "my",
  "profile",
  "profiles",
  "user",
  "users",
  "new",
  "edit",
  "create",
  "delete",
  "public",
  "private",
  "static",
  "assets",
  "settings",
  "setting",
  "preferences",
  "support",
  "contact",
  "www",
  "http",
  "https",
  "ftp",
  "mail",
  "next",
  "_next",
  "src",
  "test",
  "tests",
  // brand
  "elvix",
  "edvone",
  "axum",
  "aixum",
  "mithra",
  "delvix",
  "buildza",
  "danceclub",
  "pulse",
  "pulseai",
  // pseudo-paths / common reserved
  "null",
  "undefined",
  "true",
  "false",
]);

export const UsernameReason = {
  OK: "ok",
  TOO_SHORT: "too_short",
  TOO_LONG: "too_long",
  BAD_CHARS: "bad_chars",
  MUST_START_LETTER: "must_start_letter",
  MUST_END_ALNUM: "must_end_alnum",
  NO_DOUBLE_SPECIAL: "no_double_special",
  RESERVED: "reserved",
} as const;
export type UsernameReason = (typeof UsernameReason)[keyof typeof UsernameReason];

/**
 * Granular reason for *why* a candidate failed. Use this on the
 * SDK side to render a precise inline message; use `isValidUsername`
 * for a boolean gate.
 */
export function usernameReason(raw: string): UsernameReason {
  const v = raw.trim().toLowerCase();
  if (v.length < USERNAME_MIN_LENGTH) return "too_short";
  if (v.length > USERNAME_MAX_LENGTH) return "too_long";
  if (!/^[a-z0-9._]+$/.test(v)) return "bad_chars";
  if (!/^[a-z]/.test(v)) return "must_start_letter";
  if (!/[a-z0-9]$/.test(v)) return "must_end_alnum";
  if (/[._]{2}/.test(v)) return "no_double_special";
  if (RESERVED_USERNAMES.has(v)) return "reserved";
  return "ok";
}

/** Boolean gate — combines regex + reserved check. */
export function isValidUsername(raw: string): boolean {
  return usernameReason(raw) === "ok";
}

/** Lowercased + whitespace-trimmed canonical form. */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
