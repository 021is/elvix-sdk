"use client";

/**
 * The registered address, then the optional contact details, wired to the
 * wizard's state. The address search starts with the address the tax
 * authority holds for the VAT ID already typed in (0.18), and a business
 * fills in any part Places left empty before it can continue: an invoice
 * needs all of it.
 */

import type { ReactNode } from "react";
import { useT } from "../locale/use-t";
import { needsBusinessSteps, View } from "./legal-entity-flow";
import type { WizardFlow } from "./legal-entity-steps";
import {
  AddressReviewView,
  AddressSearchView,
  ContactInputView,
  SingleTextView,
  YesNoView,
} from "./legal-entity-wizard-views";

/** VIES answers an address in several lines; a search wants one. */
export function searchQueryFrom(authorityAddress: string | null | undefined): string {
  return (authorityAddress ?? "")
    .split(/\s*\n\s*/)
    .filter(Boolean)
    .join(", ");
}

export function LegalEntityAddressStep({ flow }: { flow: WizardFlow }): ReactNode | null {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const step = flow.view;
  const nav = { onConfirm: () => flow.advance(step), onBack: () => flow.back(step) };
  switch (step) {
    case View.ADDRESS_SEARCH:
      return (
        <AddressSearchView
          initialQuery={draft.address ? "" : searchQueryFrom(draft.vatValidation.address)}
          onPick={(details) => {
            setField("address", details);
            flow.setView(View.ADDRESS_REVIEW);
          }}
          onBack={nav.onBack}
        />
      );
    case View.ADDRESS_REVIEW:
      return (
        <AddressReviewView
          details={draft.address}
          needsPostalCode={needsBusinessSteps(draft.type)}
          onFill={(details) => setField("address", details)}
          onConfirm={nav.onConfirm}
          onChange={() => flow.setView(View.ADDRESS_SEARCH)}
        />
      );
    case View.ADDRESS_APT_FLOOR:
      return (
        <SingleTextView
          title={t("legalEntities.addressAptTitle")}
          subtitle={t("legalEntities.addressAptSubtitle")}
          label={t("legalEntities.addressAptLabel")}
          placeholder={t("legalEntities.addressAptPlaceholder")}
          value={draft.addressLine2}
          onChange={(value) => setField("addressLine2", value)}
          {...nav}
          maxLength={240}
          optional
        />
      );
    case View.CONTACT_CHOICE:
      return (
        <YesNoView
          title={t("legalEntities.contactChoiceTitle")}
          subtitle={t("legalEntities.contactChoiceSubtitle")}
          onYes={() => flow.setView(View.CONTACT_INPUT)}
          onNo={flow.commit}
          onBack={nav.onBack}
          error={flow.error}
          yesLabel={t("legalEntities.contactYesCta")}
          noLabel={t("legalEntities.contactNoCta")}
        />
      );
    case View.CONTACT_INPUT:
      return (
        <ContactInputView
          email={draft.contactEmail}
          phone={draft.contactPhone}
          setEmail={(value) => setField("contactEmail", value)}
          setPhone={(value) => setField("contactPhone", value)}
          {...nav}
          saveLabel={t(
            flow.editing ? "legalEntities.saveChangesCta" : "legalEntities.saveEntityCta",
          )}
        />
      );
    default:
      return null;
  }
}
