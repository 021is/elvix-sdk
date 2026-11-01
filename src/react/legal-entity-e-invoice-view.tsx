"use client";

/**
 * Where a business's e-invoices go (0.18), optional and skippable. Every
 * country can give a Peppol participant id; Italy also its SDI code
 * (codice destinatario) or a certified email (PEC); Germany a Leitweg-ID,
 * which only public bodies have. B2B e-invoicing is mandatory or arriving
 * across the EU (Italy since 2019, Belgium 2026, Germany receiving since
 * 2025), so an issuer needs these to reach the company at all.
 */

import { useT } from "../locale/use-t";
import { ElvixSaveButton, ElvixSaveRow } from "./elvix-save-button";
import { FormField } from "./legal-entity-form-field";
import { eInvoiceReady } from "./legal-entity-payload";
import { Heading, Subtitle, WizardHeader } from "./legal-entity-primitives";
import { CODICE_DESTINATARIO, LEITWEG_ID, PEPPOL_ID } from "./legal-entity-schema";
import { STACK_3 } from "./pane-layout";
import { ErrorLine } from "./sign-in-controls";
import type { LegalEntityDraft } from "./use-legal-entity-draft";

type Field = "peppolId" | "codiceDestinatario" | "pecAddress" | "leitwegId";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EInvoiceView(props: {
  draft: LegalEntityDraft;
  setField: (key: Field, value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  /** The flow's last step: the button saves the entity. */
  last?: boolean;
  /** A failed save, shown here when this step saved. */
  error?: string | null;
}) {
  const t = useT();
  const d = props.draft;
  const bad = (v: string, rx: RegExp, key: string) =>
    v.trim() && !rx.test(v.trim()) ? t(key) : null;
  const ready = eInvoiceReady(d);
  const confirm = () => ready && props.onConfirm();
  const label = t(props.last ? "legalEntities.saveEntityCta" : "common.continue");
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
      <Subtitle>{t("legalEntities.eInvoiceSubtitle")}</Subtitle>
      <div className={`mt-4 ${STACK_3} overflow-y-auto`}>
        <FormField
          label={t("legalEntities.peppolIdLabel")}
          placeholder="0208:0123456789"
          value={d.peppolId}
          onChange={(v) => props.setField("peppolId", v)}
          maxLength={80}
          error={bad(d.peppolId, PEPPOL_ID, "legalEntities.peppolIdInvalid")}
          hint={t("legalEntities.peppolIdHint")}
        />
        {d.taxCountry === "IT" && (
          <>
            <FormField
              label={t("legalEntities.codiceDestinatarioLabel")}
              placeholder="ABC1234"
              value={d.codiceDestinatario}
              onChange={(v) => props.setField("codiceDestinatario", v.toUpperCase())}
              maxLength={7}
              error={bad(d.codiceDestinatario, CODICE_DESTINATARIO, "legalEntities.codiceInvalid")}
            />
            <FormField
              label={t("legalEntities.pecAddressLabel")}
              type="email"
              value={d.pecAddress}
              onChange={(v) => props.setField("pecAddress", v)}
              error={bad(d.pecAddress, EMAIL, "legalEntities.contactEmailInvalid")}
            />
          </>
        )}
        {d.taxCountry === "DE" && (
          <FormField
            label={t("legalEntities.leitwegIdLabel")}
            placeholder="04011000-1234512345-06"
            value={d.leitwegId}
            onChange={(v) => props.setField("leitwegId", v)}
            maxLength={46}
            error={bad(d.leitwegId, LEITWEG_ID, "legalEntities.leitwegIdInvalid")}
            hint={t("legalEntities.leitwegIdHint")}
          />
        )}
      </div>
      <ErrorLine error={props.error ?? null} className="mt-3" />
      <ElvixSaveRow>
        <ElvixSaveButton
          state="idle"
          disabled={!ready}
          onClick={confirm}
          label={label}
          savedLabel={label}
          hint={t("legalEntities.eInvoiceSkipHint")}
          className="!w-auto !px-5"
        />
      </ElvixSaveRow>
    </form>
  );
}
