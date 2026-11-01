/**
 * One legal entity as `GET /api/applications/{id}/users/{uid}/legal-entities/{entityId}`
 * answers it (0.18): what a host's backend reads by id after the user picked
 * the entity in `<ElvixLegalEntityPicker>`, for the purpose the user granted.
 * The VAT fields are elvix's own verdict, asked of the authority when the
 * VAT ID was saved, never what a browser claimed. Declared here, without
 * zod, so a server never loads the React schema.
 *
 * A field the purpose does not cover is ABSENT, not null: `invoicing` (the
 * default) carries what an invoice needs; `payouts` adds the birth data, the
 * phone and the business's people, for a payment provider's checks.
 */

/** How far elvix could confirm the VAT ID: `live` is the authority's yes. */
export type ElvixVatValidation = "none" | "invalid" | "format" | "live";

/** The legal name against the register's name for the VAT ID; `unknown` when it shares none. */
export type ElvixVatNameMatch = "match" | "mismatch" | "unknown";

/** What a grant lets the app read. */
export type ElvixLegalEntityPurpose = "invoicing" | "payouts";

/** A business's representative, owner, director or executive (`payouts` only). */
export type ElvixLegalEntityPerson = {
  id: string;
  entityId: string;
  role: "representative" | "owner" | "director" | "executive";
  givenName: string;
  familyName: string;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  /** ISO-3166-1 alpha-2. */
  nationality: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  /** 0 to 100; set for owners. */
  ownershipPercent: number | null;
  addressLine1: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ElvixLegalEntity = {
  id: string;
  type: "individual" | "sole_prop" | "company";
  /** What an invoice is made out to. */
  legalName: string;
  /** A natural person's name in its two parts (individual, sole_prop). */
  givenName?: string | null;
  familyName?: string | null;

  /** ISO-3166-1 alpha-2. */
  taxCountry: string;
  /** The local tax number; never an individual's (it can encode a birth date). */
  taxId: string | null;
  /** As the register holds it: uppercase, no separators, with its prefix. */
  vatId: string | null;
  vatIdValidation: ElvixVatValidation;
  vatIdValidatedAt: string | null;
  /** The authority's registered name; null when it shares none (VIES for DE). */
  vatIdValidatedName: string | null;
  /** The authority's registered address, one line, when it shares one. */
  vatIdValidatedAddress?: string | null;
  /** VIES's consultation number for YOUR app's check, when it issued one. */
  vatIdRequestId?: string | null;
  /** A live VAT ID proves the number, not the company: check this too. */
  vatIdNameMatch?: ElvixVatNameMatch;
  /** EAS codes for an e-invoice's identifiers (`"9930"` = German VAT ID), or null. */
  vatIdScheme?: string | null;
  taxIdScheme?: string | null;
  registrationNumberScheme?: string | null;

  registrationNumber: string | null;
  registrationBody: string | null;
  contactEmail: string | null;

  // Where e-invoices go, when the business gave them.
  peppolId?: string | null;
  codiceDestinatario?: string | null;
  pecAddress?: string | null;
  leitwegId?: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressRegionName: string | null;
  addressRegionCode: string | null;
  /** ISO-3166-1 alpha-2. */
  addressCountry: string | null;
  addressCountryName: string | null;
  addressFormatted: string | null;

  // `payouts` only.
  dateOfBirth?: string | null;
  /** Comma-separated ISO-3166-1 alpha-2 codes. */
  nationality?: string | null;
  contactPhone?: string | null;
  people?: ElvixLegalEntityPerson[];

  /** Snapshot the entity onto what you issue together with this. */
  updatedAt: string;
  /** The purpose this read answered. */
  purpose?: ElvixLegalEntityPurpose;
  /** When the user picked it for your application, for that purpose. */
  grantedAt?: string;
};

export type ElvixLegalEntityResult =
  | { ok: true; entity: ElvixLegalEntity }
  | {
      ok: false;
      /**
       * `not_found`: never picked for your app (for that purpose), revoked,
       * deleted, or the user left your app, all answered alike so a key
       * cannot probe for entities. `unauthorized`: the API key is wrong or
       * lacks the app. `network`: elvix was not reached in time.
       * `invalid_id` / `invalid_purpose`: an id that is not a plain token, or
       * a purpose elvix does not know (no request was made). Anything else
       * is `http_<status>`.
       */
      error:
        | "not_found"
        | "unauthorized"
        | "network"
        | "invalid_id"
        | "invalid_purpose"
        | `http_${number}`;
    };
