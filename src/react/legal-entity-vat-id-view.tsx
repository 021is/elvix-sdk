"use client";

/**
 * `<VatIdView>`: a business's first question (0.18), its VAT ID. The prefix
 * names the tax country (`DE…` is Germany, `CHE…` Switzerland), so a VAT
 * holder is not asked for it; the three registers whose numbers are bare
 * digits (Norway, Australia, Brazil) are offered beside the field instead.
 * A sole proprietor without one takes "No VAT ID" to the tax-country route.
 */

import { useT } from "../locale/use-t";
import { findCountry } from "./countries";
import { ElvixInput } from "./elvix-input";
import { Subtitle } from "./legal-entity-primitives";
import { Heading, StepAction, WizardHeader } from "./legal-entity-step-chrome";
import { STACK_3 } from "./pane-layout";
import { vatIdFormatMatches } from "./tax-validation";
import { countryFromVatId } from "./vat-prefix";

/** Registers whose VAT-like numbers carry no country prefix. */
const BARE_NUMBER_COUNTRIES = ["NO", "AU", "BR"] as const;

type T = ReturnType<typeof useT>;

/** Why Continue is off, worded; `null` when the VAT ID can be checked. */
export function vatIdBlockReason(vatId: string, country: string, t: T): string | null {
  if (!vatId.trim()) return null;
  if (!country) return t("legalEntities.vatIdCountryNeeded");
  if (!vatIdFormatMatches(country, vatId)) return t("legalEntities.blockReasonVatFormat");
  return null;
}

export function VatIdView({
  vatId,
  country,
  setVatId,
  setCountry,
  onConfirm,
  onBack,
  onNoVatId,
}: {
  vatId: string;
  country: string;
  setVatId: (value: string) => void;
  setCountry: (code: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  /** Only a sole proprietor may have none; absent for a company. */
  onNoVatId?: () => void;
}) {
  const t = useT();
  const fromPrefix = countryFromVatId(vatId);
  const blockReason = vatIdBlockReason(vatId, country, t);
  const canContinue = vatId.trim() !== "" && blockReason === null;
  const type = (value: string) => {
    setVatId(value);
    const named = countryFromVatId(value);
    if (named) setCountry(named);
  };

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onConfirm();
      }}
    >
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.vatIdTitle")}</Heading>
      <Subtitle>{t("legalEntities.vatIdSubtitle")}</Subtitle>
      <div className={`mt-4 ${STACK_3}`}>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.vatIdLabel")}
          </span>
          <ElvixInput
            type="text"
            value={vatId}
            onChange={(e) => type(e.target.value)}
            placeholder="DE129273398"
            maxLength={40}
            autoComplete="off"
            autoFocus
            hasError={blockReason !== null && Boolean(country)}
          />
        </label>
        {fromPrefix ? (
          <p className="text-[12.5px] text-fg-2">
            {findCountry(fromPrefix)?.flag} {findCountry(fromPrefix)?.name}
          </p>
        ) : (
          vatId.trim() !== "" && <BareNumberCountry country={country} onPick={setCountry} />
        )}
      </div>
      <StepAction
        label={t("common.continue")}
        disabled={!canContinue}
        onConfirm={onConfirm}
        leading={onNoVatId && <NoVatIdLink onClick={onNoVatId} />}
      >
        {blockReason && <span className="text-[12px] text-fg-3">{blockReason}</span>}
      </StepAction>
    </form>
  );
}

/** Which register issued a number without a prefix. */
function BareNumberCountry({ country, onPick }: { country: string; onPick: (c: string) => void }) {
  const t = useT();
  return (
    <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">{t("legalEntities.vatIdCountryNeeded")}</legend>
      {BARE_NUMBER_COUNTRIES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={country === code}
          onClick={() => onPick(code)}
          className="elvix-row elvix-row-title px-3 py-1.5 text-[13px] font-medium cursor-pointer"
        >
          {findCountry(code)?.flag} {findCountry(code)?.name}
        </button>
      ))}
    </fieldset>
  );
}

function NoVatIdLink({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
    >
      {t("legalEntities.noVatIdCta")}
    </button>
  );
}
