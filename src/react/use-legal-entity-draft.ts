"use client";

import { useCallback, useMemo, useState } from "react";

import type { TaxIdValidationState } from "./elvix-tax-id-input";
import type { LegalEntityType } from "./legal-entity-schema";
import type { PlaceDetails } from "./legal-entity-types";

/**
 * The entity the user is currently entering or editing.
 *
 * WHY A HOOK: this was eighteen separate `useState` calls in the component,
 * with a nineteenth function that reset all of them by hand. Every pane then
 * received its slice as individual props, and every handler read and wrote
 * individual setters, so adding one field meant touching five places and
 * forgetting the reset was silent — the next entity simply started with the
 * previous one's data still in it.
 *
 * As one object, the draft has one shape, one reset, and one prefill.
 */

export type LegalEntityDraft = {
  type: LegalEntityType | null;
  legalName: string;
  tradingName: string;
  dob: string;
  placeOfBirth: string;
  placeOfBirthPlaceId: string | null;
  nationality: string;
  taxCountry: string;
  taxId: string;
  vatId: string;
  vatValidation: TaxIdValidationState;
  registrationNumber: string;
  registrationBody: string;
  registeredSince: string;
  address: PlaceDetails | null;
  addressLine2: string;
  contactEmail: string;
  contactPhone: string;
};

const EMPTY_VAT_VALIDATION: TaxIdValidationState = {
  level: "none",
  name: null,
  authority: null,
  normalisedId: "",
};

/**
 * A blank draft. Built fresh each time rather than shared, because
 * `vatValidation` is an object and a shared constant would be mutated across
 * resets.
 */
export function emptyDraft(): LegalEntityDraft {
  return {
    type: null,
    legalName: "",
    tradingName: "",
    dob: "",
    placeOfBirth: "",
    placeOfBirthPlaceId: null,
    nationality: "",
    taxCountry: "",
    taxId: "",
    vatId: "",
    vatValidation: { ...EMPTY_VAT_VALIDATION },
    registrationNumber: "",
    registrationBody: "",
    registeredSince: "",
    address: null,
    addressLine2: "",
    contactEmail: "",
    contactPhone: "",
  };
}

export type LegalEntityDraftApi = {
  draft: LegalEntityDraft;
  /**
   * Update one field. Typed so a typo in the key, or a value of the wrong
   * type for that key, is a compile error rather than a silently ignored
   * write.
   */
  setField: <K extends keyof LegalEntityDraft>(key: K, value: LegalEntityDraft[K]) => void;
  /** Back to blank. One call, so a new field cannot be forgotten here. */
  reset: () => void;
  /** Blank, then these fields: opening one step to edit an existing entity. */
  prefill: (fields: Partial<LegalEntityDraft>) => void;
};

export function useLegalEntityDraft(): LegalEntityDraftApi {
  const [draft, setDraft] = useState<LegalEntityDraft>(emptyDraft);

  const setField = useCallback(
    <K extends keyof LegalEntityDraft>(key: K, value: LegalEntityDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => setDraft(emptyDraft()), []);
  const prefill = useCallback(
    (fields: Partial<LegalEntityDraft>) => setDraft({ ...emptyDraft(), ...fields }),
    [],
  );

  return useMemo(() => ({ draft, setField, reset, prefill }), [draft, setField, reset, prefill]);
}
