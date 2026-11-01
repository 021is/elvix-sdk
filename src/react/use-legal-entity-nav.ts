"use client";

/**
 * Moving through the add wizard: which pane opens, forward, back, and the
 * three choices that change the route (the type, "No VAT ID", the VAT
 * check's verdict). The order itself is `legal-entity-flow.ts`; this hook
 * only applies it to the draft. Out of `use-legal-entities.ts` in 0.18,
 * shared by `<ElvixLegalEntities>` and `<ElvixLegalEntityPicker>`.
 */

import type { TaxIdValidationState } from "./elvix-tax-id-input";
import { type FlowContext, FlowKind, nextView, previousView, View } from "./legal-entity-flow";
import { stepPatch, stepReady } from "./legal-entity-payload";
import type { LegalEntityInput, LegalEntityType } from "./legal-entity-schema";
import type { LegalEntityDraft, LegalEntityDraftApi } from "./use-legal-entity-draft";

export type WizardNavArgs = {
  draftApi: LegalEntityDraftApi;
  /** The types the host offers; one type skips the type choice. */
  types: readonly LegalEntityType[] | undefined;
  /** The invoice's short flow, or the full one (the default). */
  kind?: FlowKind;
  /** The entity a detail-view edit is changing, else null (adding). */
  editingId: string | null;
  setView: (view: View) => void;
  /** Where the wizard rests when it is left: the list, or the empty state. */
  restingView: () => View;
  /** Leaves the wizard: draft blank, not editing. */
  resetWizard: () => void;
  patch: (id: string, partial: Partial<LegalEntityInput>) => void;
  /** Saves the draft; on a refusal the wizard returns to `from`. */
  commit: (from: View) => void;
};

const contextOf = (d: LegalEntityDraft, kind: FlowKind): FlowContext => ({
  type: d.type,
  hasVatId: d.vatId.trim() !== "",
  withoutVatId: d.withoutVatId,
  kind,
});

/** The one type a host allows, when it allows only one. */
const onlyType = (types: WizardNavArgs["types"]) => (types?.length === 1 ? types[0] : undefined);

export function useLegalEntityNav(a: WizardNavArgs) {
  const { draft, setField } = a.draftApi;
  const kind = a.kind ?? FlowKind.FULL;

  const pickType = (type: LegalEntityType) => {
    setField("type", type);
    const ctx = { ...contextOf(draft, kind), type };
    a.setView(nextView(View.TYPE_CHOICE, ctx) ?? View.LEGAL_NAME);
  };

  /** Leaves `step` forwards: PATCHes it when editing, else the next pane. */
  const advance = (step: View) => {
    if (!stepReady(step, draft)) return;
    const next = nextView(step, contextOf(draft, kind));
    const partial = stepPatch(step, draft);
    if (a.editingId && partial && next !== View.VERIFYING_TAX_ID) a.patch(a.editingId, partial);
    // The contact form shows no error; its question, one pane back, does.
    else if (next === View.SAVING)
      a.commit(step === View.CONTACT_INPUT ? View.CONTACT_CHOICE : step);
    else if (next) a.setView(next);
  };

  /** Back from an add-flow step; while editing, back to the detail view. */
  const back = (step: View) => {
    if (a.editingId) {
      a.resetWizard();
      a.setView(View.DETAIL);
      return;
    }
    const previous = previousView(step, {
      type: draft.type,
      withoutVatId: draft.withoutVatId,
      kind,
    });
    const skipped = previous === View.TYPE_CHOICE && onlyType(a.types) !== undefined;
    if (!previous || skipped) {
      a.resetWizard();
      a.setView(a.restingView());
      return;
    }
    a.setView(previous);
  };

  const openAdd = () => {
    a.resetWizard();
    const type = onlyType(a.types);
    if (type) pickType(type);
    else a.setView(View.TYPE_CHOICE);
  };

  return {
    advance,
    back,
    openAdd,
    pickType,
    /** The flow saves after `step`: its button says so, and a refusal shows there. */
    isLast: (step: View) => nextView(step, contextOf(draft, kind)) === View.SAVING,
    /** The VAT ID was typed: always the check next, whatever was chosen before. */
    confirmVatId: () => {
      setField("withoutVatId", false);
      a.setView(View.VERIFYING_TAX_ID);
    },
    /** A sole proprietor without one: the tax country and tax number instead. */
    chooseNoVatId: () => {
      setField("withoutVatId", true);
      setField("vatId", "");
      a.setView(View.TAX_COUNTRY);
    },
    /** The authority's answer prefills the legal name, unless one was typed. */
    verified: (result: TaxIdValidationState) => {
      setField("vatValidation", result);
      if (result.level === "live" && result.name && !draft.legalName.trim()) {
        setField("legalName", result.name);
      }
    },
  };
}
