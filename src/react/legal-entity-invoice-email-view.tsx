"use client";

/**
 * Where invoices for this entity are emailed (0.18, the invoice flow), one
 * optional field: a "Skip" while empty, a valid address or nothing. The
 * full flow asks email and phone together in its contact step; an invoice
 * needs only the email.
 */

import { useT } from "../locale/use-t";
import { FormField } from "./legal-entity-form-field";
import { invoiceEmailReady } from "./legal-entity-payload";
import { Subtitle } from "./legal-entity-primitives";
import { Heading, StepAction, WizardHeader } from "./legal-entity-step-chrome";
import { ErrorLine } from "./sign-in-controls";

export function InvoiceEmailView(props: {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  /** The flow's last step: the button saves the entity. */
  last: boolean;
  /** A failed save, shown here when this step saved. */
  error?: string | null;
}) {
  const t = useT();
  const ready = invoiceEmailReady(props.value);
  const empty = props.value.trim() === "";
  const confirm = () => ready && props.onConfirm();
  const label = props.last
    ? t("legalEntities.saveEntityCta")
    : t(empty ? "common.skip" : "common.continue");
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <WizardHeader onBack={props.onBack} />
      <Heading>{t("legalEntities.invoiceEmailTitle")}</Heading>
      <Subtitle>{t("legalEntities.invoiceEmailSubtitle")}</Subtitle>
      <div className="mt-4">
        <FormField
          label={t("legalEntities.contactEmailLabel")}
          type="email"
          placeholder={t("legalEntities.contactEmailPlaceholder")}
          value={props.value}
          onChange={props.onChange}
          error={ready ? null : t("legalEntities.contactEmailInvalid")}
          autoFocus
        />
      </div>
      <ErrorLine error={props.error ?? null} className="mt-3" />
      <StepAction
        label={label}
        disabled={!ready}
        onConfirm={confirm}
        hint={t("common.enterHint")}
      />
    </form>
  );
}
