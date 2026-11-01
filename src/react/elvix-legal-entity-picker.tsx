"use client";

/**
 * `<ElvixLegalEntityPicker>` (0.18): choose one of the user's legal
 * entities for something the host does with it (an invoice made out to a
 * company, a payee), or add one inline.
 *
 *   <ElvixLegalEntityPicker
 *     types={["sole_prop", "company"]}
 *     selectedId={id}
 *     onPick={(entity) => setId(entity.id)}
 *   />
 *
 * Controlled: the host holds the pick (`selectedId`) and ends the flow with
 * its own Continue. There is no confirm button and no done pane; a tap picks
 * and the list stays drawn, the picked row tinted. With nothing picked, the
 * default entity (or the only one) is shown picked once, so the host's
 * Continue is ready. "Add a company" runs `<ElvixLegalEntities>`' own add
 * wizard in place and comes back with the new entity picked.
 *
 * A tap (or a new entity) grants the host's application read access to that
 * one entity for `purpose`, so its backend reads it from elvix by id
 * (`getElvixLegalEntity`), never from what a browser sent; `onPick` then says
 * `granted: true`. The pre-selection grants nothing (`granted: false`): the
 * host's Continue grants it with `useElvixLegalEntityGrant()`. The user can
 * revoke a grant in their elvix account.
 *
 * Styled by CSS variables on any ancestor: `--elvix-row`,
 * `--elvix-row-hover`, `--elvix-picked`, `--elvix-picked-text`,
 * `--elvix-radius`, `--elvix-focus`, and the field variables
 * (`src/styles/rows.css`, `src/styles/fields.css`).
 */

import { AnimatePresence } from "framer-motion";
import { useT } from "../locale/use-t";
import { MaybeCard } from "./elvix-card";
import { FlowKind, needsBusinessSteps, View } from "./legal-entity-flow";
import { PickerList, PickerLoadFailed } from "./legal-entity-picker-views";
import { SavingView } from "./legal-entity-primitives";
import {
  LegalEntityPurpose,
  type LegalEntityRecord,
  type LegalEntityType,
} from "./legal-entity-schema";
import { isWizardStep, type WizardFlow, WizardStep } from "./legal-entity-steps";
import { useLegalEntities } from "./use-legal-entities";
import {
  type ElvixLegalEntityPickerResult,
  type LegalEntityPick,
  useLegalEntityPicks,
} from "./use-legal-entity-picks";
import { useStableCallback } from "./use-stable-callback";
import { FadePane } from "./wizard-panes";

export type { ElvixLegalEntityPickerResult, LegalEntityPick };

export type ElvixLegalEntityPickerProps = {
  /** The types offered, in the list and when adding; all three when omitted. */
  types?: LegalEntityType[];
  /** The entity the host holds as picked; `null` or omitted when none yet. */
  selectedId?: string | null;
  /** What the pick lets the host's backend read: `invoicing` (default) or `payouts`. */
  purpose?: LegalEntityPurpose;
  /**
   * A pick: the record (inside an app, personal fields withheld), and whether
   * elvix holds the grant yet. A tap or a new entity is granted; the
   * pre-selected default is not, so grant it from your Continue with
   * `useElvixLegalEntityGrant()`.
   */
  onPick: (entity: LegalEntityRecord, pick: LegalEntityPick) => void;
  /** Every pick's outcome, and a failed save in the add wizard. */
  onResult?: (result: ElvixLegalEntityPickerResult) => void;
  /** Render inside an <ElvixCard>. Default true; false to sit in the host's own pane. */
  card?: boolean;
};

/** The wizard's frame: its panes stack absolutely and need a height. */
const WIZARD_FRAME = { height: "min(520px, 70dvh)", minHeight: 380 } as const;

export function ElvixLegalEntityPicker({
  types,
  selectedId,
  purpose = LegalEntityPurpose.INVOICING,
  onPick,
  onResult,
  card,
}: ElvixLegalEntityPickerProps) {
  const t = useT();
  const report = useStableCallback(onResult);
  const offeredType = (e: LegalEntityRecord) => !types || types.includes(e.type);
  // The picks hook is declared after the flow, so a created entity reaches it
  // through this stable callback.
  const pickCreated = useStableCallback((e: LegalEntityRecord) => {
    if (offeredType(e)) picks.pick(e);
  });
  const flow = useLegalEntities({
    types,
    onCreated: pickCreated,
    onResult: (r) => !r.ok && report(r),
    // An invoice asks only what an invoice needs; payouts walk the full flow.
    kind: purpose === LegalEntityPurpose.INVOICING ? FlowKind.INVOICING : FlowKind.FULL,
  });
  const offered = flow.entities.filter(offeredType);
  const picks = useLegalEntityPicks({
    offered,
    ready: !flow.loading && !flow.loadFailed,
    selectedId,
    purpose,
    onPick,
    onResult,
  });
  const businessOnly = Boolean(types?.length) && (types ?? []).every(needsBusinessSteps);

  return (
    <MaybeCard card={card}>
      {flow.loading ? (
        <div className="grid min-h-24 place-items-center text-fg-3 text-sm">
          {t("common.loading")}
        </div>
      ) : isWizardOpen(flow) ? (
        <WizardFrame flow={flow} types={types} />
      ) : (
        <div className="flex flex-col gap-2">
          {flow.loadFailed && <PickerLoadFailed onRetry={flow.reload} />}
          <PickerList
            entities={offered}
            pickedId={picks.pickedId}
            pendingId={picks.pendingId}
            error={picks.error}
            addLabel={t(businessOnly ? "legalEntities.pickerAddCompany" : "legalEntities.addCta")}
            onPick={picks.pick}
            onAdd={flow.openAdd}
          />
        </div>
      )}
    </MaybeCard>
  );
}

function isWizardOpen(flow: WizardFlow): boolean {
  return isWizardStep(flow.view) || flow.view === View.SAVING;
}

function WizardFrame({ flow, types }: { flow: WizardFlow; types?: LegalEntityType[] }) {
  const t = useT();
  return (
    <div style={WIZARD_FRAME} className="relative overflow-hidden">
      <AnimatePresence initial={false}>
        <FadePane key={flow.view}>
          {flow.view === View.SAVING ? (
            <SavingView label={t("legalEntities.savingEntityLabel")} />
          ) : (
            <WizardStep flow={flow} types={types} />
          )}
        </FadePane>
      </AnimatePresence>
    </div>
  );
}
