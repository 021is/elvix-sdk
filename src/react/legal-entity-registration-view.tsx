"use client";

/**
 * The register a business is recorded in: its number, the issuing authority
 * and since when. Optional since 0.18 (an invoice does not carry the buyer's
 * register: VAT Directive art. 226), so the pane is a "Skip" while empty; a
 * number that is given must still match its country's format. Out of
 * `legal-entity-wizard-views.tsx`, which is over its size limit.
 */

import { useT } from "../locale/use-t";
import { ElvixInput } from "./elvix-input";
import { regNumberFormatHint, regNumberPlaceholder } from "./legal-entity-copy";
import { Subtitle } from "./legal-entity-primitives";
import { Heading, StepAction, WizardHeader } from "./legal-entity-step-chrome";
import { STACK_3 } from "./pane-layout";
import { registrationNumberMatches } from "./tax-validation";

type Props = {
  country: string;
  number: string;
  body: string;
  since: string;
  setNumber: (v: string) => void;
  setBody: (v: string) => void;
  setSince: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
};

/** What the pane may continue with: nothing at all, or a number in its country's format. */
export function registrationPaneState(p: Pick<Props, "country" | "number" | "body" | "since">) {
  const today = new Date().toISOString().slice(0, 10);
  const sinceOk =
    p.since === "" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(p.since) && p.since <= today && p.since >= "1900-01-01");
  const number = p.number.trim();
  const numberOk = number === "" || registrationNumberMatches(p.country, number);
  const empty = number === "" && p.body.trim() === "" && p.since === "";
  return { sinceOk, numberOk, empty, valid: sinceOk && numberOk };
}

export function RegistrationView(props: Props) {
  const t = useT();
  const state = registrationPaneState(props);
  const confirm = () => state.valid && props.onConfirm();
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <WizardHeader onBack={props.onBack} />
      <Heading>{t("legalEntities.registrationTitle")}</Heading>
      <Subtitle>{t("legalEntities.registrationSubtitle")}</Subtitle>
      <div className={`mt-4 ${STACK_3}`}>
        <NumberField {...props} showError={!state.numberOk} />
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.issuingAuthorityLabel")}
          </span>
          <ElvixInput
            type="text"
            value={props.body}
            onChange={(e) => props.setBody(e.target.value)}
            placeholder={t("legalEntities.issuingAuthorityPlaceholder")}
            maxLength={180}
          />
        </label>
        <SinceField since={props.since} setSince={props.setSince} ok={state.sinceOk} />
      </div>
      <StepAction
        label={t(state.empty ? "common.skip" : "common.continue")}
        disabled={!state.valid}
        onConfirm={confirm}
      />
    </form>
  );
}

function NumberField(p: Props & { showError: boolean }) {
  const t = useT();
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
        {t("legalEntities.registrationNumberLabel")}
      </span>
      <ElvixInput
        type="text"
        value={p.number}
        onChange={(e) => p.setNumber(e.target.value)}
        placeholder={regNumberPlaceholder(p.country)}
        autoFocus
        maxLength={80}
        hasError={p.showError}
      />
      {p.showError && (
        <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
          {regNumberFormatHint(p.country, t)}
        </span>
      )}
    </label>
  );
}

function SinceField(p: { since: string; setSince: (v: string) => void; ok: boolean }) {
  const t = useT();
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
        {t("legalEntities.registeredSinceLabel")}
      </span>
      <ElvixInput
        type="date"
        value={p.since}
        onChange={(e) => p.setSince(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
        min="1900-01-01"
        hasError={!p.ok}
      />
      {!p.ok && (
        <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
          {t("legalEntities.registeredSinceRangeError")}
        </span>
      )}
    </label>
  );
}
