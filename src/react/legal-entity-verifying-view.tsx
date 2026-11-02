"use client";

/**
 * `<VerifyingTaxIdView>`: the pane between a typed VAT ID and the next step.
 * Asks the authority live (`useTaxCheck`), shows a spinner, then:
 *
 *   live    → ✓ "Verified as {name}" and moves on by itself
 *   format  → ⚠ "Authority unreachable" + Continue anyway (elvix re-checks
 *              on save)
 *   invalid → ✗ "Not registered" + Back to fix it
 *
 * Every settled verdict goes to `onResult` before anything moves on, so the
 * wizard can prefill the legal name and the address search from it (0.18).
 * Out of `legal-entity-wizard-views.tsx` in 0.18.
 */

import { useEffect } from "react";
import { useT } from "../locale/use-t";
import { findCountry } from "./countries";
import { ElvixSaveButton, ElvixSaveRow } from "./elvix-save-button";
import type { TaxIdValidationState } from "./elvix-tax-id-input";
import { Heading, Phase, Subtitle, VerifyingBadge, WizardHeader } from "./legal-entity-primitives";
import { useStableCallback } from "./use-stable-callback";
import { useTaxCheck } from "./use-tax-check";

type T = ReturnType<typeof useT>;

/** What the pane is showing: still asking, or one of the three verdicts. */
const Pane = {
  CHECKING: "checking",
  LIVE: "live",
  INVALID: "invalid",
  FORMAT: "format",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

function paneOf(phase: Phase, level: TaxIdValidationState["level"]): Pane {
  if (phase === Phase.CHECKING) return Pane.CHECKING;
  if (level === Pane.LIVE || level === Pane.INVALID) return level;
  return Pane.FORMAT;
}

const HEADING: Record<Pane, string> = {
  [Pane.CHECKING]: "legalEntities.verifyHeadingChecking",
  [Pane.LIVE]: "legalEntities.verifyHeadingLive",
  [Pane.INVALID]: "legalEntities.verifyHeadingInvalid",
  [Pane.FORMAT]: "legalEntities.verifyHeadingFormat",
};

type Asked = { country: string; vatId: string };

function subtitleOf(pane: Pane, asked: Asked, r: TaxIdValidationState, t: T): string {
  const authority = r.authority ?? t("legalEntities.authorityFallback");
  switch (pane) {
    case Pane.CHECKING:
      return t("legalEntities.verifySubtitleChecking", {
        vatId: asked.vatId,
        country: findCountry(asked.country)?.name ?? asked.country,
      });
    case Pane.LIVE:
      return r.name
        ? t("legalEntities.verifySubtitleLiveNamed", { authority, name: r.name })
        : t("legalEntities.verifySubtitleLive", { authority });
    case Pane.INVALID:
      return t("legalEntities.verifySubtitleInvalid", { authority, vatId: asked.vatId });
    default:
      return t("legalEntities.verifySubtitleFormat", { authority });
  }
}

export function VerifyingTaxIdView({
  country,
  vatId,
  validation,
  onResult,
  onPass,
  onBack,
}: {
  country: string;
  vatId: string;
  validation: TaxIdValidationState;
  /** Every settled verdict, before the pane moves on. */
  onResult: (result: TaxIdValidationState) => void;
  onPass: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const { phase, result } = useTaxCheck(country, vatId, validation);
  const pane = paneOf(phase, result.level);
  const report = useStableCallback(onResult);
  const pass = useStableCallback(onPass);

  useEffect(() => {
    if (pane !== Pane.CHECKING) report(result);
    if (pane !== Pane.LIVE) return;
    // A short beat on the tick, so the confirmation registers before moving on.
    const handle = setTimeout(pass, 850);
    return () => clearTimeout(handle);
  }, [pane, result, report, pass]);

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} backLabel={t("legalEntities.editTaxIdsBackLabel")} />
      <Heading>{t(HEADING[pane])}</Heading>
      <Subtitle>{subtitleOf(pane, { country, vatId }, result, t)}</Subtitle>
      <div className="mt-6 grid flex-1 place-items-center">
        <VerifyingBadge phase={phase} level={result.level} />
      </div>
      <VerdictActions pane={pane} onBack={onBack} onPass={onPass} />
    </div>
  );
}

function VerdictActions(p: { pane: Pane; onBack: () => void; onPass: () => void }) {
  const t = useT();
  if (p.pane === Pane.INVALID) {
    return (
      <ElvixSaveRow>
        <ElvixSaveButton
          state="idle"
          onClick={p.onBack}
          label={t("legalEntities.fixVatCta")}
          savedLabel={t("legalEntities.fixVatCta")}
          hint={null}
          className="!w-auto !px-5"
        />
      </ElvixSaveRow>
    );
  }
  if (p.pane !== Pane.FORMAT) return null;
  return (
    <ElvixSaveRow
      leading={
        <button
          type="button"
          onClick={p.onBack}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("common.back")}
        </button>
      }
    >
      <ElvixSaveButton
        state="idle"
        onClick={p.onPass}
        label={t("legalEntities.continueAnywayCta")}
        savedLabel={t("common.continue")}
        hint={null}
        className="!w-auto !px-5"
      />
    </ElvixSaveRow>
  );
}
