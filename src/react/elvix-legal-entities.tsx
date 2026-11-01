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
 *     business:   vat-id → verifying (prefills the name and the address
 *                 search) → legal-name → trading-name → [sole prop: dob →
 *                 place-of-birth → nationality] → registration
 *     no VAT ID:  vat-id → tax-country → tax-ids → legal-name → …
 *     individual: legal-name → dob → place-of-birth → nationality →
 *                 tax-country → tax-ids
 *     then:       address-search → address-review → address-apt-floor
 *                 → contact-choice → [contact-input] → saving → list
 *
 * The step order is `legal-entity-flow.ts` (tested), what each step reads
 * and writes is `legal-entity-payload.ts`, state plus requests are
 * `use-legal-entities.ts`, and the wizard's panes are `legal-entity-steps.tsx`,
 * which `<ElvixLegalEntityPicker>` renders too. Every editable row on the
 * detail view re-enters its step with the entity prefilled; that step's
 * confirm then PATCHes the one field instead of moving on.
 */

import { AnimatePresence } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useT } from "../locale/use-t";
import { MaybeCard } from "./elvix-card";
import { DetailView } from "./legal-entity-detail-view";
import { DefaultConfirmView, DeleteConfirmView, ListView } from "./legal-entity-detail-views";
import { View } from "./legal-entity-flow";
import { EmptyState, SavingView } from "./legal-entity-primitives";
import type { LegalEntityRecord } from "./legal-entity-schema";
import { isWizardStep, type WizardFlow, WizardStep } from "./legal-entity-steps";
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
                {isWizardStep(flow.view) ? <WizardStep flow={flow} /> : <ManagePane flow={flow} />}
              </FadePane>
            )}
          </AnimatePresence>
        </div>
      </MaybeCard>
    </div>
  );
}

/** The list, one entity's detail, and the delete / default confirmations. */
function ManagePane({ flow }: { flow: WizardFlow }): ReactNode | null {
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
          onEdit={flow.editStep}
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
