import { z } from "zod";

/**
 * Identity schema for the elvix Profile SDK.
 *
 * Two flavours:
 *
 *   `identitySchema`         — STRICT. Every required field present.
 *                               This is what the SDK form enforces
 *                               on the client at save time. Pronouns
 *                               stay optional at the type layer —
 *                               always opt-in.
 *
 *   `identityPatchSchema`    — LOOSE. Every field optional. The
 *                               backend accepts partial updates so
 *                               non-SDK callers (Console admins,
 *                               imports, OAuth-snapshot merges) and
 *                               cross-app writers can update one
 *                               field at a time without resending
 *                               the whole row.
 *
 * Renamed from `basic-info-schema` on 2026-05-20 so the SDK surface
 * reads as "Identity" — single cross-app source of truth for who
 * the user is.
 */

export const GENDER_VALUES = ["male", "female", "non_binary", "prefer_not_to_say"] as const;

export type Gender = (typeof GENDER_VALUES)[number];

/**
 * Pronouns — captured separately from gender because they're
 * grammatical, not identity. Many users want to declare pronouns
 * without disclosing gender (and vice versa). Optional everywhere.
 */
export const PRONOUN_VALUES = [
  "she_her",
  "he_him",
  "they_them",
  "other",
  "prefer_not_to_say",
] as const;
export type Pronouns = (typeof PRONOUN_VALUES)[number];

export const givenNameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(80, "Keep it under 80 characters");

export const familyNameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(80, "Keep it under 80 characters");

// ISO date "YYYY-MM-DD" — what <input type="date"> emits.
export const birthdateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .refine((s) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    const min = new Date("1900-01-01");
    return d >= min && d <= now;
  }, "Pick a real date in the past");

export const genderSchema = z.enum(GENDER_VALUES, {
  message: "Required",
});

export const pronounsSchema = z.enum(PRONOUN_VALUES);

export const identitySchema = z.object({
  givenName: givenNameSchema,
  familyName: familyNameSchema,
  birthdate: birthdateSchema,
  gender: genderSchema,
  pronouns: pronounsSchema.optional().nullable(),
});

export type IdentityInput = z.infer<typeof identitySchema>;

export const identityPatchSchema = identitySchema.partial();

export type IdentityPatchInput = z.infer<typeof identityPatchSchema>;
