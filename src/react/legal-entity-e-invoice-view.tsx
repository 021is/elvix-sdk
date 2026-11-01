"use client";

/**
 * Where a business's e-invoices go (0.18), optional. In the add flow only an
 * Italian or Belgian business sees it, with its country's fields: Italy's SDI
 * recipient code (codice destinatario) or certified email (PEC), Belgium's
 * Peppol id (`E_INVOICE_FIELDS_BY_COUNTRY` in legal-entity-flow.ts says why).
 * Opened from the detail view it shows all four fields, Germany's Leitweg-ID
 * (public bodies only) included, so any business can keep what it has.
 */

import { useT } from "../locale/use-t";
import { ElvixSaveButton, ElvixSaveRow } from "./elvix-save-button";
import { E_INVOICE_FIELDS_BY_COUNTRY, type EInvoiceField } from "./legal-entity-flow";
import { FormField } from "./legal-entity-form-field";
import { eInvoiceReady } from "./legal-entity-payload";
import { Heading, Subtitle, WizardHeader } from "./legal-entity-primitives";
import { CODICE_DESTINATARIO, LEITWEG_ID, PEPPOL_ID } from "./legal-entity-schema";
import { STACK_3 } from "./pane-layout";
import { ErrorLine } from "./sign-in-controls";
import type { LegalEntityDraft } from "./use-legal-entity-draft";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALL_FIELDS: readonly EInvoiceField[] = [
  "peppolId",
  "codiceDestinatario",
  "pecAddress",
  "leitwegId",
];

/** Why the pane asks, in the country's own terms; the detail view's edit is generic. */
const SUBTITLE_BY_COUNTRY: Record<string, string> = {
  IT: "legalEntities.eInvoiceSubtitleIT",
  BE: "legalEntities.eInvoiceSubtitleBE",
};

/** The fields shown: the country's own in the add flow, all four when editing. */
export function eInvoiceFieldsShown(country: string, all: boolean): readonly EInvoiceField[] {
  return all ? ALL_FIELDS : (E_INVOICE_FIELDS_BY_COUNTRY[country] ?? ALL_FIELDS);
}

export function EInvoiceView(props: {
  draft: LegalEntityDraft;
  setField: (key: EInvoiceField, value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  /** The flow's last step: the button saves the entity. */
  last?: boolean;
  /** A failed save, shown here when this step saved. */
  error?: string | null;
  /** Opened from the detail view: every field, whatever the country. */
  allFields?: boolean;
}) {
  const t = useT();
  const d = props.draft;
  const shown = eInvoiceFieldsShown(d.taxCountry, props.allFields ?? false);
  const ready = eInvoiceReady(d);
  const empty = shown.every((f) => !d[f].trim());
  const confirm = () => ready && props.onConfirm();
  const label = props.last
    ? t("legalEntities.saveEntityCta")
    : t(empty ? "common.skip" : "common.continue");
  const subtitle = props.allFields ? undefined : SUBTITLE_BY_COUNTRY[d.taxCountry];
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <WizardHeader onBack={props.onBack} />
      <Heading>{t("legalEntities.eInvoiceTitle")}</Heading>
      <Subtitle>{t(subtitle ?? "legalEntities.eInvoiceSubtitle")}</Subtitle>
      <div className={`mt-4 ${STACK_3} overflow-y-auto`}>
        <EInvoiceFields draft={d} shown={shown} setField={props.setField} />
      </div>
      <ErrorLine error={props.error ?? null} className="mt-3" />
      <ElvixSaveRow>
        <ElvixSaveButton
          state="idle"
          disabled={!ready}
          onClick={confirm}
          label={label}
          savedLabel={label}
          hint={t("common.enterHint")}
          className="!w-auto !px-5"
        />
      </ElvixSaveRow>
    </form>
  );
}

function EInvoiceFields(p: {
  draft: LegalEntityDraft;
  shown: readonly EInvoiceField[];
  setField: (key: EInvoiceField, value: string) => void;
}) {
  const t = useT();
  const d = p.draft;
  const bad = (v: string, rx: RegExp, key: string) =>
    v.trim() && !rx.test(v.trim()) ? t(key) : null;
  return (
    <>
      {p.shown.includes("peppolId") && (
        <FormField
          label={t("legalEntities.peppolIdLabel")}
          placeholder="0208:0123456789"
          value={d.peppolId}
          onChange={(v) => p.setField("peppolId", v)}
          maxLength={80}
          error={bad(d.peppolId, PEPPOL_ID, "legalEntities.peppolIdInvalid")}
          hint={t("legalEntities.peppolIdHint")}
        />
      )}
      {p.shown.includes("codiceDestinatario") && (
        <FormField
          label={t("legalEntities.codiceDestinatarioLabel")}
          placeholder="ABC1234"
          value={d.codiceDestinatario}
          onChange={(v) => p.setField("codiceDestinatario", v.toUpperCase())}
          maxLength={7}
          error={bad(d.codiceDestinatario, CODICE_DESTINATARIO, "legalEntities.codiceInvalid")}
        />
      )}
      {p.shown.includes("pecAddress") && (
        <FormField
          label={t("legalEntities.pecAddressLabel")}
          type="email"
          value={d.pecAddress}
          onChange={(v) => p.setField("pecAddress", v)}
          error={bad(d.pecAddress, EMAIL, "legalEntities.contactEmailInvalid")}
        />
      )}
      {p.shown.includes("leitwegId") && (
        <FormField
          label={t("legalEntities.leitwegIdLabel")}
          placeholder="04011000-1234512345-06"
          value={d.leitwegId}
          onChange={(v) => p.setField("leitwegId", v)}
          maxLength={46}
          error={bad(d.leitwegId, LEITWEG_ID, "legalEntities.leitwegIdInvalid")}
          hint={t("legalEntities.leitwegIdHint")}
        />
      )}
    </>
  );
}
