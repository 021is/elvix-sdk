"use client";

/**
 * A legal-entity step's own chrome: its header (Back), its question, and its
 * action (Continue, Skip, Save). Every step of the add and edit wizards draws
 * them through these three (0.23), so a step never builds its own Back or
 * save row. The buttons are elvix's, in elvix's card: hosts mount the picker
 * as it is (Edvard, 2026-11-02: "this is also advertisement for elvix").
 */

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../locale/use-t";
import { ElvixSaveButton, ElvixSaveRow } from "./elvix-save-button";

export function WizardHeader({
  onBack,
  backLabel,
  stepLabel,
  rightLabel,
}: {
  onBack: () => void;
  backLabel?: string;
  stepLabel?: string;
  rightLabel?: string;
}) {
  const t = useT();
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
      >
        <ArrowLeft className="size-3.5" />
        {backLabel ?? t("common.back")}
      </button>
      <div className="ml-auto text-[12px] text-fg-3">{rightLabel ?? stepLabel ?? ""}</div>
    </div>
  );
}

/** The step's question. */
export function Heading({ children }: { children: ReactNode }) {
  return <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">{children}</h2>;
}

/**
 * The step's one action. `onBack` draws an in-row Back beside it; `leading`
 * and `children` are the row's other content (a link, the reason it is
 * blocked).
 */
export function StepAction({
  label,
  disabled = false,
  onConfirm,
  hint = null,
  onBack,
  leading,
  children,
}: {
  label: string;
  disabled?: boolean;
  onConfirm: () => void;
  hint?: string | null;
  onBack?: () => void;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <ElvixSaveRow leading={leading ?? (onBack && <RowBack onBack={onBack} />)}>
      {children}
      <ElvixSaveButton
        state="idle"
        disabled={disabled}
        onClick={() => !disabled && onConfirm()}
        label={label}
        savedLabel={label}
        hint={hint}
        className="!w-auto !px-5"
      />
    </ElvixSaveRow>
  );
}

function RowBack({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onBack}
      className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
    >
      {t("common.back")}
    </button>
  );
}
