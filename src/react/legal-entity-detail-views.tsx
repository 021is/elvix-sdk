"use client";

/**
 * The panes that show entities the user already has: the list and the two
 * destructive confirmations. The detail view with its tap-to-edit rows is
 * `legal-entity-detail-view.tsx` (0.18).
 *
 * Separate from the wizard panes because they answer a different question.
 * The wizard asks "what is this entity"; these show "here is what you told
 * us" and let the user change or remove it.
 */

import { Plus, Star, Trash2 } from "lucide-react";

import { useT } from "../locale/use-t";
import { findCountry } from "./countries";
import { ElvixSaveButton, ElvixSaveRow } from "./elvix-save-button";
import { humanType } from "./legal-entity-copy";
import { Heading, Subtitle, typeIcon, WizardHeader } from "./legal-entity-primitives";
import type { LegalEntityRecord, LegalEntityType } from "./legal-entity-schema";

export function ListView({
  entities,
  onAdd,
  onOpen,
  onDelete,
  onToggleDefault,
}: {
  entities: LegalEntityRecord[];
  onAdd: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (id: string, currentlyDefault: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 pt-3 pb-4">
      <button
        type="button"
        onClick={onAdd}
        className="elvix-row group flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-medium text-fg-2 hover:text-[var(--elvix-primary)] cursor-pointer"
      >
        <Plus className="size-4" />
        {t("legalEntities.addAnotherCta")}
      </button>
      {entities.map((e) => {
        const icon = typeIcon(e.type as LegalEntityType);
        const subtitle =
          e.type === "individual"
            ? t("legalEntities.kindIndividual")
            : e.type === "sole_prop"
              ? t("legalEntities.kindSoleProp")
              : t("legalEntities.kindCompany");
        return (
          <div
            key={e.id}
            className="elvix-row group relative flex w-full items-start gap-3 text-left"
          >
            <button
              type="button"
              onClick={() => onOpen(e.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <div className="mt-0.5 text-fg-3 group-hover:text-[var(--elvix-primary)]">{icon}</div>
              <div className="min-w-0 flex-1 pr-20">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[14px] font-semibold text-fg-1">
                    {e.label?.trim() || e.legalName}
                  </div>
                  {e.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] px-2 py-[1px] text-[10px] font-medium text-[var(--elvix-primary)]">
                      <Star className="size-2.5 fill-current" />
                      {t("addressBook.defaultBadge")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
                  {subtitle}
                  {e.tradingName ? ` · ${e.tradingName}` : ""}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-fg-3">
                  {findCountry(e.taxCountry)?.flag ?? ""}{" "}
                  {findCountry(e.taxCountry)?.name ?? e.taxCountry}
                  {e.vatId ? ` · ${e.vatId}` : ""}
                </div>
              </div>
            </button>
            <div className="absolute right-2 top-2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onToggleDefault(e.id, Boolean(e.isDefault));
                }}
                className={
                  "inline-flex size-8 items-center justify-center rounded-md transition cursor-pointer " +
                  (e.isDefault
                    ? "text-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)]"
                    : "text-fg-3 hover:bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] hover:text-[var(--elvix-primary)]")
                }
                aria-label={
                  e.isDefault
                    ? t("legalEntities.removeDefaultAria")
                    : t("legalEntities.setDefaultAria")
                }
              >
                <Star className={e.isDefault ? "size-4 fill-current" : "size-4"} />
              </button>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDelete(e.id);
                }}
                className="inline-flex size-8 items-center justify-center rounded-md text-fg-3 transition hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
                aria-label={t("legalEntities.deleteAria")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DeleteConfirmView({
  entity,
  error,
  onCancel,
  onConfirm,
}: {
  entity: LegalEntityRecord | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  if (!entity) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          {t("legalEntities.deleteEmpty")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onCancel} />
      <Heading>{t("legalEntities.deleteConfirmTitle")}</Heading>
      <Subtitle>{t("legalEntities.deleteConfirmBody")}</Subtitle>
      <div className="elvix-tile mt-4 px-4 py-3">
        <div className="text-[14px] font-semibold text-fg-1">
          {entity.label?.trim() || entity.legalName}
        </div>
        <div className="mt-0.5 text-[12.5px] text-fg-2">
          {humanType(entity.type as LegalEntityType, t)}
        </div>
        {entity.vatId && <div className="mt-0.5 text-[12px] text-fg-3">{entity.vatId}</div>}
      </div>
      <div className="mt-3 rounded-[10px] bg-amber-500/[0.08] px-3 py-2.5">
        <div className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
          {t("legalEntities.sharedAcrossAppsHeading")}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          {t("legalEntities.deleteSharedAcrossAppsBody")}
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("legalEntities.deleteError", { error })}
        </div>
      )}
      <ElvixSaveRow
        leading={
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
          >
            {t("common.cancel")}
          </button>
        }
      >
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-red-600 px-5 text-[14px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_2px_3px_-1px_rgba(0,0,0,0.18),0_0_0_1px_rgba(25,28,33,0.08)] transition hover:bg-red-700 active:scale-[0.985] cursor-pointer"
        >
          <Trash2 className="size-4" />
          {t("legalEntities.yesDelete")}
        </button>
      </ElvixSaveRow>
    </div>
  );
}

export function DefaultConfirmView({
  entity,
  setting,
  error,
  onCancel,
  onConfirm,
}: {
  entity: LegalEntityRecord | null;
  setting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  if (!entity) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          {t("legalEntities.nothingToChange")}
        </button>
      </div>
    );
  }
  const verb = setting ? t("legalEntities.setDefault") : t("legalEntities.removeDefault");
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onCancel} rightLabel={verb} />
      <Heading>
        {setting
          ? t("legalEntities.defaultConfirmTitleSet")
          : t("legalEntities.defaultConfirmTitleUnset")}
      </Heading>
      <Subtitle>
        {setting
          ? t("legalEntities.defaultConfirmBodySet")
          : t("legalEntities.defaultConfirmBodyUnset")}
      </Subtitle>
      <div className="elvix-tile mt-4 px-4 py-3">
        <div className="text-[14px] font-semibold text-fg-1">
          {entity.label?.trim() || entity.legalName}
        </div>
        <div className="mt-0.5 text-[12.5px] text-fg-2">
          {humanType(entity.type as LegalEntityType, t)}
        </div>
      </div>
      <div className="mt-3 rounded-[10px] bg-amber-500/[0.08] px-3 py-2.5">
        <div className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
          {t("legalEntities.sharedAcrossAppsHeading")}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          {setting
            ? t("legalEntities.defaultSharedAcrossAppsBodySet")
            : t("legalEntities.defaultSharedAcrossAppsBodyUnset")}
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("legalEntities.saveError", { error })}
        </div>
      )}
      <ElvixSaveRow
        leading={
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
          >
            {t("common.cancel")}
          </button>
        }
      >
        <ElvixSaveButton
          state="idle"
          onClick={onConfirm}
          label={verb}
          savedLabel={verb}
          hint={null}
          className="!w-auto !px-5"
        />
      </ElvixSaveRow>
    </div>
  );
}
