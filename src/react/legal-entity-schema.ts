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

/** E-invoice addresses: Peppol `<4-digit EAS>:<id>`, SDI code, Leitweg-ID. */
export const PEPPOL_ID = /^\d{4}:[A-Za-z0-9._-]{1,64}$/;
export const CODICE_DESTINATARIO = /^[A-Z0-9]{7}$/;
export const LEITWEG_ID = /^[0-9]{2,12}(-[A-Za-z0-9]{1,30})?-[0-9]{2}$/;

/** What an app was granted an entity for; each purpose reads its own fields. */
export const LegalEntityPurpose = {
  INVOICING: "invoicing",
  PAYOUTS: "payouts",
} as const;
export type LegalEntityPurpose = (typeof LegalEntityPurpose)[keyof typeof LegalEntityPurpose];

/** Does the legal name match the register's name for the VAT ID? (elvix's own check.) */
export const VatNameMatch = {
  MATCH: "match",
  MISMATCH: "mismatch",
  UNKNOWN: "unknown",
} as const;
export type VatNameMatch = (typeof VatNameMatch)[keyof typeof VatNameMatch];

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
  // A natural person's name in its two parts (0.18): payment providers ask
  // for both, and `legalName` is built from them.
  givenName: z.string().trim().max(120).optional().nullable(),
  familyName: z.string().trim().max(120).optional().nullable(),

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
  // The VAT ID only. Its verdict (`vatIdValidation` and the rest) is elvix's
  // own, asked of the authority when the VAT ID is saved (0.18): a browser
  // that sends one is ignored, since zod drops keys the shape does not name.
  vatId: z.string().trim().max(40).optional().nullable(),

  registrationNumber: z.string().trim().max(80).optional().nullable(),
  registrationBody: z.string().trim().max(180).optional().nullable(),
  registeredSince: dateString.optional().nullable(),

  contactEmail: z.string().trim().email("Enter a real email").max(240).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),

  // Where e-invoices go (0.18), each optional: a Peppol participant
  // (`<EAS scheme>:<identifier>`), Italy's SDI code or certified email, and a
  // German public body's Leitweg-ID.
  peppolId: z.string().trim().regex(PEPPOL_ID, "Enter scheme:identifier").optional().nullable(),
  codiceDestinatario: z
    .string()
    .trim()
    .regex(CODICE_DESTINATARIO, "7 letters or digits")
    .optional()
    .nullable(),
  pecAddress: z.string().trim().email("Enter a real email").max(240).optional().nullable(),
  leitwegId: z.string().trim().regex(LEITWEG_ID, "Enter a Leitweg-ID").optional().nullable(),

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
  if (!val.givenName?.trim()) report("givenName", "Required");
  if (!val.familyName?.trim()) report("familyName", "Required");
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
 *    sole_prop  → a VAT ID, or else the local tax number (an invoice needs
 *                 one: a German Kleinunternehmer prints the Steuernummer,
 *                 §14(4) Nr. 2 UStG)
 *    company    → VAT required, local tax number optional
 *  A supplied local number must match its country's format. */
function checkTaxIds(val: Shape, report: Report): void {
  const soleWithoutVat = val.type === "sole_prop" && !val.vatId?.trim();
  const taxIdRequired = val.type === "individual" || soleWithoutVat;
  if (taxIdRequired && !val.taxId?.trim()) report("taxId", "Required");
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

/** An invoice to a business carries its full address (EU VAT Directive art.
 *  226(5)): street, postal code, city and country, so a business cannot be
 *  saved without them. */
function checkBusinessAddress(val: Shape, report: Report, registered: boolean): void {
  if (!registered) return;
  const parts = ["addressLine1", "addressPostalCode", "addressCity", "addressCountry"] as const;
  for (const part of parts) {
    if (!val[part]?.trim()) report(part, "Required for an invoice");
  }
}

export const legalEntitySchema = legalEntityShape.superRefine((val, ctx) => {
  const report: Report = (path, message) => ctx.addIssue({ code: "custom", path: [path], message });
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (val.type === "individual" || val.type === "sole_prop") checkNaturalPerson(val, report);
  checkTaxIds(val, report);
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const registered = val.type === "sole_prop" || val.type === "company";
  checkRegistration(val, report, registered);
  checkBusinessAddress(val, report, registered);
});

export type LegalEntityInput = z.infer<typeof legalEntitySchema>;

/**
 * Loose schema — every field optional, no `superRefine` gate so
 * partial PATCHes from the detail view (one row at a time) succeed.
 * The strict schema is what the client enforces on the add wizard.
 */
export const legalEntityPatchSchema = legalEntityShape.partial();
export type LegalEntityPatchInput = z.infer<typeof legalEntityPatchSchema>;

/**
 * The VAT check elvix ran on save: set by the server only, never input. The
 * two newest fields are optional, so a host on an older elvix gets
 * `undefined` rather than a type that lies.
 */
export type VatVerdict = {
  vatIdValidation: TaxValidationLevel;
  vatIdValidatedAt: string | null;
  /** The authority's registered name; null when it shares none (VIES for DE). */
  vatIdValidatedName: string | null;
  /** The authority's registered address, one line, when it shares one. */
  vatIdValidatedAddress?: string | null;
  /** VIES's consultation number; only issued when a requester VAT ID is sent. */
  vatIdRequestId?: string | null;
};

/**
 * What elvix works out on every read (0.18), never input: all optional, so a
 * host on an older elvix gets `undefined`.
 */
export type ServerComputed = {
  /** Inside an app the personal fields come back null: they are write-only
   *  there and shown only in the user's elvix account. */
  withheld?: boolean;
  /** The legal name against the register's name for this VAT ID. */
  vatIdNameMatch?: VatNameMatch;
  /** EAS codes for an e-invoice (`"9930"` for a German VAT ID), or null. */
  vatIdScheme?: string | null;
  taxIdScheme?: string | null;
  registrationNumberScheme?: string | null;
};

/** Server-emitted record. Adds audit fields, normalises dates to ISO. */
// LEGACY: spine-lint-disable-next-line spine/enum-over-string
export type LegalEntityRecord = Omit<LegalEntityInput, "dateOfBirth" | "registeredSince"> &
  VatVerdict &
  ServerComputed & {
    id: string;
    dateOfBirth: string | null;
    registeredSince: string | null;
    createdAt: string;
    updatedAt: string;
  };
