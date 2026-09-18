import { z } from "zod";
import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import { localTaxIdMatches, registrationNumberMatches } from "./tax-validation";

/**
 * Legal-entity schema for the elvix Profile SDK.
 *
 * Mirrors the `basic-info` / `address` pattern:
 *
 *   `legalEntitySchema`        — STRICT. SDK form enforces it
 *                                client-side before commit. Required
 *                                fields differ by `type` (see
 *                                refinement below).
 *   `legalEntityPatchSchema`   — LOOSE. Server accepts partial
 *                                updates so each tap-to-edit row on
 *                                the detail view PATCHes only its
 *                                own field.
 *
 * Required-field gates by type:
 *
 *   individual   → legalName · dateOfBirth · nationality · taxCountry
 *   sole_prop    → legalName · dateOfBirth · nationality · taxCountry
 *                  + registrationNumber + registrationBody
 *   company      → legalName · taxCountry
 *                  + registrationNumber + registrationBody
 *
 * Everything else is optional but recorded if provided.
 */

export const LEGAL_ENTITY_TYPES = ["individual", "sole_prop", "company"] as const;
export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

// ISO-3166-1 alpha-2: 2 uppercase letters.
const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * `nationality` is a comma-separated list of ISO codes. Dual-
 * nationality common in Edvone's target demographic (Edvard himself
 * is DE/UA, many EU expats hold multiple). One small regex covers
 * the lot — allow up to 4 codes.
 */
const NATIONALITY_LIST = /^[A-Z]{2}(,[A-Z]{2}){0,3}$/;

/**
 * Tax-validation level. Lifted into the schema so the SDK can
 * surface the current state on the detail view and route the live
 * check at edit time.
 */
export const TAX_VALIDATION_LEVELS = ["none", "invalid", "format", "live"] as const;
export type TaxValidationLevel = (typeof TAX_VALIDATION_LEVELS)[number];

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Pick a real date");

const legalEntityShape = z.object({
  type: z.enum(LEGAL_ENTITY_TYPES),
  label: z.string().trim().max(60).optional().nullable(),
  isDefault: z.boolean().optional(),

  legalName: z
    .string()
    .trim()
    .min(2, "Enter at least 2 characters")
    .max(180, "Keep it under 180 characters")
    .regex(/\p{L}/u, "Must include at least one letter"),
  tradingName: z.string().trim().max(180).optional().nullable(),

  dateOfBirth: dateString.optional().nullable(),
  placeOfBirth: z.string().trim().max(140).optional().nullable(),
  placeOfBirthPlaceId: z.string().trim().max(400).optional().nullable(),
  nationality: z
    .string()
    .trim()
    .regex(NATIONALITY_LIST, "Pick a nationality")
    .optional()
    .nullable(),

  taxCountry: z
    .string()
    .trim()
    .regex(COUNTRY_CODE, "Pick a country")
    .refine(
      (c) => (TAX_VALIDATABLE_COUNTRIES as readonly string[]).includes(c),
      "We don't validate tax IDs for this country yet",
    ),
  taxId: z.string().trim().max(40).optional().nullable(),
  vatId: z.string().trim().max(40).optional().nullable(),
  vatIdValidation: z.enum(TAX_VALIDATION_LEVELS).optional(),
  vatIdValidatedAt: z.string().datetime().optional().nullable(),
  vatIdValidatedName: z.string().trim().max(240).optional().nullable(),

  registrationNumber: z.string().trim().max(80).optional().nullable(),
  registrationBody: z.string().trim().max(180).optional().nullable(),
  registeredSince: dateString.optional().nullable(),

  contactEmail: z.string().trim().email("Enter a real email").max(240).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),

  // Embedded registered address — same shape as UserAddress, but
  // stored on the entity row (snapshot, not FK).
  addressLine1: z.string().trim().max(240).optional().nullable(),
  addressLine2: z.string().trim().max(240).optional().nullable(),
  addressCity: z.string().trim().max(140).optional().nullable(),
  addressRegionName: z.string().trim().max(140).optional().nullable(),
  addressRegionCode: z.string().trim().max(40).optional().nullable(),
  addressPostalCode: z.string().trim().max(40).optional().nullable(),
  addressCountry: z.string().trim().regex(COUNTRY_CODE).optional().nullable(),
  addressCountryName: z.string().trim().max(120).optional().nullable(),
  addressFormatted: z.string().trim().max(500).optional().nullable(),
  addressPlaceId: z.string().trim().max(400).optional().nullable(),
  addressTimezone: z.string().trim().max(80).optional().nullable(),
  addressLatitude: z.number().finite().gte(-90).lte(90).optional().nullable(),
  addressLongitude: z.number().finite().gte(-180).lte(180).optional().nullable(),
});

/**
 * Strict schema layered atop the loose shape. The `superRefine` adds
 * the per-type required-field gates the wizard enforces at commit
 * time but server-PATCH endpoints don't want.
 */
type Shape = z.infer<typeof legalEntityShape>;
type Report = (path: keyof Shape, message: string) => void;

/** Individual + sole-prop are natural persons: DOB, nationality, place of
 *  birth, and a legal name of at least two letter-bearing words (given +
 *  family). Companies may have single-word names ("Apple", "Edvone"). */
function checkNaturalPerson(val: Shape, report: Report): void {
  if (!val.dateOfBirth) report("dateOfBirth", "Required");
  if (!val.nationality) report("nationality", "Required");
  if (!val.placeOfBirth) report("placeOfBirth", "Required");
  const words =
    val.legalName
      ?.trim()
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w)) ?? [];
  if (words.length < 2) report("legalName", "Enter both given name and family name");
}

/** Tax-id gating mirrors the wizard's TaxIdsView:
 *    individual → local tax number required, VAT hidden
 *    sole_prop  → both optional (registration is the canonical business
 *                 identity for sole props)
 *    company    → VAT required, local tax number optional
 *  A supplied local number must match its country's format. */
function checkTaxIds(val: Shape, report: Report): void {
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (val.type === "individual" && !val.taxId?.trim()) report("taxId", "Required");
  if (val.taxId?.trim() && val.taxCountry && !localTaxIdMatches(val.taxCountry, val.taxId)) {
    report("taxId", `Doesn't match the expected format for ${val.taxCountry}`);
  }
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (val.type === "company" && !val.vatId?.trim()) report("vatId", "Required");
}

/** Sole-prop + company are registered businesses: a registration number and
 *  its issuing body. A supplied number must match its country's format. */
function checkRegistration(val: Shape, report: Report, registered: boolean): void {
  if (registered && !val.registrationNumber) {
    report("registrationNumber", "Required for sole proprietorships and companies");
  }
  if (registered && !val.registrationBody) {
    report("registrationBody", "Required — the issuing authority");
  }
  const number = val.registrationNumber;
  if (number?.trim() && val.taxCountry && !registrationNumberMatches(val.taxCountry, number)) {
    report("registrationNumber", `Doesn't match the expected format for ${val.taxCountry}`);
  }
}

export const legalEntitySchema = legalEntityShape.superRefine((val, ctx) => {
  const report: Report = (path, message) => ctx.addIssue({ code: "custom", path: [path], message });
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (val.type === "individual" || val.type === "sole_prop") checkNaturalPerson(val, report);
  checkTaxIds(val, report);
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  checkRegistration(val, report, val.type === "sole_prop" || val.type === "company");
});

export type LegalEntityInput = z.infer<typeof legalEntitySchema>;

/**
 * Loose schema — every field optional, no `superRefine` gate so
 * partial PATCHes from the detail view (one row at a time) succeed.
 * The strict schema is what the client enforces on the add wizard.
 */
export const legalEntityPatchSchema = legalEntityShape.partial();
export type LegalEntityPatchInput = z.infer<typeof legalEntityPatchSchema>;

/** Server-emitted record. Adds audit fields, normalises dates to ISO. */
// LEGACY: spine-lint-disable-next-line spine/enum-over-string
export type LegalEntityRecord = Omit<LegalEntityInput, "dateOfBirth" | "registeredSince"> & {
  id: string;
  dateOfBirth: string | null;
  registeredSince: string | null;
  createdAt: string;
  updatedAt: string;
};
