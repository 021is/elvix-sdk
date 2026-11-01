"use client";

/**
 * The detail view's sections, one per part of an entity, each row tapping
 * into the wizard step that edits it (`onEdit(step)`).
 *
 * Inside an app the personal fields arrive empty with `withheld: true`
 * (0.18): they are write-only there, so their rows say where to see them
 * rather than "not set", and stay tappable to set a new value.
 */

import { useT } from "../locale/use-t";
import { findCountry } from "./countries";
import { formatIsoDate, renderNationality } from "./legal-entity-copy";
import { View } from "./legal-entity-flow";
import { DetailRow, DetailSection } from "./legal-entity-primitives";
import type { LegalEntityRecord } from "./legal-entity-schema";

export type SectionProps = {
  entity: LegalEntityRecord;
  onEdit: (step: View) => void;
};

/** The placeholder of a personal row: where to see it when withheld, else `key`'s copy. */
function usePersonal(entity: LegalEntityRecord) {
  const t = useT();
  return (key?: string) =>
    entity.withheld ? t("legalEntities.withheldInApps") : key ? t(key) : undefined;
}

export function IdentitySection({ entity, onEdit }: SectionProps) {
  const t = useT();
  const personal = usePersonal(entity);
  const isPerson = entity.type === "individual" || entity.type === "sole_prop";
  return (
    <DetailSection title={t("legalEntities.detailSectionIdentity")}>
      <DetailRow
        label={t("legalEntities.detailLegalName")}
        value={entity.legalName}
        onClick={() => onEdit(View.LEGAL_NAME)}
      />
      {entity.type !== "individual" && (
        <DetailRow
          label={t("legalEntities.detailTradingName")}
          value={entity.tradingName}
          placeholder={t("legalEntities.detailTradingNamePlaceholder")}
          onClick={() => onEdit(View.TRADING_NAME)}
        />
      )}
      {isPerson && (
        <>
          <DetailRow
            label={t("legalEntities.detailDob")}
            value={entity.dateOfBirth ? formatIsoDate(entity.dateOfBirth) : null}
            placeholder={personal()}
            onClick={() => onEdit(View.DOB)}
          />
          <DetailRow
            label={t("legalEntities.detailPlaceOfBirth")}
            value={entity.placeOfBirth}
            placeholder={personal("legalEntities.detailPlaceOfBirthPlaceholder")}
            onClick={() => onEdit(View.PLACE_OF_BIRTH)}
          />
          <DetailRow
            label={t("legalEntities.detailNationality")}
            value={renderNationality(entity.nationality)}
            placeholder={personal()}
            onClick={() => onEdit(View.NATIONALITY)}
          />
        </>
      )}
    </DetailSection>
  );
}

export function TaxSection({ entity, onEdit }: SectionProps) {
  const t = useT();
  const personal = usePersonal(entity);
  const c = findCountry(entity.taxCountry);
  const verified = entity.vatIdValidatedName ? ` · ${entity.vatIdValidatedName}` : "";
  return (
    <DetailSection title={t("legalEntities.detailSectionTax")}>
      <DetailRow
        label={t("legalEntities.detailTaxResidence")}
        value={c ? `${c.flag} ${c.name} (${c.code})` : entity.taxCountry}
        onClick={() => onEdit(View.TAX_COUNTRY)}
      />
      <DetailRow
        label={t("legalEntities.detailVatId")}
        value={entity.vatId ? `${entity.vatId}${verified}` : null}
        placeholder={t("legalEntities.detailVatIdPlaceholder")}
        onClick={() => onEdit(View.TAX_IDS)}
      />
      <DetailRow
        label={t("legalEntities.detailLocalTaxNumber")}
        value={entity.taxId}
        placeholder={
          entity.type === "individual"
            ? personal("legalEntities.detailLocalTaxNumberPlaceholder")
            : t("legalEntities.detailLocalTaxNumberPlaceholder")
        }
        onClick={() => onEdit(View.TAX_IDS)}
      />
    </DetailSection>
  );
}

export function RegistrationSection({ entity, onEdit }: SectionProps) {
  const t = useT();
  const personal = usePersonal(entity);
  const edit = () => onEdit(View.REGISTRATION);
  return (
    <DetailSection title={t("legalEntities.detailSectionRegistration")}>
      <DetailRow
        label={t("legalEntities.detailRegistrationNumber")}
        value={entity.registrationNumber}
        onClick={edit}
      />
      <DetailRow
        label={t("legalEntities.detailIssuingAuthority")}
        value={entity.registrationBody}
        onClick={edit}
      />
      <DetailRow
        label={t("legalEntities.detailRegisteredSince")}
        value={entity.registeredSince ? formatIsoDate(entity.registeredSince) : null}
        placeholder={personal()}
        onClick={edit}
      />
    </DetailSection>
  );
}

export function AddressSection({ entity }: SectionProps) {
  const t = useT();
  const personal = usePersonal(entity);
  // An individual's address is their home: withheld in apps like the rest.
  const hidden = entity.type === "individual" ? personal() : undefined;
  const code = entity.addressCountry;
  const country = code
    ? `${findCountry(code)?.flag ?? ""} ${entity.addressCountryName ?? code}`
    : null;
  return (
    <DetailSection title={t("legalEntities.detailSectionAddress")}>
      <DetailRow
        label={t("legalEntities.detailStreet")}
        value={entity.addressLine1}
        placeholder={hidden}
      />
      <DetailRow label={t("legalEntities.detailAptFloor")} value={entity.addressLine2} />
      <DetailRow
        label={t("legalEntities.detailCity")}
        value={entity.addressCity}
        placeholder={hidden}
      />
      <DetailRow label={t("legalEntities.detailPostalCode")} value={entity.addressPostalCode} />
      <DetailRow label={t("legalEntities.detailCountry")} value={country} />
    </DetailSection>
  );
}

/** Where e-invoices go: every country's Peppol id, Italy's SDI and PEC, Germany's Leitweg-ID. */
export function EInvoiceSection({ entity, onEdit }: SectionProps) {
  const t = useT();
  const row = (label: string, value: string | null | undefined) => (
    <DetailRow
      label={t(label)}
      value={value}
      placeholder={t("legalEntities.detailEInvoiceNone")}
      onClick={() => onEdit(View.E_INVOICE)}
    />
  );
  return (
    <DetailSection title={t("legalEntities.detailSectionEInvoice")}>
      {row("legalEntities.peppolIdLabel", entity.peppolId)}
      {entity.taxCountry === "IT" &&
        row("legalEntities.codiceDestinatarioLabel", entity.codiceDestinatario)}
      {entity.taxCountry === "IT" && row("legalEntities.pecAddressLabel", entity.pecAddress)}
      {entity.taxCountry === "DE" && row("legalEntities.leitwegIdLabel", entity.leitwegId)}
    </DetailSection>
  );
}

export function ContactSection({ entity, onEdit }: SectionProps) {
  const t = useT();
  const personal = usePersonal(entity);
  const edit = () => onEdit(View.CONTACT_INPUT);
  return (
    <DetailSection title={t("legalEntities.detailSectionContact")}>
      <DetailRow
        label={t("legalEntities.detailEmail")}
        value={entity.contactEmail}
        placeholder={t("legalEntities.detailEmailPlaceholder")}
        onClick={edit}
      />
      <DetailRow
        label={t("legalEntities.detailPhone")}
        value={entity.contactPhone}
        placeholder={personal("legalEntities.detailPhonePlaceholder")}
        onClick={edit}
      />
    </DetailSection>
  );
}
