"use client";

/**
 * `<ElvixSaveButton>` — the reusable Save CTA used by every SDK
 * form. Background = the active brand primary, foreground = the
 * active on-primary (both resolved from `<ElvixProvider>`'s brand
 * chord). Layered shadow + subtle gradient overlay match the
 * Console's canonical primary button so the SDK reads as the same
 * design language whether it's hosted on elvix or embedded in a
 * customer's app.
 *
 * Controlled state machine:
 *
 *   "idle"   — default. Click → caller's onClick fires.
 *   "saving" — disabled, animated spinner.
 *   "saved"  — disabled, ✓ confirmation. Caller drops back to "idle"
 *              after a moment so the button is reusable.
 *
 * A small `kbd` chip on the right surfaces the Enter shortcut.
 * Cmd/Ctrl+S is wired separately via `useSaveShortcut`.
 */

import { Check, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export const ElvixSaveState = {
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
} as const;
export type ElvixSaveState = (typeof ElvixSaveState)[keyof typeof ElvixSaveState];

const SURFACE_STYLE = {
  // Subtle white→transparent gradient overlay for a touch of depth.
  backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
  boxShadow:
    "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 3px -1px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,28,33,0.08)",
} as React.CSSProperties;

const LABEL_SHADOW = {
  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
} as React.CSSProperties;

/**
 * The space between an editor's last field and its Save button. One value
 * for every SDK editor, so no form crowds its button (the identity form's
 * `pt-1` inside `space-y-5` put Save against the pronoun chips) and no two
 * editors differ.
 */
export const SAVE_ROW_GAP = "pt-3";

/**
 * The row that holds an editor's Save button (or its confirm actions), at
 * the shared spacing. `leading` (a Cancel, say) sits at the start; the
 * children end the row. `divided` draws a rule above it, for panes whose
 * content scrolls behind the row.
 */
export function ElvixSaveRow({
  leading,
  divided = false,
  children,
}: {
  leading?: ReactNode;
  divided?: boolean;
  children: ReactNode;
}) {
  const justify = leading ? "justify-between" : "justify-end";
  const rule = divided ? "border-t border-fg-3/10" : "";
  return (
    <div
      data-elvix-save-row=""
      className={`mt-auto flex items-center gap-3 ${SAVE_ROW_GAP} ${justify} ${rule}`}
    >
      {leading}
      {children}
    </div>
  );
}

export function ElvixSaveButton({
  state = "idle",
  disabled = false,
  onClick,
  label = "Save",
  savedLabel = "Saved",
  hint = "Enter",
  className = "",
  autoFocus = false,
}: {
  state?: ElvixSaveState;
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
  savedLabel?: string;
  hint?: string | null;
  className?: string;
  /**
   * Focus the button on mount. Use this on wizard panes that have
   * no input but advertise an "Enter" hint — without a focused form
   * control the browser has nothing to fire the form submission
   * against, so the hint reads as a lie. Focusing the submit button
   * makes Enter actually do something.
   */
  autoFocus?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!pressed) return;
    const t = setTimeout(() => setPressed(false), 140);
    return () => clearTimeout(t);
  }, [pressed]);

  const isDisabled = disabled || state !== "idle";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      autoFocus={autoFocus}
      onClick={(e) => {
        if (isDisabled) return;
        setPressed(true);
        if (!onClick) return; // a plain submit: the enclosing form handles it
        // One press, one save. This is a submit button, so inside a <form>
        // whose onSubmit runs the same action the press used to fire it
        // TWICE (two PATCHes, or a wizard step confirmed twice). Enter's
        // implicit submission also arrives here as a click, so cancelling
        // the submit leaves exactly one path.
        e.preventDefault();
        onClick();
      }}
      style={{
        ...SURFACE_STYLE,
        // CTA paints with `--elvix-primary-strong` — the deeper /
        // more-saturated sibling of `--elvix-primary` — so the
        // button reads as the active "do the thing" surface (the
        // Console's "+ New application" equivalent).
        backgroundColor: "var(--elvix-primary-strong)",
        color: "var(--elvix-on-primary)",
      }}
      className={
        "group relative w-full h-10 px-4 rounded-[10px] " +
        "inline-flex items-center justify-center gap-2.5 " +
        "font-semibold tracking-tight text-[14px] " +
        "ring-1 ring-black/10 " +
        "transition-all duration-150 cursor-pointer " +
        "hover:brightness-95 active:brightness-90 " +
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:brightness-100 " +
        (pressed ? "scale-[0.985] " : "") +
        className
      }
    >
      <span style={LABEL_SHADOW} className="inline-flex items-center gap-1.5">
        <ButtonLabel state={state} label={label} savedLabel={savedLabel} />
      </span>
      {hint ? <KbdHint text={hint} /> : null}
    </button>
  );
}

function ButtonLabel({
  state,
  label,
  savedLabel,
}: {
  state: ElvixSaveState;
  label: string;
  savedLabel: string;
}) {
  let content: ReactNode;
  if (state === "saving") {
    content = (
      <>
        <Loader2 className="size-4 animate-spin" />
        Saving
      </>
    );
  } else if (state === "saved") {
    content = (
      <>
        <Check className="size-4" strokeWidth={2.5} />
        {savedLabel}
      </>
    );
  } else {
    content = label;
  }
  return (
    <span key={state} className="inline-flex items-center gap-1.5">
      {content}
    </span>
  );
}

function KbdHint({ text }: { text: string }) {
  // Inline (not absolute) so the button grows naturally to fit
  // label + hint. The previous absolute layout overlapped the label
  // on auto-width buttons (e.g. `!w-auto` overrides in wizards).
  return (
    <kbd
      aria-hidden
      style={{
        backgroundColor: "color-mix(in srgb, var(--elvix-on-primary) 16%, transparent)",
        color: "color-mix(in srgb, var(--elvix-on-primary) 85%, transparent)",
      }}
      className={
        "inline-flex items-center px-1.5 py-0.5 " +
        "rounded-[6px] text-[10px] font-medium " +
        "group-disabled:opacity-50"
      }
    >
      {text}
    </kbd>
  );
}
