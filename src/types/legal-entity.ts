/**
 * One legal entity as `GET /api/applications/{id}/users/{uid}/legal-entities/{entityId}`
 * answers it (0.18): what a host's backend reads by id after the user picked
 * the entity in `<ElvixLegalEntityPicker>`. The VAT fields are elvix's own
 * verdict, asked of the authority when the VAT ID was saved, never what a
 * browser claimed. Declared here, without zod, so a server never loads the
 * React schema.
 */

/** How far elvix could confirm the VAT ID: `live` is the authority's yes. */
export type ElvixVatValidation = "none" | "invalid" | "format" | "live";

export type ElvixLegalEntity = {
  id: string;
  type: "individual" | "sole_prop" | "company";
  label: string | null;
  isDefault: boolean;
  /** What an invoice is made out to. */
  legalName: string;
  tradingName: string | null;

  // Natural persons only (individual, sole_prop).
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  placeOfBirthPlaceId: string | null;
  /** Comma-separated ISO-3166-1 alpha-2 codes. */
  nationality: string | null;

  /** ISO-3166-1 alpha-2. */
  taxCountry: string;
  taxId: string | null;
  /** As the register holds it: uppercase, no separators, with its prefix. */
  vatId: string | null;
  vatIdValidation: ElvixVatValidation;
  vatIdValidatedAt: string | null;
  /** The authority's registered name; null when it shares none (VIES for DE). */
  vatIdValidatedName: string | null;
  /** The authority's registered address, one line, when it shares one. */
  vatIdValidatedAddress?: string | null;
  /** VIES's consultation number, the proof of the check, when it issued one. */
  vatIdRequestId?: string | null;

  registrationNumber: string | null;
  registrationBody: string | null;
  registeredSince: string | null;

  contactEmail: string | null;
  contactPhone: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressRegionName: string | null;
  addressRegionCode: string | null;
  addressPostalCode: string | null;
  /** ISO-3166-1 alpha-2. */
  addressCountry: string | null;
  addressCountryName: string | null;
  addressFormatted: string | null;
  addressPlaceId: string | null;
  addressTimezone: string | null;
  addressLatitude: number | null;
  addressLongitude: number | null;

  createdAt: string;
  /** Snapshot the entity onto what you issue together with this. */
  updatedAt: string;
  /** When the user picked it for your application. */
  grantedAt?: string;
};

export type ElvixLegalEntityResult =
  | { ok: true; entity: ElvixLegalEntity }
  | {
      ok: false;
      /**
       * `not_found`: never picked for your app, revoked, or deleted, all
       * answered alike so a key cannot probe for entities. `unauthorized`:
       * the API key is wrong or lacks the app. `network`: elvix was not
       * reached in time. Anything else is `http_<status>`.
       */
      error: "not_found" | "unauthorized" | "network" | `http_${number}`;
    };
