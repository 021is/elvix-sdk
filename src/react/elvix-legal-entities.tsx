"use client";

/**
 * `<ElvixLegalEntities>` — single-frame wizard for managing a user's
 * legal entities (individual / sole prop / company) used for
 * invoicing + KYC + tax filings. Mirrors `<ElvixAddressBook>`'s
 * architecture exactly: list ↔ add/edit panes ↔ detail with tap-to-
 * edit per row, all transitions cross-fade inside a single
 * `<ElvixCard>` frame.
 *
 * Wizard flow:
 *
 *   empty → list ─┬─→ delete-confirm → deleting
 *                 ├─→ default-confirm
 *                 └─→ detail (tap any row → matching edit pane)
 *
 *   add ─→ type-choice (Individual / Sole prop / Company)
 *          → legal-name → trading-name? → dob? → place-of-birth?
 *          → nationality? → tax-country → tax-ids → registration?
 *          → address-search → address-review → address-apt-floor
 *          → contact-choice → [contact-input] → saving → list
 *
 * Per-type branching:
 *   - Individual:  skips trading-name + registration
 *   - Sole prop:   shows everything
 *   - Company:     skips dob + place-of-birth + nationality
 *
 * The step order is `legal-entity-flow.ts` (tested), what each step reads
 * and writes is `legal-entity-payload.ts`, and state plus requests are
 * `use-legal-entities.ts`. Every editable row on the detail view re-enters
 * its step with the entity prefilled; that step's confirm then PATCHes the
 * one field instead of moving on.
 */

import { AnimatePresence } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useT } from "../locale/use-t";
import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import { MaybeCard } from "./elvix-card";
import { typeTitleCopy } from "./legal-entity-copy";
import {
  DefaultConfirmView,
  DeleteConfirmView,
  DetailView,
  ListView,
} from "./legal-entity-detail-views";
import { View } from "./legal-entity-flow";
import { EmptyState, SavingView } from "./legal-entity-primitives";
import type { LegalEntityRecord } from "./legal-entity-schema";
import {
  AddressReviewView,
  AddressSearchView,
  ContactInputView,
  CountryView,
  DateView,
  isoYearsAgo,
  NationalityView,
  PlaceOfBirthView,
  RegistrationView,
  SingleTextView,
  TaxIdsView,
  TypeChoiceView,
  VerifyingTaxIdView,
  YesNoView,
} from "./legal-entity-wizard-views";
import { type ElvixLegalEntitiesResult, ReturnTo, useLegalEntities } from "./use-legal-entities";
import { FadePane } from "./wizard-panes";

export type { ElvixLegalEntitiesResult };

export type ElvixLegalEntitiesProps = {
  /** Render inside an <ElvixCard>. Default true; pass false for bare (no chrome). */
  card?: boolean;
  /** Fixed frame height. Defaults to 580. */
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Frame width. Defaults to "100%". */
  width?: number | string;
  /** Optional callback fired after a successful save / delete. */
  onChange?: (entities: LegalEntityRecord[]) => void;
  /** Fires on every terminal save / delete outcome. Safe payload:
   *  count only — never the entity rows themselves. */
  onResult?: (result: ElvixLegalEntitiesResult) => void;
};

type Flow = ReturnType<typeof useLegalEntities>;

export function ElvixLegalEntities({
  height,
  minHeight,
  maxHeight,
  width = "100%",
  onChange,
  onResult,
  card,
}: ElvixLegalEntitiesProps) {
  const t = useT();
  const flow = useLegalEntities({ onChange, onResult });
  // Default height clamps to the viewport so the card never overflows the
  // AccountStage chrome on shorter screens; an explicit `height` still wins.
  const frameStyle: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    ...(height
      ? { height: `${height}px` }
      : {
          height: "min(540px, 66dvh)",
          minHeight: minHeight ?? 340,
          maxHeight: maxHeight ?? 700,
        }),
  };

  return (
    <div style={frameStyle} className="mx-auto">
      <MaybeCard card={card} className="h-full">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence initial={false}>
            {flow.loading ? (
              <FadePane key="loading">
                <div className="grid h-full place-items-center text-fg-3 text-sm">
                  {t("common.loading")}
                </div>
              </FadePane>
            ) : (
              <FadePane key={flow.view} fadeEdges={flow.view === View.LIST}>
                <EntityPane flow={flow} />
              </FadePane>
            )}
          </AnimatePresence>
        </div>
      </MaybeCard>
    </div>
  );
}

const PERSON_STEPS: ReadonlySet<View> = new Set([
  View.TYPE_CHOICE,
  View.LEGAL_NAME,
  View.TRADING_NAME,
  View.DOB,
  View.PLACE_OF_BIRTH,
  View.NATIONALITY,
]);
const TAX_STEPS: ReadonlySet<View> = new Set([
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

/** The pane for the current view, by the part of the flow it belongs to. */
function EntityPane({ flow }: { flow: Flow }) {
  if (PERSON_STEPS.has(flow.view)) return <PersonStep flow={flow} />;
  if (TAX_STEPS.has(flow.view)) return <TaxStep flow={flow} />;
  if (ADDRESS_CONTACT_STEPS.has(flow.view)) return <AddressContactStep flow={flow} />;
  return <ManagePane flow={flow} />;
}

/** The list, one entity's detail, and the delete / default confirmations. */
function ManagePane({ flow }: { flow: Flow }): ReactNode | null {
  const t = useT();
  const { inspecting: e } = flow;
  switch (flow.view) {
    case View.EMPTY:
      return <EmptyState onAdd={flow.openAdd} />;
    case View.LIST:
      return (
        <ListView
          entities={flow.entities}
          onAdd={flow.openAdd}
          onOpen={flow.openDetail}
          onDelete={flow.askDelete}
          onToggleDefault={(id, current) => flow.askDefault(id, !current, ReturnTo.LIST)}
        />
      );
    case View.DETAIL:
      return (
        <DetailView
          entity={e}
          onBack={flow.closeDetail}
          onDelete={() => e && flow.askDelete(e.id)}
          onToggleDefault={() => e && flow.askDefault(e.id, !e.isDefault, ReturnTo.DETAIL)}
          onEditLegalName={() => flow.editStep(View.LEGAL_NAME)}
          onEditTradingName={() => flow.editStep(View.TRADING_NAME)}
          onEditDob={() => flow.editStep(View.DOB)}
          onEditPlaceOfBirth={() => flow.editStep(View.PLACE_OF_BIRTH)}
          onEditNationality={() => flow.editStep(View.NATIONALITY)}
          onEditTaxCountry={() => flow.editStep(View.TAX_COUNTRY)}
          onEditTaxIds={() => flow.editStep(View.TAX_IDS)}
          onEditRegistration={() => flow.editStep(View.REGISTRATION)}
          onEditContact={() => flow.editStep(View.CONTACT_INPUT)}
        />
      );
    case View.DELETE_CONFIRM:
      return (
        <DeleteConfirmView
          entity={flow.deleting}
          error={flow.error}
          onCancel={flow.cancelDelete}
          onConfirm={flow.confirmDelete}
        />
      );
    case View.DELETING:
      return <SavingView label={t("legalEntities.deletingEntityLabel")} />;
    case View.DEFAULT_CONFIRM:
      return (
        <DefaultConfirmView
          entity={flow.defaultEntity}
          setting={flow.defaultIntent?.setting ?? true}
          error={flow.error}
          onCancel={flow.cancelDefault}
          onConfirm={flow.confirmDefault}
        />
      );
    case View.SAVING:
      return <SavingView label={t("legalEntities.savingEntityLabel")} />;
    default:
      return null;
  }
}

/** Who the entity is: type, names, and the personal details. */
function PersonStep({ flow }: { flow: Flow }): ReactNode | null {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const step = flow.view;
  const nav = { onConfirm: () => flow.advance(step), onBack: () => flow.back(step) };
  switch (step) {
    case View.TYPE_CHOICE:
      return <TypeChoiceView onPick={flow.pickType} onBack={nav.onBack} />;
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

/** The legal name, whose wording and validation depend on the entity type. */
function LegalNameStep({ flow }: { flow: Flow }) {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const company = draft.type === "company";
  const subtitleKey = company
    ? "legalEntities.legalNameSubtitleCompany"
    : draft.type === "sole_prop"
      ? "legalEntities.legalNameSubtitleSoleProp"
      : "legalEntities.legalNameSubtitleIndividual";
  return (
    <SingleTextView
      title={typeTitleCopy(draft.type, "legal-name", t)}
      subtitle={t(subtitleKey)}
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

/** Where the entity pays tax: country, identifiers, registration. */
function TaxStep({ flow }: { flow: Flow }): ReactNode | null {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const step = flow.view;
  const nav = { onConfirm: () => flow.advance(step), onBack: () => flow.back(step) };
  switch (step) {
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
          onPass={nav.onConfirm}
          onBack={() => flow.setView(View.TAX_IDS)}
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

/** The registered address, then the optional contact details. */
function AddressContactStep({ flow }: { flow: Flow }): ReactNode | null {
  const t = useT();
  const { draft, setField } = flow.draftApi;
  const step = flow.view;
  const nav = { onConfirm: () => flow.advance(step), onBack: () => flow.back(step) };
  switch (step) {
    case View.ADDRESS_SEARCH:
      return (
        <AddressSearchView
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
