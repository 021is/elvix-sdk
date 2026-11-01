"use client";

/**
 * The picker's list: one row per entity, the picked one tinted
 * (`aria-pressed`), and the row that adds one. Rows show what an invoice
 * will say: the legal name, then the VAT ID (or the tax number) and the
 * city, and "Verified" only when elvix's own check confirmed the VAT ID and
 * the register's name does not differ (else a quiet "name differs"). No
 * trading name, no default star, no delete: the picker picks, the manager
 * (`<ElvixLegalEntities>`) manages.
 */

import { AlertTriangle, BadgeCheck, Loader2, Plus } from "lucide-react";
import { useT } from "../locale/use-t";
import { useElvixApp } from "./elvix-provider";
import { LegalEntityPurpose, type LegalEntityRecord, VatNameMatch } from "./legal-entity-schema";
import { ErrorLine } from "./sign-in-controls";
import { NETWORK, PICKER_MISSING_CLIENT_ID } from "./use-legal-entity-picks";

type T = ReturnType<typeof useT>;

/** Line 2 of a row: what identifies the entity on an invoice, and where it is. */
export function rowDetail(e: LegalEntityRecord): string {
  return [e.vatId || e.taxId, e.addressCity].filter(Boolean).join(" · ");
}

export const VatMark = { VERIFIED: "verified", NAME_MISMATCH: "name-mismatch" } as const;
export type VatMark = (typeof VatMark)[keyof typeof VatMark];

/**
 * The row's VAT mark. A confirmed number proves only that it is registered
 * (German ones are public); when the register's name differs from the legal
 * name, the row says so instead of "Verified" (0.18).
 */
export function vatMark(e: LegalEntityRecord): VatMark | null {
  if (e.vatIdValidation !== "live") return null;
  return e.vatIdNameMatch === VatNameMatch.MISMATCH ? VatMark.NAME_MISMATCH : VatMark.VERIFIED;
}

/** A refused pick, worded with its cause and what to do. */
export function pickErrorCopy(error: string, t: T): string {
  if (error === PICKER_MISSING_CLIENT_ID) return t("legalEntities.pickerMissingClientId");
  if (error === NETWORK) return t("common.errorNetwork");
  return t("legalEntities.pickerGrantFailed", { error });
}

/**
 * What a payouts pick shares, said before the user picks; an invoicing pick
 * shares only the record, so nothing is said. The host chooses the purpose,
 * so without this line a pick could share birth data unannounced (second
 * security review, 2026-11-01).
 */
export function PurposeNote({ purpose }: { purpose: LegalEntityPurpose }) {
  const t = useT();
  const app = useElvixApp()?.appName?.trim() || t("passkeys.thisApp");
  if (purpose !== LegalEntityPurpose.PAYOUTS) return null;
  return (
    <p role="note" className="m-0 text-[12.5px] leading-[1.5] text-fg-3">
      {t("legalEntities.pickerPayoutsNote", { app })}
    </p>
  );
}

type ListProps = {
  entities: LegalEntityRecord[];
  pickedId: string | null;
  pendingId: string | null;
  error: { entityId: string | null; error: string } | null;
  addLabel: string;
  onPick: (record: LegalEntityRecord) => void;
  onAdd: () => void;
};

export function PickerList(p: ListProps) {
  const t = useT();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="sr-only">{t("legalEntities.pickerGroupLabel")}</legend>
      {p.entities.map((e) => (
        <div key={e.id} className="flex flex-col gap-1">
          <PickerRow
            entity={e}
            picked={p.pickedId === e.id}
            pending={p.pendingId === e.id}
            disabled={p.pendingId !== null}
            onPick={() => p.onPick(e)}
          />
          {p.error?.entityId === e.id && (
            <PickError error={p.error.error} onRetry={() => p.onPick(e)} />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={p.onAdd}
        disabled={p.pendingId !== null}
        className="elvix-row flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-fg-2 cursor-pointer"
      >
        <Plus className="size-4" aria-hidden />
        {p.addLabel}
      </button>
    </fieldset>
  );
}

function PickerRow(p: {
  entity: LegalEntityRecord;
  picked: boolean;
  pending: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const mark = vatMark(p.entity);
  return (
    <button
      type="button"
      aria-pressed={p.picked}
      aria-busy={p.pending || undefined}
      disabled={p.disabled && !p.pending}
      onClick={p.onPick}
      className="elvix-row flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer"
    >
      <span className="min-w-0 flex-1">
        <span className="elvix-row-title block truncate text-[14px] font-semibold">
          {p.entity.legalName}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-fg-3">{rowDetail(p.entity)}</span>
      </span>
      {mark && <VatMarkChip mark={mark} />}
      {p.pending && <Loader2 className="size-4 shrink-0 animate-spin text-fg-3" aria-hidden />}
    </button>
  );
}

function VatMarkChip({ mark }: { mark: VatMark }) {
  const t = useT();
  const mismatch = mark === VatMark.NAME_MISMATCH;
  const Icon = mismatch ? AlertTriangle : BadgeCheck;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium ${mismatch ? "text-fg-3" : "text-fg-2"}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {mismatch ? t("legalEntities.nameMismatch") : t("legalEntities.verifiedBadge")}
    </span>
  );
}

function PickError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = useT();
  const retry = error !== PICKER_MISSING_CLIENT_ID;
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <ErrorLine error={pickErrorCopy(error, t)} />
      {retry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-fg-2 hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

/** The list could not be read: said so, with a retry, never an empty list. */
export function PickerLoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2">
      <ErrorLine error={t("legalEntities.pickerLoadFailed")} />
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-fg-2 hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
