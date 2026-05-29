import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import { localTaxIdMatches, registrationNumberMatches } from "./tax-validation";
import { z } from "zod";

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
export const legalEntitySchema = legalEntityShape.superRefine((val, ctx) => {
  // Per-type required-field gates. Individual + sole-prop need
  // DOB + nationality (they're natural persons). Sole-prop + company
  // need a registration number + issuing body (they're registered
  // businesses).
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const personLike = val.type === "individual" || val.type === "sole_prop";
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const registered = val.type === "sole_prop" || val.type === "company";
  if (personLike && !val.dateOfBirth) {
    ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Required" });
  }
  if (personLike && !val.nationality) {
    ctx.addIssue({ code: "custom", path: ["nationality"], message: "Required" });
  }
  if (personLike && !val.placeOfBirth) {
    ctx.addIssue({ code: "custom", path: ["placeOfBirth"], message: "Required" });
  }
  // Natural-person legal name must include at least two letter-bearing
  // words — given name + family name. Companies are allowed single-
  // word names ("Apple", "Edvone").
  if (personLike) {
    const words =
      val.legalName
        ?.trim()
        .split(/\s+/)
        .filter((w) => /\p{L}/u.test(w)) ?? [];
    if (words.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["legalName"],
        message: "Enter both given name and family name",
      });
    }
  }
  // Tax-id gating mirrors the wizard's TaxIdsView:
  //   individual → local tax number required, VAT hidden
  //   sole_prop  → both optional (registration is the canonical
  //                business identity for sole props)
  //   company    → VAT required, local tax number optional
  const taxIdRequired = val.type === "individual";
  const vatRequired = val.type === "company";
  if (taxIdRequired && (!val.taxId || !val.taxId.trim())) {
    ctx.addIssue({ code: "custom", path: ["taxId"], message: "Required" });
  }
  // Local tax-number format check (per-country). Only enforces when
  // a value is provided AND the country has a defined format.
  if (val.taxId?.trim() && val.taxCountry) {
    if (!localTaxIdMatches(val.taxCountry, val.taxId)) {
      ctx.addIssue({
        code: "custom",
        path: ["taxId"],
        message: `Doesn't match the expected format for ${val.taxCountry}`,
      });
    }
  }
  if (vatRequired && (!val.vatId || !val.vatId.trim())) {
    ctx.addIssue({ code: "custom", path: ["vatId"], message: "Required" });
  }
  if (registered && !val.registrationNumber) {
    ctx.addIssue({
      code: "custom",
      path: ["registrationNumber"],
      message: "Required for sole proprietorships and companies",
    });
  }
  if (registered && !val.registrationBody) {
    ctx.addIssue({
      code: "custom",
      path: ["registrationBody"],
      message: "Required — the issuing authority",
    });
  }
  // Registration number format check (per-country) when supplied.
  if (val.registrationNumber?.trim() && val.taxCountry) {
    if (!registrationNumberMatches(val.taxCountry, val.registrationNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationNumber"],
        message: `Doesn't match the expected format for ${val.taxCountry}`,
      });
    }
  }
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
