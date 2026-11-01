"use client";

/**
 * The add wizard's panes wired to the wizard's state: one switch per part of
 * the flow. `<ElvixLegalEntities>` and `<ElvixLegalEntityPicker>` both render
 * `<WizardStep>` (out of `elvix-legal-entities.tsx` in 0.18), so the two
 * cannot ask a company different questions.
 */

import type { ReactNode } from "react";
import { useT } from "../locale/use-t";
import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import { LegalEntityAddressStep } from "./legal-entity-address-step";
import { typeTitleCopy } from "./legal-entity-copy";
import { needsBusinessSteps, View } from "./legal-entity-flow";
import type { LegalEntityType } from "./legal-entity-schema";
import { VatIdView } from "./legal-entity-vat-id-view";
import { VerifyingTaxIdView } from "./legal-entity-verifying-view";
import {
  CountryView,
  DateView,
  isoYearsAgo,
  NationalityView,
  PlaceOfBirthView,
  RegistrationView,
  SingleTextView,
  TaxIdsView,
  TypeChoiceView,
} from "./legal-entity-wizard-views";
import type { useLegalEntities } from "./use-legal-entities";

export type WizardFlow = ReturnType<typeof useLegalEntities>;

const PERSON_STEPS: ReadonlySet<View> = new Set([
  View.TYPE_CHOICE,
  View.LEGAL_NAME,
  View.TRADING_NAME,
  View.DOB,
  View.PLACE_OF_BIRTH,
  View.NATIONALITY,
]);
const TAX_STEPS: ReadonlySet<View> = new Set([
  View.VAT_ID,
  View.TAX_COUNTRY,
  View.TAX_IDS,
  View.VERIFYING_TAX_ID,
  View.REGISTRATION,
]);
const ADDRESS_CONTACT_STEPS: ReadonlySet<View> = new Set([
  View.ADDRESS_SEARCH,
  View.ADDRESS_REVIEW,
  View.ADDRESS_APT_FLOOR,
  View.CONTACT_CHOICE,
  View.CONTACT_INPUT,
]);

/** Whether `view` is one of the add wizard's questions. */
export function isWizardStep(view: View): boolean {
  return PERSON_STEPS.has(view) || TAX_STEPS.has(view) || ADDRESS_CONTACT_STEPS.has(view);
}

/** The pane for the current wizard step, or `null` outside the wizard. */
export function WizardStep({
  flow,
  types,
}: {
  flow: WizardFlow;
  types?: readonly LegalEntityType[];
}): ReactNode | null {
  if (PERSON_STEPS.has(flow.view)) return <PersonStep flow={flow} types={types} />;
  if (TAX_STEPS.has(flow.view)) return <TaxStep flow={flow} />;
  if (ADDRESS_CONTACT_STEPS.has(flow.view)) return <LegalEntityAddressStep flow={flow} />;
  return null;
}

/** Who the entity is: type, names, and the personal details. */
function PersonStep({
  flow,
  types,
}: {
  flow: WizardFlow;
  types?: readonly LegalEntityType[];
}): ReactNode | null {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const step = flow.view;
  const nav = { onConfirm: () => flow.advance(step), onBack: () => flow.back(step) };
  switch (step) {
    case View.TYPE_CHOICE:
      return <TypeChoiceView types={types} onPick={flow.pickType} onBack={nav.onBack} />;
    case View.LEGAL_NAME:
      return <LegalNameStep flow={flow} />;
    case View.TRADING_NAME:
      return (
        <SingleTextView
          title={t("legalEntities.tradingNameTitle")}
          subtitle={t("legalEntities.tradingNameSubtitle")}
          label={t("legalEntities.tradingNameLabel")}
          placeholder={t("legalEntities.tradingNamePlaceholder")}
          value={draft.tradingName}
          onChange={(value) => setField("tradingName", value)}
          {...nav}
          maxLength={180}
          optional
        />
      );
    case View.DOB:
      return (
        <DateView
          title={t("legalEntities.dobTitle")}
          subtitle={t("legalEntities.dobSubtitle")}
          label={t("legalEntities.dobTitle")}
          value={draft.dob}
          onChange={(value) => setField("dob", value)}
          {...nav}
          minDate={isoYearsAgo(120)}
          maxDate={isoYearsAgo(18)}
          outOfRangeMessage={t("legalEntities.dobAgeError")}
        />
      );
    case View.PLACE_OF_BIRTH:
      return (
        <PlaceOfBirthView
          label={draft.placeOfBirth}
          placeId={draft.placeOfBirthPlaceId}
          onPick={(label, placeId) => {
            setField("placeOfBirth", label);
            setField("placeOfBirthPlaceId", placeId);
          }}
          onClear={() => {
            setField("placeOfBirth", "");
            setField("placeOfBirthPlaceId", null);
          }}
          {...nav}
        />
      );
    case View.NATIONALITY:
      return (
        <NationalityView
          value={draft.nationality}
          onChange={(value) => setField("nationality", value)}
          {...nav}
        />
      );
    default:
      return null;
  }
}

const LEGAL_NAME_SUBTITLE: Record<LegalEntityType, string> = {
  company: "legalEntities.legalNameSubtitleCompany",
  sole_prop: "legalEntities.legalNameSubtitleSoleProp",
  individual: "legalEntities.legalNameSubtitleIndividual",
};

/** The legal name, whose wording and validation depend on the entity type. */
function LegalNameStep({ flow }: { flow: WizardFlow }) {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const company = draft.type === "company";
  return (
    <SingleTextView
      title={typeTitleCopy(draft.type, View.LEGAL_NAME, t)}
      subtitle={t(LEGAL_NAME_SUBTITLE[draft.type ?? "individual"])}
      label={t("legalEntities.legalNameLabel")}
      placeholder={t(
        company
          ? "legalEntities.legalNamePlaceholderCompany"
          : "legalEntities.legalNamePlaceholderPerson",
      )}
      value={draft.legalName}
      onChange={(value) => setField("legalName", value)}
      onConfirm={() => flow.advance(View.LEGAL_NAME)}
      onBack={() => flow.back(View.LEGAL_NAME)}
      required
      maxLength={180}
      minLength={2}
      requireLetter
      requireWords={company ? undefined : 2}
      invalidMessage={t(
        company ? "legalEntities.legalNameInvalidCompany" : "legalEntities.legalNameInvalidPerson",
      )}
    />
  );
}

/** Where the entity pays tax: VAT ID, country, identifiers, registration. */
function TaxStep({ flow }: { flow: WizardFlow }): ReactNode | null {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const step = flow.view;
  const nav = { onConfirm: () => flow.advance(step), onBack: () => flow.back(step) };
  switch (step) {
    case View.VAT_ID:
      return (
        <VatIdView
          vatId={draft.vatId}
          country={draft.taxCountry}
          setVatId={(value) => setField("vatId", value)}
          setCountry={(value) => setField("taxCountry", value)}
          onConfirm={flow.confirmVatId}
          onBack={nav.onBack}
          onNoVatId={draft.type === "sole_prop" ? flow.chooseNoVatId : undefined}
        />
      );
    case View.TAX_COUNTRY:
      return (
        <CountryView
          title={t("legalEntities.taxCountryTitle")}
          subtitle={t("legalEntities.taxCountrySubtitle")}
          value={draft.taxCountry}
          onChange={(value) => setField("taxCountry", value)}
          {...nav}
          restrictTo={TAX_VALIDATABLE_COUNTRIES}
          required
        />
      );
    case View.TAX_IDS:
      return (
        <TaxIdsView
          entityType={draft.type}
          // A sole prop who said "No VAT ID" is not asked for one again.
          showVat={!(needsBusinessSteps(draft.type) && draft.withoutVatId)}
          country={draft.taxCountry}
          taxId={draft.taxId}
          vatId={draft.vatId}
          vatValidation={draft.vatValidation}
          setTaxId={(value) => setField("taxId", value)}
          setVatId={(value) => setField("vatId", value)}
          setVatValidation={(value) => setField("vatValidation", value)}
          {...nav}
        />
      );
    case View.VERIFYING_TAX_ID:
      return (
        <VerifyingTaxIdView
          country={draft.taxCountry}
          vatId={draft.vatId}
          validation={draft.vatValidation}
          onResult={flow.verified}
          onPass={nav.onConfirm}
          // An edit from the detail view goes back to its field, not to the detail.
          onBack={flow.editing ? () => flow.setView(View.TAX_IDS) : nav.onBack}
        />
      );
    case View.REGISTRATION:
      return (
        <RegistrationView
          country={draft.taxCountry}
          number={draft.registrationNumber}
          body={draft.registrationBody}
          since={draft.registeredSince}
          setNumber={(value) => setField("registrationNumber", value)}
          setBody={(value) => setField("registrationBody", value)}
          setSince={(value) => setField("registeredSince", value)}
          {...nav}
        />
      );
    default:
      return null;
  }
}
