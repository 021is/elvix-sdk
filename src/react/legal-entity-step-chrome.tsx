"use client";

/**
 * A legal-entity step's own controls: its header (Back), its question, and
 * its action (Continue, Skip, Save). Every step of the add and edit wizards
 * draws them through these three, so a host can take them over (0.23).
 *
 * Without a host (`<ElvixLegalEntities>`, or the picker without `controls`)
 * they render as they always did. Inside a picker given `controls`
 * (`useElvixLegalEntityPickerControls`), the header and the action render
 * nothing and publish instead: the action its label, whether the step can
 * continue and how to run it; the header how to go back; the heading the
 * step's question. The host's own bar shows the only Back and Continue.
 */

import { ArrowLeft } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useT } from "../locale/use-t";
import { ElvixSaveButton, ElvixSaveRow } from "./elvix-save-button";
import { useStableCallback } from "./use-stable-callback";

/** What a step publishes to the host that drives it. */
export type StepHost = {
  setAction: (action: { label: string; canContinue: boolean } | null, run: () => void) => void;
  setBack: (run: (() => void) | null) => void;
  setTitle: (title: string | null) => void;
};

const StepHostContext = createContext<StepHost | null>(null);

/** Hands a step's controls to `host`; `null` draws them in the pane. */
export const StepHostProvider = StepHostContext.Provider;

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
  const host = useContext(StepHostContext);
  const back = useStableCallback(onBack);
  useEffect(() => {
    if (!host) return;
    host.setBack(back);
    return () => host.setBack(null);
  }, [host, back]);
  if (host) return null;
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

/** The step's question. Stays in the pane with a host, which also gets its words. */
export function Heading({ children }: { children: ReactNode }) {
  const host = useContext(StepHostContext);
  const title = typeof children === "string" ? children : null;
  useEffect(() => {
    if (!host) return;
    host.setTitle(title);
    return () => host.setTitle(null);
  }, [host, title]);
  return <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">{children}</h2>;
}

/**
 * The step's one action. `onBack` draws an in-row Back beside it (a host's
 * own Back covers it); `leading` and `children` are the row's other content
 * (a link, the reason it is blocked), which stays in the pane either way.
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
  const host = useContext(StepHostContext);
  // The step's own guard, not only the host's snapshot of it (0.23 review).
  const run = useStableCallback(() => {
    if (!disabled) onConfirm();
  });
  useEffect(() => {
    if (!host) return;
    host.setAction({ label, canContinue: !disabled }, run);
    return () => host.setAction(null, run);
  }, [host, label, disabled, run]);
  if (host) {
    return leading || children ? <ElvixSaveRow leading={leading}>{children}</ElvixSaveRow> : null;
  }
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
