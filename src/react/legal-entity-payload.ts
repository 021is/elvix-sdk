/**
 * The legal-entity wizard's data mapping, pure: the POST body for a finished
 * draft, the PATCH for one step edited from the detail view, and the draft
 * prefill that opens that step. `legal-entity-flow.ts` owns the step order.
 */

import type { TaxIdValidationState } from "./elvix-tax-id-input";
import { View } from "./legal-entity-flow";
import type { LegalEntityInput, LegalEntityRecord } from "./legal-entity-schema";
import type { PlaceDetails } from "./legal-entity-types";
import type { LegalEntityDraft } from "./use-legal-entity-draft";

type Patch = Partial<LegalEntityInput>;

const orNull = (s: string | null | undefined) => s?.trim() || null;

/** The VAT fields, with the validation level the user actually reached. */
function vatFields(d: LegalEntityDraft): Patch {
  const level = d.vatValidation.level;
  return {
    taxId: orNull(d.taxId),
    vatId: orNull(d.vatId),
    vatIdValidation: level === "live" || level === "format" ? level : "none",
    vatIdValidatedAt: level === "live" ? new Date().toISOString() : null,
    vatIdValidatedName: d.vatValidation.name,
  };
}

function addressFields(a: PlaceDetails | null, line2: string): Patch {
  return {
    addressLine1: a?.line1 ?? null,
    addressLine2: orNull(line2),
    addressCity: a?.city ?? null,
    addressRegionName: a?.regionName ?? null,
    addressRegionCode: a?.regionCode ?? null,
    addressPostalCode: a?.postalCode ?? null,
    addressCountry: a?.country ?? null,
    addressCountryName: a?.countryName ?? null,
    addressFormatted: a?.formattedAddress ?? null,
    addressPlaceId: a?.placeId ?? null,
    addressTimezone: a?.timezone ?? null,
    addressLatitude: a?.latitude ?? null,
    addressLongitude: a?.longitude ?? null,
  };
}

/** What each editable step writes when it is edited on its own. */
const STEP_PATCH: Partial<Record<View, (d: LegalEntityDraft) => Patch>> = {
  [View.LEGAL_NAME]: (d) => ({ legalName: d.legalName.trim() }),
  [View.TRADING_NAME]: (d) => ({ tradingName: orNull(d.tradingName) }),
  [View.DOB]: (d) => ({ dateOfBirth: d.dob || null }),
  [View.PLACE_OF_BIRTH]: (d) => ({
    placeOfBirth: orNull(d.placeOfBirth),
    placeOfBirthPlaceId: d.placeOfBirthPlaceId || null,
  }),
  [View.NATIONALITY]: (d) => ({ nationality: d.nationality || null }),
  [View.TAX_COUNTRY]: (d) => ({ taxCountry: d.taxCountry }),
  [View.TAX_IDS]: vatFields,
  [View.VERIFYING_TAX_ID]: vatFields,
  [View.REGISTRATION]: (d) => ({
    registrationNumber: orNull(d.registrationNumber),
    registrationBody: orNull(d.registrationBody),
    registeredSince: d.registeredSince || null,
  }),
  [View.ADDRESS_APT_FLOOR]: (d) => addressFields(d.address, d.addressLine2),
  [View.CONTACT_INPUT]: (d) => ({
    contactEmail: orNull(d.contactEmail),
    contactPhone: orNull(d.contactPhone),
  }),
};

/** The PATCH for editing `step` alone, or `null` when it is not editable. */
export function stepPatch(step: View, draft: LegalEntityDraft): Patch | null {
  return STEP_PATCH[step]?.(draft) ?? null;
}

/** Whether `step` has what it needs to be left forwards. */
export function stepReady(step: View, d: LegalEntityDraft): boolean {
  switch (step) {
    case View.LEGAL_NAME:
      return d.legalName.trim() !== "";
    case View.REGISTRATION:
      return d.registrationNumber.trim() !== "" && d.registrationBody.trim() !== "";
    case View.ADDRESS_APT_FLOOR:
      return d.address !== null;
    default:
      return true;
  }
}

/** The POST body for a finished draft; `null` before a type is chosen. */
export function draftToEntityInput(d: LegalEntityDraft): LegalEntityInput | null {
  if (!d.type) return null;
  return {
    type: d.type,
    label: null,
    isDefault: false,
    legalName: d.legalName,
    tradingName: d.tradingName || null,
    dateOfBirth: d.dob || null,
    placeOfBirth: d.placeOfBirth || null,
    placeOfBirthPlaceId: d.placeOfBirthPlaceId || null,
    nationality: d.nationality || null,
    taxCountry: d.taxCountry,
    ...vatFields(d),
    registrationNumber: d.registrationNumber || null,
    registrationBody: d.registrationBody || null,
    registeredSince: d.registeredSince || null,
    contactEmail: orNull(d.contactEmail),
    contactPhone: orNull(d.contactPhone),
    ...addressFields(d.address, d.addressLine2),
  };
}

/**
 * The draft that opens `step` on an existing entity. Always carries the
 * entity's type: the legal-name step validates a company's one-word name
 * differently from a person's full name.
 */
export function prefillFrom(step: View, e: LegalEntityRecord): Partial<LegalEntityDraft> {
  const base = { type: e.type };
  switch (step) {
    case View.LEGAL_NAME:
      return { ...base, legalName: e.legalName };
    case View.TRADING_NAME:
      return { ...base, tradingName: e.tradingName ?? "" };
    case View.DOB:
      return { ...base, dob: e.dateOfBirth?.slice(0, 10) ?? "" };
    case View.PLACE_OF_BIRTH:
      return {
        ...base,
        placeOfBirth: e.placeOfBirth ?? "",
        placeOfBirthPlaceId: e.placeOfBirthPlaceId ?? null,
      };
    case View.NATIONALITY:
      return { ...base, nationality: e.nationality ?? "" };
    case View.TAX_COUNTRY:
      return { ...base, taxCountry: e.taxCountry };
    case View.TAX_IDS:
      return {
        ...base,
        taxCountry: e.taxCountry,
        taxId: e.taxId ?? "",
        vatId: e.vatId ?? "",
        vatValidation: {
          level: (e.vatIdValidation as TaxIdValidationState["level"]) ?? "none",
          name: e.vatIdValidatedName ?? null,
          authority: null,
          normalisedId: e.vatId ?? "",
        },
      };
    case View.REGISTRATION:
      return {
        ...base,
        registrationNumber: e.registrationNumber ?? "",
        registrationBody: e.registrationBody ?? "",
        registeredSince: e.registeredSince?.slice(0, 10) ?? "",
      };
    case View.CONTACT_INPUT:
      return { ...base, contactEmail: e.contactEmail ?? "", contactPhone: e.contactPhone ?? "" };
    default:
      return base;
  }
}
