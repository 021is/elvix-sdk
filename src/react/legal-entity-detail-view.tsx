"use client";

/**
 * One legal entity, every part tap-to-edit: each row re-enters the wizard
 * step that asks it (`onEdit(step)`), and that step's confirm PATCHes the
 * one field. A business also lists where its e-invoices go.
 * Out of `legal-entity-detail-views.tsx` (0.18), which had passed 500 lines.
 */

import { Star, Trash2 } from "lucide-react";
import { useT } from "../locale/use-t";
import { findCountry } from "./countries";
import { humanType } from "./legal-entity-copy";
import {
  AddressSection,
  ContactSection,
  EInvoiceSection,
  IdentitySection,
  RegistrationSection,
  TaxSection,
} from "./legal-entity-detail-sections";
import { needsBusinessSteps, type View } from "./legal-entity-flow";
import { typeIcon, WizardHeader } from "./legal-entity-primitives";
import type { LegalEntityRecord, LegalEntityType } from "./legal-entity-schema";
import { FADE_MASK } from "./wizard-panes";

export function DetailView(props: {
  entity: LegalEntityRecord | null;
  onBack: () => void;
  onDelete: () => void;
  onToggleDefault: () => void;
  onEdit: (step: View) => void;
}) {
  const t = useT();
  const entity = props.entity;
  if (!entity) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={props.onBack} className="underline cursor-pointer">
          {t("legalEntities.backToList")}
        </button>
      </div>
    );
  }
  const business = needsBusinessSteps(entity.type);
  const section = { entity, onEdit: props.onEdit };
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={props.onBack} />
      <DetailHeader entity={entity} />
      <div
        className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 pt-3 pb-6 grid content-start gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        <IdentitySection {...section} />
        <TaxSection {...section} />
        {business && <RegistrationSection {...section} />}
        <AddressSection {...section} />
        {business && <EInvoiceSection {...section} />}
        <ContactSection {...section} />
      </div>
      <DetailActions
        isDefault={Boolean(entity.isDefault)}
        onDelete={props.onDelete}
        onToggleDefault={props.onToggleDefault}
      />
    </div>
  );
}

function DetailHeader({ entity }: { entity: LegalEntityRecord }) {
  const t = useT();
  const type = entity.type as LegalEntityType;
  const c = findCountry(entity.taxCountry);
  return (
    <div className="elvix-tile px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
          {typeIcon(type, 5)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[15px] font-semibold text-fg-1">
              {entity.label?.trim() || entity.legalName}
            </div>
            {entity.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] px-2 py-[1px] text-[10px] font-medium text-[var(--elvix-primary)]">
                <Star className="size-2.5 fill-current" />
                {t("addressBook.defaultBadge")}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] leading-snug text-fg-2">
            {humanType(type, t)}
            {entity.tradingName ? ` · ${entity.tradingName}` : ""} · {c?.flag}{" "}
            {c?.name ?? entity.taxCountry}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailActions(props: {
  isDefault: boolean;
  onDelete: () => void;
  onToggleDefault: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-3 flex items-center gap-2 pt-2">
      <button
        type="button"
        onClick={props.onDelete}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] text-fg-3 transition hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
      >
        <Trash2 className="size-3.5" />
        {t("common.delete")}
      </button>
      <div className="ml-auto">
        <button
          type="button"
          onClick={props.onToggleDefault}
          className="elvix-row inline-flex h-10 items-center gap-1.5 px-4 text-[13px] font-medium text-fg-1 active:scale-[0.985] cursor-pointer"
        >
          <Star
            className={
              props.isDefault
                ? "size-3.5 fill-[var(--elvix-primary)] text-[var(--elvix-primary)]"
                : "size-3.5"
            }
          />
          {props.isDefault ? t("legalEntities.removeDefault") : t("legalEntities.setDefault")}
        </button>
      </div>
    </div>
  );
}
